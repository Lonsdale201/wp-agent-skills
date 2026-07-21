#!/usr/bin/env sh
#
# sync-skills.sh — download the wp-agent-skills collection into a local
# directory using the published skills-index.json manifest.
#
# No git, no clone, no fork required: plain HTTPS + the JSON manifest.
# This is intentionally defensive — you are pulling files from the internet
# into a directory an AI agent will read — so it fails closed on anything
# unexpected:
#
#   * URLs are RECONSTRUCTED from a hardcoded, pinned repo base below. The
#     manifest is NEVER used to decide which host to fetch from, so a tampered
#     manifest cannot redirect a download to another server.
#   * Every path from the manifest is validated (no "..", no absolute paths,
#     no backslashes, no "~", safe charset only) AND confined under DEST, so a
#     tampered manifest cannot write outside the directory you chose.
#   * Every file is checked against the sha256 AND byte size in the manifest
#     before it is written. Any mismatch is a hard error; nothing partial or
#     unverified is ever moved into place.
#   * Downloads use HTTPS only (TLS >= 1.2), no redirect-following, and a
#     per-file size cap.
#   * Files are written non-executable (0644). This script NEVER executes
#     anything it downloads — skills are Markdown/YAML documents.
#   * It refuses to write where the target already exists as a symlink or any
#     non-regular file (so a planted symlink can't redirect a write), and a
#     directory that can't be created skips that entry instead of aborting.
#   * It only adds/updates files. It never deletes local files (no prune).
#
# Trust model: the manifest is the trust root. You are trusting "GitHub,
# serving Lonsdale201/wp-agent-skills over TLS". The script guarantees you get
# exactly the bytes that repository published (correct host, correct path,
# matching hash) and that nothing lands outside your destination — it does NOT
# vouch for the *content* of the skills. Review third-party skills before
# pointing an agent at them, the same as any other untrusted prompt input.
#
# Usage:
#   sh sync-skills.sh [DEST]
#
#   DEST defaults to $WP_SKILLS_DIR, else ./skills
#   Point it wherever YOUR agent runtime loads skills from — this script is
#   not tied to any single tool. Examples:
#       Claude Code, global:   ~/.claude/skills
#       Claude Code, project:  .claude/skills
#       any other runtime:     the folder that tool reads skill directories from
#
#   Optional filter (space-separated domain allowlist; empty = all):
#       WP_SKILLS_DOMAINS="woocommerce wordpress" sh sync-skills.sh ~/.claude/skills
#
# Requires: curl, jq, and sha256sum OR shasum.

set -eu

# --- pinned source (edit only to point at a fork you control) -------------
REPO_BASE="https://raw.githubusercontent.com/Lonsdale201/wp-agent-skills/main"
INDEX_URL="${REPO_BASE}/skills-index.json"
MAX_BYTES=5242880   # 5 MiB per-file backstop

DEST="${1:-${WP_SKILLS_DIR:-./skills}}"
DOMAINS="${WP_SKILLS_DOMAINS:-}"

# --- dependencies ---------------------------------------------------------
need() { command -v "$1" >/dev/null 2>&1 || { echo "error: '$1' is required but not found" >&2; exit 3; }; }
need curl
need jq
if command -v sha256sum >/dev/null 2>&1; then
  sha256_of() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_of() { shasum -a 256 "$1" | cut -d' ' -f1; }
else
  echo "error: need 'sha256sum' or 'shasum' for verification" >&2; exit 3
fi

# HTTPS only, no redirects, size-capped, time-limited.
fetch() {
  curl --fail --silent --show-error \
       --proto '=https' --tlsv1.2 \
       --max-filesize "$MAX_BYTES" --max-time 60 \
       -o "$2" -- "$1"
}

# Reject any manifest path that could escape the destination directory.
safe_path() {
  case "$1" in
    "" | /* | *..* | *'\'* | *'~'* ) return 1 ;;   # empty / absolute / .. / backslash / ~
    *[!A-Za-z0-9._/-]* )             return 1 ;;   # anything outside a safe charset
    * )                              return 0 ;;
  esac
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/wp-agent-skills.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT INT TERM

echo "Fetching manifest: $INDEX_URL"
fetch "$INDEX_URL" "$TMP/index.json"

mkdir -p "$DEST"
DEST_ABS="$(cd "$DEST" && pwd -P)"

# One "<repo_path>\t<sha256>\t<bytes>" line per file (SKILL.md + each resource).
jq -r --arg domains "$DOMAINS" '
  .skills[]
  | . as $s
  | select($domains == "" or ( ($domains | split(" ")) | (index($s.domain)) != null ))
  | ( [ $s.skill_path, $s.skill_md.sha256, ($s.skill_md.bytes | tostring) ]
    , ( $s.resources[]? | [ .repo_path, .sha256, (.bytes | tostring) ] ) )
  | @tsv
' "$TMP/index.json" | tr -d '\r' > "$TMP/list.tsv"   # strip CR (jq on Windows writes CRLF)

added=0; updated=0; unchanged=0; failed=0
TAB="$(printf '\t')"

# NOTE: read from a file (not a pipe) so counters survive the loop.
while IFS="$TAB" read -r rpath rsha rbytes; do
  [ -n "$rpath" ] || continue

  if ! safe_path "$rpath"; then
    echo "  ! SKIP unsafe path from manifest: $rpath" >&2; failed=$((failed+1)); continue
  fi

  target="${DEST_ABS}/${rpath}"
  parent="$(dirname "$target")"
  if ! mkdir -p "$parent" 2>/dev/null; then
    echo "  ! SKIP cannot create directory for: $rpath" >&2; failed=$((failed+1)); continue
  fi
  # Confinement: the created parent must still resolve inside DEST.
  case "$(cd "$parent" && pwd -P)/" in
    "$DEST_ABS"/*) : ;;
    *) echo "  ! SKIP path escapes destination: $rpath" >&2; failed=$((failed+1)); continue ;;
  esac

  # Never write through a pre-existing symlink or non-regular file (a symlink
  # here could make mv/cp follow it outside DEST on some platforms). Fail closed.
  if [ -L "$target" ] || { [ -e "$target" ] && [ ! -f "$target" ]; }; then
    echo "  ! SKIP target exists and is not a regular file: $rpath" >&2; failed=$((failed+1)); continue
  fi

  # Already have the exact bytes? Skip the download.
  if [ -f "$target" ] && [ "$(sha256_of "$target")" = "$rsha" ]; then
    unchanged=$((unchanged+1)); continue
  fi

  url="${REPO_BASE}/${rpath}"
  if ! fetch "$url" "$TMP/dl"; then
    echo "  ! FAIL download: $rpath" >&2; failed=$((failed+1)); continue
  fi

  got_bytes="$(wc -c < "$TMP/dl" | tr -d ' ')"
  if [ "$got_bytes" != "$rbytes" ]; then
    echo "  ! FAIL size ${got_bytes} != ${rbytes} (manifest): $rpath" >&2; failed=$((failed+1)); continue
  fi

  got_sha="$(sha256_of "$TMP/dl")"
  if [ "$got_sha" != "$rsha" ]; then
    echo "  ! FAIL sha256 mismatch: $rpath" >&2; failed=$((failed+1)); continue
  fi

  if [ -f "$target" ]; then updated=$((updated+1)); else added=$((added+1)); fi
  mv "$TMP/dl" "$target"
  chmod 644 "$target"
done < "$TMP/list.tsv"

echo "Done. added=${added} updated=${updated} unchanged=${unchanged} failed=${failed}  ->  ${DEST}"
[ "$failed" -eq 0 ]
