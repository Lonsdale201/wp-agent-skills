<?php
/**
 * Plugin Name: ACF Skills Storage Smoke
 * Description: Disposable WP-CLI characterization tests for ACF value storage and formatting.
 * Version: 1.0.0
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 */

defined( 'ABSPATH' ) || exit;

add_action(
	'acf/include_field_types',
	static function (): void {
		if ( ! class_exists( 'acf_field' ) || class_exists( 'ACF_Skills_JSON_Field', false ) ) {
			return;
		}

		class ACF_Skills_JSON_Field extends acf_field {
			public function initialize() {
				$this->name        = 'acf_skills_json';
				$this->label       = __( 'Smoke JSON', 'acf-skills-smoke' );
				$this->category    = 'advanced';
				$this->description = __( 'Stores a JSON object as an array.', 'acf-skills-smoke' );
				$this->defaults    = array();
			}

			public function render_field( $field ) {
				$value = is_array( $field['value'] ) ? wp_json_encode( $field['value'] ) : (string) $field['value'];
				printf(
					'<textarea name="%s" rows="5">%s</textarea>',
					esc_attr( $field['name'] ),
					esc_textarea( $value )
				);
			}

			public function validate_value( $valid, $value, $field, $input ) {
				if ( true !== $valid || is_array( $value ) || '' === $value ) {
					return $valid;
				}

				json_decode( (string) $value, true );
				return JSON_ERROR_NONE === json_last_error()
					? true
					: __( 'Enter a valid JSON object.', 'acf-skills-smoke' );
			}

			public function update_value( $value, $post_id, $field ) {
				if ( is_array( $value ) || '' === $value || null === $value ) {
					return $value;
				}

				$decoded = json_decode( (string) $value, true );
				return JSON_ERROR_NONE === json_last_error() ? $decoded : null;
			}
		}

		acf_register_field_type( 'ACF_Skills_JSON_Field' );
	}
);

add_action(
	'acf/init',
	static function (): void {
		$fields = array(
			array(
				'key'   => 'field_acf_skills_smoke_title',
				'label' => 'Title',
				'name'  => 'acf_skills_smoke_title',
				'type'  => 'text',
			),
			array(
				'key'           => 'field_acf_skills_smoke_related',
				'label'         => 'Related posts',
				'name'          => 'acf_skills_smoke_related',
				'type'          => 'relationship',
				'post_type'     => array( 'post' ),
				'return_format' => 'id',
			),
			array(
				'key'        => 'field_acf_skills_smoke_group',
				'label'      => 'Group',
				'name'       => 'acf_skills_smoke_group',
				'type'       => 'group',
				'sub_fields' => array(
					array(
						'key'   => 'field_acf_skills_smoke_group_label',
						'label' => 'Label',
						'name'  => 'label',
						'type'  => 'text',
					),
				),
			),
			array(
				'key'   => 'field_acf_skills_smoke_payload',
				'label' => 'Payload',
				'name'  => 'acf_skills_smoke_payload',
				'type'  => 'acf_skills_json',
			),
		);

		if ( function_exists( 'acf_get_field_type' ) && acf_get_field_type( 'repeater' ) ) {
			$fields[] = array(
				'key'        => 'field_acf_skills_smoke_rows',
				'label'      => 'Rows',
				'name'       => 'acf_skills_smoke_rows',
				'type'       => 'repeater',
				'layout'     => 'table',
				'sub_fields' => array(
					array(
						'key'   => 'field_acf_skills_smoke_row_label',
						'label' => 'Label',
						'name'  => 'label',
						'type'  => 'text',
					),
				),
			);
		}

		acf_add_local_field_group(
			array(
				'key'      => 'group_acf_skills_smoke',
				'title'    => 'ACF Skills Smoke',
				'fields'   => $fields,
				'location' => array(
					array(
						array(
							'param'    => 'post_type',
							'operator' => '==',
							'value'    => 'post',
						),
					),
				),
			)
		);
	}
);

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	return;
}

final class ACF_Skills_Storage_Smoke_Command {
	private $results = array();
	private $post_ids = array();
	private $user_id = 0;
	private $term_id = 0;
	private $option_post_id = '';

	private function check( $name, $condition, $actual = null ): void {
		$result = array(
			'test' => $name,
			'pass' => (bool) $condition,
		);

		if ( ! $condition && null !== $actual ) {
			$result['actual'] = $actual;
		}

		$this->results[] = $result;
	}

	private function create_fixtures( $suffix ): void {
		$this->post_ids[] = wp_insert_post(
			array(
				'post_title'  => 'ACF skills smoke ' . $suffix,
				'post_status' => 'private',
				'post_type'   => 'post',
			)
		);
		$this->post_ids[] = wp_insert_post(
			array(
				'post_title'  => 'ACF skills related ' . $suffix,
				'post_status' => 'private',
				'post_type'   => 'post',
			)
		);

		$this->user_id = wp_insert_user(
			array(
				'user_login' => 'acf-skills-' . $suffix,
				'user_pass'  => wp_generate_password( 24 ),
				'user_email' => 'acf-skills-' . $suffix . '@example.test',
				'role'       => 'subscriber',
			)
		);

		$term = wp_insert_term( 'ACF skills ' . $suffix, 'category', array( 'slug' => 'acf-skills-' . $suffix ) );
		if ( is_wp_error( $term ) ) {
			throw new RuntimeException( 'Term fixture creation failed.' );
		}
		$this->term_id        = (int) $term['term_id'];
		$this->option_post_id = 'option_acf_skills_' . $suffix;

		if ( is_wp_error( $this->user_id ) || in_array( 0, $this->post_ids, true ) || in_array( false, $this->post_ids, true ) ) {
			throw new RuntimeException( 'Fixture creation failed.' );
		}
	}

	private function exercise_post_storage(): void {
		$post_id    = $this->post_ids[0];
		$related_id = $this->post_ids[1];

		update_field( 'field_acf_skills_smoke_title', 'Smoke <script>bad()</script>', $post_id );
		$this->check( 'post-value-row', 'Smoke <script>bad()</script>' === get_post_meta( $post_id, 'acf_skills_smoke_title', true ) );
		$this->check( 'post-reference-row', 'field_acf_skills_smoke_title' === get_post_meta( $post_id, '_acf_skills_smoke_title', true ) );
		$this->check( 'get-field-formatted', 'Smoke <script>bad()</script>' === get_field( 'acf_skills_smoke_title', $post_id ) );
		$escaped = get_field( 'acf_skills_smoke_title', $post_id, true, true );
		$this->check( 'get-field-escaped', false === strpos( $escaped, '<script' ), $escaped );

		update_field( 'field_acf_skills_smoke_related', array( $related_id ), $post_id );
		$this->check( 'relationship-raw-ids', array( $related_id ) === array_map( 'intval', get_post_meta( $post_id, 'acf_skills_smoke_related', true ) ) );
		$this->check( 'relationship-return-format-id', array( $related_id ) === array_map( 'intval', get_field( 'acf_skills_smoke_related', $post_id ) ) );

		update_field( 'field_acf_skills_smoke_group', array( 'label' => 'Nested value' ), $post_id );
		$this->check( 'group-subfield-row', 'Nested value' === get_post_meta( $post_id, 'acf_skills_smoke_group_label', true ) );
		$this->check( 'group-subfield-reference', 'field_acf_skills_smoke_group_label' === get_post_meta( $post_id, '_acf_skills_smoke_group_label', true ) );
		$this->check( 'group-formatted-array', array( 'label' => 'Nested value' ) === get_field( 'acf_skills_smoke_group', $post_id ) );

		if ( acf_get_field( 'field_acf_skills_smoke_rows' ) ) {
			update_field(
				'field_acf_skills_smoke_rows',
				array(
					array( 'field_acf_skills_smoke_row_label' => 'First' ),
					array( 'field_acf_skills_smoke_row_label' => 'Second' ),
				),
				$post_id
			);
			$this->check( 'repeater-parent-count', 2 === (int) get_post_meta( $post_id, 'acf_skills_smoke_rows', true ) );
			$this->check( 'repeater-subfield-row', 'First' === get_post_meta( $post_id, 'acf_skills_smoke_rows_0_label', true ) );
			$this->check( 'repeater-subfield-reference', 'field_acf_skills_smoke_row_label' === get_post_meta( $post_id, '_acf_skills_smoke_rows_0_label', true ) );
			$rows = get_field( 'acf_skills_smoke_rows', $post_id );
			$this->check( 'repeater-formatted-rows', is_array( $rows ) && 2 === count( $rows ) && 'Second' === $rows[1]['label'], $rows );
		}

		update_field( 'field_acf_skills_smoke_payload', '{"enabled":true,"count":3}', $post_id );
		$expected = array( 'enabled' => true, 'count' => 3 );
		$this->check( 'custom-field-update-value', $expected === get_post_meta( $post_id, 'acf_skills_smoke_payload', true ), get_post_meta( $post_id, 'acf_skills_smoke_payload', true ) );
		$this->check( 'custom-field-format-value', $expected === get_field( 'acf_skills_smoke_payload', $post_id ), get_field( 'acf_skills_smoke_payload', $post_id ) );
	}

	private function exercise_other_locations(): void {
		$value = 'Cross-location value';

		update_field( 'field_acf_skills_smoke_title', $value, 'user_' . $this->user_id );
		$this->check( 'user-value-row', $value === get_user_meta( $this->user_id, 'acf_skills_smoke_title', true ) );
		$this->check( 'user-reference-row', 'field_acf_skills_smoke_title' === get_user_meta( $this->user_id, '_acf_skills_smoke_title', true ) );

		update_field( 'field_acf_skills_smoke_title', $value, 'term_' . $this->term_id );
		$this->check( 'term-value-row', $value === get_term_meta( $this->term_id, 'acf_skills_smoke_title', true ) );
		$this->check( 'term-reference-row', 'field_acf_skills_smoke_title' === get_term_meta( $this->term_id, '_acf_skills_smoke_title', true ) );

		update_field( 'field_acf_skills_smoke_title', $value, $this->option_post_id );
		$this->check( 'option-value-row', $value === get_option( $this->option_post_id . '_acf_skills_smoke_title' ) );
		$this->check( 'option-reference-row', 'field_acf_skills_smoke_title' === get_option( '_' . $this->option_post_id . '_acf_skills_smoke_title' ) );
		$this->check( 'option-get-field', $value === get_field( 'acf_skills_smoke_title', $this->option_post_id ) );
	}

	private function cleanup(): void {
		foreach ( $this->post_ids as $post_id ) {
			wp_delete_post( $post_id, true );
		}

		if ( $this->term_id ) {
			wp_delete_term( $this->term_id, 'category' );
		}

		if ( $this->user_id && ! is_wp_error( $this->user_id ) ) {
			require_once ABSPATH . 'wp-admin/includes/user.php';
			wp_delete_user( $this->user_id );
		}

		if ( $this->option_post_id ) {
			delete_field( 'field_acf_skills_smoke_title', $this->option_post_id );
			delete_option( $this->option_post_id . '_acf_skills_smoke_title' );
			delete_option( '_' . $this->option_post_id . '_acf_skills_smoke_title' );
		}
	}

	/**
	 * Run the storage checks and remove every fixture afterward.
	 *
	 * ## OPTIONS
	 *
	 * [--confirm-disposable]
	 * : Confirm that writes and immediate fixture cleanup are allowed.
	 */
	public function run( $args, $assoc_args ): void {
		if ( empty( $assoc_args['confirm-disposable'] ) || ! defined( 'ACF_SKILLS_SMOKE_ALLOW_WRITES' ) || true !== ACF_SKILLS_SMOKE_ALLOW_WRITES ) {
			WP_CLI::error( 'Requires ACF_SKILLS_SMOKE_ALLOW_WRITES=true and --confirm-disposable.' );
		}

		if ( ! defined( 'ACF_VERSION' ) || '6.8.10' !== ACF_VERSION ) {
			WP_CLI::error( 'This characterization suite is pinned to ACF 6.8.10.' );
		}

		$suffix = strtolower( wp_generate_password( 12, false, false ) );

		try {
			$this->create_fixtures( $suffix );
			$this->exercise_post_storage();
			$this->exercise_other_locations();
		} catch ( Throwable $error ) {
			$this->check( 'runtime-exception-' . get_class( $error ), false, $error->getMessage() );
		} finally {
			$this->cleanup();
		}

		$failed = count(
			array_filter(
				$this->results,
				static function ( $result ) {
					return ! $result['pass'];
				}
			)
		);

		WP_CLI::line(
			wp_json_encode(
				array(
					'versions' => array(
						'wordpress' => get_bloginfo( 'version' ),
						'acf'       => ACF_VERSION,
						'edition'   => function_exists( 'acf_add_options_page' ) ? 'pro' : 'free',
						'php'       => PHP_VERSION,
					),
					'failed'  => $failed,
					'results' => $this->results,
				),
				JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
			)
		);

		if ( $failed ) {
			WP_CLI::halt( 1 );
		}
	}
}

WP_CLI::add_command( 'acf-skills-smoke', 'ACF_Skills_Storage_Smoke_Command' );
