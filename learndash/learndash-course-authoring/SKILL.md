---
name: learndash-course-authoring
description: >-
  Author a complete LearnDash course from code or structured data: course,
  lessons, topics, section headings, quizzes with real ProQuiz masters, and
  quiz questions (single, multiple, free_answer, essay). Use when importing or
  seeding courses from JSON/CSV/Markdown, migrating an LMS, generating course
  content, or when code touches wp_insert_post with sfwd-courses /
  sfwd-lessons / sfwd-quiz / sfwd-question, quiz_pro_id, ld_quiz_questions,
  ld_course_steps, course_sections, WpProQuiz_Model_Quiz,
  WpProQuiz_Model_Question, WpProQuiz_Model_AnswerTypes, QuizMapper,
  QuestionMapper, LDLMS_Factory_Post, set_steps, set_questions, or
  learndash_proquiz_sync_question_fields. Also use when a programmatically
  created quiz shows up empty in the admin quiz builder, when questions do not
  render on the front end, or when a quiz will not nest under its lesson.
metadata:
  wp-skills-author: "Soczo Kristof"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "sfwd-lms"
  wp-skills-plugin-version-tested: "5.1.9"
  wp-skills-wp-version-tested: "7.0.3"
  wp-skills-php-min: "8.0"
  wp-skills-last-updated: "2026-08-11"
---

# LearnDash course authoring (programmatic course, lessons, quizzes, questions)

Builds a complete, front-end-functional LearnDash course from code: the course post, its lessons and topics, section headings, quizzes backed by real ProQuiz master rows, and the questions inside them. This is the write-side counterpart to the read/access skills: it does not decide who may see a course (that is `learndash-course-access`) and it does not touch learner progress (that is `learndash-course-progress`).

The trap this skill exists to prevent: `wp_insert_post( [ 'post_type' => 'sfwd-quiz' ] )` produces a quiz that looks fine in the post list and is completely broken as a quiz. LearnDash keeps quiz definitions and questions in the ProQuiz tables (`wp_pro_quiz_master`, `wp_pro_quiz_question`), and keeps the course outline and the quiz question list in cached post meta trees. Create the posts only, and you get an empty quiz builder, no questions on the front end, and a flat outline.

## When to use this skill

Trigger this skill when ANY of the following is true:

- The user wants to import, seed, generate, or migrate LearnDash course content from JSON, CSV, Markdown, another LMS, or an AI-generated outline.
- The user asks to create quizzes or quiz questions in code, via WP-CLI, in a REST endpoint, or from an importer.
- The diff or file contains `sfwd-quiz`, `sfwd-question`, `quiz_pro_id`, `ld_quiz_questions`, `ld_course_steps`, `course_sections`, `WpProQuiz_Model_`, `QuizMapper`, `QuestionMapper`, `LDLMS_Factory_Post::course_steps`, `LDLMS_Factory_Post::quiz_questions`, or `learndash_proquiz_sync_question_fields`.
- A programmatically created quiz renders no questions, shows an empty admin quiz builder, or reports zero questions.
- A quiz refuses to appear under its lesson, or lessons appear in the wrong order, or section headings are missing from the outline.

Do NOT trigger for: granting course access, reading or writing progress, or plain REST reads. Those have their own skills.

## The object model, in the order it must be written

| Layer | Where it lives | Written by |
|---|---|---|
| Course, lesson, topic, quiz | posts (`sfwd-courses`, `sfwd-lessons`, `sfwd-topic`, `sfwd-quiz`) | `wp_insert_post` |
| Per-post LearnDash settings | `_sfwd-courses` / `_sfwd-lessons` / `_sfwd-topic` / `_sfwd-quiz` meta arrays | `learndash_update_setting()` |
| Quiz definition | `wp_pro_quiz_master` row | `WpProQuiz_Model_QuizMapper::save()` |
| Question definition and answers | `wp_pro_quiz_question` row (`answer_data` serialized) | `WpProQuiz_Model_QuestionMapper::save()` |
| Question admin object | `sfwd-question` post | `wp_insert_post` |
| Quiz question list | `ld_quiz_questions` meta on the quiz post plus `ld_quiz_ID` meta on each question | `LDLMS_Model_Quiz_Questions::set_questions()` |
| Course outline (order, nesting, sections) | `ld_course_steps` and `course_sections` meta on the course | `LDLMS_Model_Course_Steps::set_steps()` |

Both tree metas are caches. Writing the individual association metas by hand does not rebuild them, so always finish through the two model setters.

## How to run / Workflow

Run as a capable user so `wp_kses` does not strip markup from lesson HTML, and bail out early if LearnDash is missing.

```php
if ( ! defined( 'LEARNDASH_VERSION' ) ) {
	return new WP_Error( 'ld_inactive', 'LearnDash is not active' );
}
wp_set_current_user( $author_id ); // an administrator / course author
```

### 1. Course and steps as posts

Content must be HTML. LearnDash renders `post_content` through the normal filters and does not convert Markdown, so convert first.

```php
$course_id = wp_insert_post( [
	'post_type'    => 'sfwd-courses',
	'post_title'   => $title,
	'post_content' => $intro_html,
	'post_status'  => 'draft', // import into draft, publish after review
	'post_author'  => $author_id,
], true );

$lesson_id = wp_insert_post( [
	'post_type'   => 'sfwd-lessons',
	'post_title'  => $lesson_title,
	'post_content'=> $lesson_html,
	'post_status' => 'draft',
	'post_author' => $author_id,
], true );

update_post_meta( $lesson_id, 'course_id', $course_id );
learndash_update_setting( $lesson_id, 'course', $course_id );
```

Topics additionally need `update_post_meta( $topic_id, 'lesson_id', $lesson_id )` and `learndash_update_setting( $topic_id, 'lesson', $lesson_id )`.

### 2. Quiz post plus its ProQuiz master

```php
$quiz_id = wp_insert_post( [
	'post_type'   => 'sfwd-quiz',
	'post_title'  => $quiz_title,
	'post_status' => 'draft',
	'post_author' => $author_id,
], true );

$model = new WpProQuiz_Model_Quiz();
$model->setName( $quiz_title );
$model->setText( '' );
$model->setPostId( $quiz_id );
$model->setQuizModus( WpProQuiz_Model_Quiz::QUIZ_MODUS_SINGLE ); // one question per screen
$model->setTitleHidden( true );
$model->setStatisticsOn( true );
$model->setBtnRestartQuizHidden( false );
$model->setBtnViewQuestionHidden( true );

$saved  = ( new WpProQuiz_Model_QuizMapper() )->save( $model ); // returns the model with the new id
$pro_id = (int) $saved->getId();

update_post_meta( $quiz_id, 'quiz_pro_id', $pro_id );
update_post_meta( $quiz_id, 'quiz_pro_id_' . $pro_id, $pro_id ); // required marker meta
learndash_update_setting( $quiz_id, 'quiz_pro', $pro_id );

learndash_update_setting( $quiz_id, 'course', $course_id );
update_post_meta( $quiz_id, 'course_id', $course_id );
learndash_update_setting( $quiz_id, 'lesson', $lesson_id ); // omit for a course-level quiz
update_post_meta( $quiz_id, 'lesson_id', $lesson_id );
learndash_update_setting( $quiz_id, 'passingpercentage', 80 );
```

`quiz_pro_id_<pro_id>` is not redundant: `learndash_get_quiz_id_by_pro_quiz_id()` resolves a ProQuiz id back to a quiz post through that marker first.

### 3. Questions

Create them in display order. `WpProQuiz_Model_QuestionMapper::save()` ignores `setSort()` on insert and assigns `max(sort) + 1`, and the question list is rebuilt with `orderby => menu_order`, so set `menu_order` on the post and create sequentially.

```php
$question_post_id = wp_insert_post( [
	'post_type'    => 'sfwd-question',
	'post_title'   => $short_prompt,   // shown in the quiz builder
	'post_content' => $prompt_html,
	'post_status'  => 'publish',       // questions stay published even for a draft quiz
	'post_author'  => $author_id,
	'menu_order'   => $index + 1,      // this is the display order
], true );

$q = new WpProQuiz_Model_Question();
$q->setQuizId( $pro_id );             // ProQuiz master id, NOT the quiz post id
$q->setQuestionPostId( $question_post_id );
$q->setOnline( true );
$q->setSort( $index + 1 );
$q->setTitle( $short_prompt );
$q->setQuestion( $prompt_html );
$q->setPoints( 1 );
$q->setAnswerType( 'single' );        // single | multiple | free_answer | essay | sort_answer | matrix_sort_answer | cloze_answer | assessment_answer
$q->setCorrectMsg( $explanation_html );
$q->setIncorrectMsg( '' );
$q->setAnswerPointsActivated( false );
$q->setShowPointsInBox( false );
$q->setCategoryId( 0 );

$answers = [];
foreach ( $options as $option ) {
	$a = new WpProQuiz_Model_AnswerTypes();
	$a->setAnswer( $option['text'] );
	$a->setHtml( false );
	$a->setCorrect( ! empty( $option['correct'] ) );
	$a->setPoints( ! empty( $option['correct'] ) ? 1 : 0 );
	$a->setGraded( false );
	$answers[] = $a;
}
$q->setAnswerData( $answers );

$saved_q         = ( new WpProQuiz_Model_QuestionMapper() )->save( $q );
$question_pro_id = (int) $saved_q->getId();

update_post_meta( $question_post_id, 'question_pro_id', $question_pro_id );
update_post_meta( $question_post_id, 'quiz_id', $quiz_id );  // quiz POST id here
learndash_update_setting( $question_post_id, 'quiz', $quiz_id );
learndash_proquiz_sync_question_fields( $question_post_id, $question_pro_id );
```

`learndash_proquiz_sync_question_fields()` mirrors `question_points`, `question_type`, `question_pro_id`, and `question_pro_category` onto the post. Skip it and the admin list columns and question filters go blank.

Question type notes:

- A true/false question is a `single` question with two answers.
- `multiple` is only for genuinely multi-correct questions; a single-correct question typed as `multiple` renders checkboxes and grades differently.
- `free_answer` compares the learner's text against the answer strings, so every accepted spelling must be its own `WpProQuiz_Model_AnswerTypes` entry.
- `essay` takes exactly one answer object that carries the grading rules, not an answer text:

```php
$a = new WpProQuiz_Model_AnswerTypes();
$a->setAnswer( '' );
$a->setPoints( 1 );
$a->setGraded( true );
$a->setGradedType( 'text' );                       // text | upload
$a->setGradingProgression( 'not-graded-none' );    // not-graded-none | not-graded-full | graded-full
$q->setAnswerData( [ $a ] );
```

`not-graded-none` awards zero points until a grader reviews the submitted essay, `not-graded-full` awards the points immediately but still queues it for grading, `graded-full` auto-passes it. Essay submissions become `sfwd-essays` posts at quiz time; nothing extra is needed at authoring time.

### 4. Attach the questions to the quiz

```php
$map = []; // question_post_id => question_pro_id
foreach ( $created as $c ) {
	$map[ $c['post_id'] ] = $c['pro_id'];
}

$qq = LDLMS_Factory_Post::quiz_questions( $quiz_id );
$qq->set_questions( $map );   // writes ld_quiz_questions + the per-question ld_quiz_<id> meta
$qq->set_questions_dirty();
```

The map VALUE is the ProQuiz question id, not a sort index. `LDLMS_Model_Quiz_Questions::build_questions()` and `questions_split_keys()` both build `post_id => question_pro_id`, and a wrong value silently breaks question resolution while still showing the right count.

### 5. Build the outline: order, nesting, sections

One call sets lesson order, quiz nesting, and section headings. Anything not in the tree drops out of the course.

```php
$tree = [
	'sfwd-lessons' => [
		$lesson_1 => [ 'sfwd-topic' => [], 'sfwd-quiz' => [ $quiz_1 => [] ] ],
		$lesson_2 => [ 'sfwd-topic' => [ $topic_1 => [] ], 'sfwd-quiz' => [] ],
	],
	'sfwd-quiz' => [ $final_exam_quiz => [] ], // course-level quizzes
	'section-heading' => [
		[ 'ID' => time(),     'post_title' => 'First section',  'order' => 0, 'type' => 'section-heading' ],
		[ 'ID' => time() + 1, 'post_title' => 'Second section', 'order' => 3, 'type' => 'section-heading' ],
	],
];

LDLMS_Factory_Post::course_steps( $course_id )->set_steps( $tree );
```

Array order is display order. Use `set_steps( $tree, true )` (or `set_steps_keeping_sections()`) to preserve existing sections when re-ordering steps of a live course.

Section `order` is the insert position in the combined outline, and each already-inserted section shifts the ones after it, because LearnDash splices sections into the lesson list one by one. For section k (1-based), `order = (k - 1) + lessons_before_k`. Six sections over lesson counts 3, 2, 1, 2, 1, 2 give orders 0, 4, 7, 9, 12, 14. A section missing `ID`, `post_title`, `order`, or `type` is silently skipped.

### 6. Flush and verify

```php
wp_cache_flush();
if ( function_exists( 'rocket_clean_domain' ) ) {
	rocket_clean_domain();
}
```

Verification that actually proves the course works:

```php
count( learndash_get_course_steps( $course_id, [ 'sfwd-lessons' ] ) );        // expected lesson count
count( learndash_get_course_steps( $course_id, [ 'sfwd-quiz' ] ) );           // expected quiz count
LDLMS_Factory_Post::quiz_questions( $quiz_id )->get_questions_count();        // per quiz
get_post_meta( $quiz_id, 'quiz_pro_id', true );                              // must be non-empty
json_decode( get_post_meta( $course_id, 'course_sections', true ), true );    // sections present
substr_count( do_shortcode( '[ld_quiz quiz_id="' . $quiz_id . '" course_id="' . $course_id . '"]' ), 'wpProQuiz_listItem' );
```

The shortcode check is the decisive one: it must equal the question count. A quiz with rows in the database but zero `wpProQuiz_listItem` blocks is still broken. Run it as a user who has access, otherwise the access gate returns an empty string.

## Critical rules

- Never ship a quiz post without a ProQuiz master. Without `quiz_pro_id` plus the `quiz_pro_id_<pro_id>` marker, the admin quiz builder is empty and the front end renders nothing.
- `ld_quiz_questions` maps `question_post_id => question_pro_id`. Sort order comes from the question post `menu_order`, never from this value.
- Setting `lesson_id` meta on a quiz does NOT nest it under the lesson. `ld_course_steps` is a cache, `ld_course_steps_dirty` alone does not rebuild it, and a front-end page view does not either. Only `set_steps()` does.
- `setQuizId()` on a question takes the ProQuiz master id; the `quiz_id` post meta takes the quiz POST id. Mixing them produces questions that belong to nothing.
- Create questions in display order and set `menu_order`; the mapper overrides `setSort()` on insert.
- Import to `draft` on a production site, verify the outline and one full quiz, then publish. Questions may stay `publish` even under a draft quiz, since `build_questions()` only queries published question posts.
- Make importers idempotent. Re-running an import that creates questions without a guard duplicates every question, because nothing in LearnDash deduplicates them. Store a marker meta on the quiz (for example `_import_done`) and skip or delete-then-recreate.
- Run under `wp_set_current_user()` with an administrator. As user 0, kses strips lesson markup and post authorship is lost.
- Do not write the ProQuiz tables with raw SQL. `answer_data` is a serialized array of `WpProQuiz_Model_AnswerTypes` objects; build it through the models.

## What this skill does NOT cover

- Course access, enrollment, pricing, and prerequisites: see `learndash-course-access`.
- Learner progress, completion, and quiz attempt data: see `learndash-course-progress`.
- Creating content over REST rather than in PHP: see `learndash-rest-api`.
- Certificates, assignments, essay grading workflows, and group management.
- Generic content tooling (importers, REST wrappers, agent tool layers) usually stops at `wp_insert_post`: it creates the posts and nothing else, so quizzes arrive without a ProQuiz master and questions cannot be created at all. Treat the steps above as the part such tooling is missing.

## References

- Official documentation: <https://developer.learndash.com/>
- Verified source paths (LearnDash LMS 5.1.9):
  - `wp-content/plugins/sfwd-lms/includes/classes/class-ldlms-model-course-steps.php` (`set_steps`, `set_section_headings`, `steps_grouped_sections`)
  - `wp-content/plugins/sfwd-lms/includes/classes/class-ldlms-model-quiz-questions.php` (`set_questions`, `set_questions_to_quiz`, `build_questions`, `questions_split_keys`)
  - `wp-content/plugins/sfwd-lms/includes/quiz/ld-quiz-functions.php` (`learndash_get_quiz_id_by_pro_quiz_id`, `learndash_proquiz_sync_question_fields`, `learndash_update_pro_question`)
  - `wp-content/plugins/sfwd-lms/includes/quiz/ld-quiz-pro.php` and `includes/quiz/ld-quiz-essays.php` (essay grading progression)
  - `wp-content/plugins/sfwd-lms/includes/lib/wp-pro-quiz/lib/model/WpProQuiz_Model_QuizMapper.php`, `WpProQuiz_Model_QuestionMapper.php`, `WpProQuiz_Model_Question.php`, `WpProQuiz_Model_AnswerTypes.php`
  - `wp-content/plugins/sfwd-lms/includes/admin/ld-course-builder-helpers.php` (how the builder merges sections into the outline)
