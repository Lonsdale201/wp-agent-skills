<?php
/**
 * Route all wp_mail() through Mailpit — drop into wp-content/mu-plugins/.
 *
 * Both parts are required (each failure verified separately):
 * 1. The container has no sendmail and WP doesn't speak SMTP by default.
 * 2. With a localhost site URL the default From is wordpress@localhost,
 *    which PHPMailer rejects as an invalid address — wp_mail() returns
 *    false before any SMTP attempt.
 */

add_action( 'phpmailer_init', function ( $phpmailer ) {
	$phpmailer->isSMTP();
	$phpmailer->Host = 'mailpit'; // compose service name
	$phpmailer->Port = 1025;
} );

add_filter( 'wp_mail_from', fn() => 'dev@example.test' );

// When mail "just fails", this names the real cause:
add_action( 'wp_mail_failed', function ( $error ) {
	error_log( 'wp_mail_failed: ' . $error->get_error_message() );
} );
