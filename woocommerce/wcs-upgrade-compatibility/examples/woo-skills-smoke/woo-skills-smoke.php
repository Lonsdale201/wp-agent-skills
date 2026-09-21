<?php
/**
 * Plugin Name: Woo Skills Contract Smoke
 * Description: Explicit WP-CLI contract tests for disposable WooCommerce/Subcriptions installations.
 * Version: 1.0.0
 * Requires at least: 6.9
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * License: GPL-2.0-or-later
 */

defined( 'ABSPATH' ) || exit;

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	return;
}

/** No frontend, admin, cron, payment or activation handlers. */
final class Woo_Skills_Contract_Smoke {
	private $results = array();
	private $objects = array();
	private $users = array();
	private $prefix;

	private function check( $name, $condition ) {
		$this->results[] = array( 'test' => $name, 'pass' => (bool) $condition );
	}

	private function own( $object ) {
		$this->objects[] = $object;
		return $object;
	}

	private function product( $price = 100 ) {
		$product = $this->own( new WC_Product_Simple() );
		$product->set_name( $this->prefix );
		$product->set_status( 'private' );
		$product->set_regular_price( $price );
		$product->set_virtual( true );
		$product->set_manage_stock( false );
		$product->set_tax_status( 'none' );
		$product->save();
		return $product;
	}

	private function order( $products = array() ) {
		$order = $this->own( new WC_Order() );
		$order->set_created_via( 'woo-skills-smoke' );
		$order->set_billing_email( $this->prefix . '@example.test' );
		$order->save();
		foreach ( $products as $product ) {
			$order->add_product( $product );
		}
		$order->calculate_totals( false );
		return $order;
	}

	private function coupon( $type, $amount = 10 ) {
		$coupon = $this->own( new WC_Coupon() );
		$coupon->set_code( $this->prefix . '-' . count( $this->objects ) );
		$coupon->set_discount_type( $type );
		$coupon->set_amount( $amount );
		$coupon->save();
		return $coupon;
	}

	private function user() {
		$login = $this->prefix . '-' . count( $this->users );
		$id = wp_insert_user( array( 'user_login' => $login, 'user_pass' => wp_generate_password(), 'role' => 'customer' ) );
		if ( is_wp_error( $id ) ) {
			throw new RuntimeException( 'Fixture user creation failed.' );
		}
		$this->users[] = $id;
		return $id;
	}

	private function coupons() {
		foreach ( array( 'percent', 'fixed_cart' ) as $type ) {
			$order = $this->order();
			$fee = new WC_Order_Item_Fee();
			$fee->set_name( 'Synthetic fee' );
			$fee->set_amount( 100 );
			$fee->set_total( 100 );
			$fee->set_tax_status( 'none' );
			$order->add_item( $fee );
			$order->calculate_totals( false );
			$coupon = $this->coupon( $type );
			$this->check( 'fee-' . $type . '-preflight-empty', array() === ( new WC_Discounts( $order ) )->get_items() );
			$result = $order->apply_coupon( $coupon );
			$this->check( 'fee-' . $type . '-native-zero-discount', true === $result && 100.0 === (float) $order->get_total() && 0.0 === (float) $order->get_discount_total() );
			$this->check( 'fee-' . $type . '-pending-usage-consumed', 1 === ( new WC_Coupon( $coupon->get_id() ) )->get_usage_count() );
			wc_update_coupon_usage_counts( $order->get_id() );
			$this->check( 'fee-' . $type . '-usage-idempotent', 1 === ( new WC_Coupon( $coupon->get_id() ) )->get_usage_count() );
			$order->update_status( 'cancelled' );
			$this->check( 'fee-' . $type . '-cancel-restores-usage', 0 === ( new WC_Coupon( $coupon->get_id() ) )->get_usage_count() );
			$order->update_status( 'pending' );
			$this->check( 'fee-' . $type . '-pending-recounts', 1 === ( new WC_Coupon( $coupon->get_id() ) )->get_usage_count() );
		}

		$a = $this->product();
		$b = $this->product();
		$order = $this->order( array( $a, $b ) );
		$coupon = $this->coupon( 'percent' );
		$coupon->set_product_ids( array( $a->get_id() ) );
		$coupon->save();
		$this->check( 'persisted-restricted-percent', true === $order->apply_coupon( $coupon ) && 190.0 === (float) $order->get_total() );

		$restricted = $this->coupon( 'percent' );
		$restricted->set_product_ids( array( $b->get_id() ) );
		$restricted->save();
		$single = $this->order( array( $a ) );
		$this->check( 'native-inclusion-rejects', is_wp_error( ( new WC_Discounts( $single ) )->is_coupon_valid( $restricted ) ) );
		$seen = false;
		$override = static function ( $valid, $candidate, $discounts ) use ( $restricted, &$seen ) {
			if ( $candidate->get_id() === $restricted->get_id() ) {
				$seen = $discounts instanceof WC_Discounts;
				return true;
			}
			return $valid;
		};
		add_filter( 'woocommerce_coupon_is_valid_for_product_ids', $override, 10, 3 );
		try {
			$engine = new WC_Discounts( $single );
			$this->check( '11-1-inclusion-override-still-faces-eligible-item-check', is_wp_error( $engine->is_coupon_valid( $restricted ) ) && $seen );
			add_filter( 'woocommerce_coupon_is_valid_for_excluded_items', $override, 10, 3 );
			$this->check( '11-1-both-validation-overrides', true === $engine->is_coupon_valid( $restricted ) );
			$engine->apply_coupon( $restricted );
			$this->check( '11-1-validation-does-not-override-allocation', 0.0 === (float) array_sum( $engine->get_discounts_by_coupon() ) );
		} finally {
			remove_filter( 'woocommerce_coupon_is_valid_for_product_ids', $override, 10 );
			remove_filter( 'woocommerce_coupon_is_valid_for_excluded_items', $override, 10 );
		}
		$this->virtual_coupon( $a, $b );
		$this->identity( $a );
	}

	private function identity( $product ) {
		$owner = $this->user();
		$actor = $this->user();
		$order = $this->order( array( $product ) );
		$order->set_customer_id( $owner );
		$order->save();
		$coupon = $this->coupon( 'percent' );
		$entitled_user = $owner;
		$validate = static function ( $valid, $candidate, $discounts ) use ( $coupon, &$entitled_user ) {
			if ( $candidate->get_id() !== $coupon->get_id() ) {
				return $valid;
			}
			$context = $discounts->get_object();
			$user_id = $context instanceof WC_Order ? (int) $context->get_customer_id() : get_current_user_id();
			return $valid && $user_id && $entitled_user === $user_id;
		};
		add_filter( 'woocommerce_coupon_is_valid', $validate, 10, 3 );
		try {
			wp_set_current_user( $actor );
			$this->check( 'entitlement-order-owner-not-actor', true === ( new WC_Discounts( $order ) )->is_coupon_valid( $coupon ) );
			$entitled_user = $actor;
			$this->check( 'entitlement-actor-cannot-redeem-for-other', is_wp_error( ( new WC_Discounts( $order ) )->is_coupon_valid( $coupon ) ) );
			wp_set_current_user( 0 );
			$entitled_user = $owner;
			$this->check( 'entitlement-owner-works-without-current-user', true === ( new WC_Discounts( $order ) )->is_coupon_valid( $coupon ) );
		} finally {
			remove_filter( 'woocommerce_coupon_is_valid', $validate, 10 );
			wp_set_current_user( 0 );
		}
	}

	private function virtual_coupon( $a, $b ) {
		$order = $this->order( array( $a, $b ) );
		$code = $this->prefix . '-virtual';
		$data = array( 'discount_type' => 'percent', 'amount' => 10, 'product_ids' => array( $a->get_id() ) );
		$resolver = static function ( $resolved, $input ) use ( $code, $data ) {
			return false === $resolved && $input === $code ? $data : $resolved;
		};
		add_filter( 'woocommerce_get_shop_coupon_data', $resolver, 10, 2 );
		try {
			$virtual = new WC_Coupon( $code );
		} finally {
			remove_filter( 'woocommerce_get_shop_coupon_data', $resolver, 10 );
		}
		$this->check( 'virtual-no-id-or-store', 0 === $virtual->get_id() && ! $virtual->get_data_store() );
		$restore = static function ( $candidate, $item_code, $item, $context ) use ( $order, $virtual, $data ) {
			if ( $context === $order && wc_is_same_coupon( $item_code, $virtual->get_code() ) ) {
				$item->update_meta_data( 'coupon_info', $virtual->get_short_info() );
				$item->update_meta_data( '_woo_skills_policy', $data );
				$item->save();
				return $virtual;
			}
			return $candidate;
		};
		add_filter( 'woocommerce_order_recalculate_coupons_coupon_object', $restore, 10, 4 );
		try {
			$this->check( 'virtual-direct-apply', true === $order->apply_coupon( $virtual ) );
		} finally {
			remove_filter( 'woocommerce_order_recalculate_coupons_coupon_object', $restore, 10 );
		}
		$this->allocation( 'virtual-first-recalculation', $order, $a );
		$restore_saved = static function ( $candidate, $item_code, $item, $context ) use ( $order, $code ) {
			if ( $context->get_id() === $order->get_id() && wc_is_same_coupon( $item_code, $code ) ) {
				$candidate->set_props( $item->get_meta( '_woo_skills_policy', true ) );
			}
			return $candidate;
		};
		add_filter( 'woocommerce_order_recalculate_coupons_coupon_object', $restore_saved, 10, 4 );
		try {
			$fresh = wc_get_order( $order->get_id() );
			$fresh->recalculate_coupons();
			$this->allocation( 'virtual-reload-without-resolver', $fresh, $a );
		} finally {
			remove_filter( 'woocommerce_order_recalculate_coupons_coupon_object', $restore_saved, 10 );
		}
	}

	private function allocation( $name, $order, $a ) {
		$correct = 190.0 === (float) $order->get_total();
		foreach ( $order->get_items() as $item ) {
			$correct = $correct && (float) $item->get_total() === ( $item->get_product_id() === $a->get_id() ? 90.0 : 100.0 );
		}
		$this->check( $name, $correct );
	}

	private function subscriptions() {
		if ( ! class_exists( 'WC_Admin_Settings' ) ) {
			require_once WC()->plugin_path() . '/includes/admin/class-wc-admin-settings.php';
		}
		$pages = WC_Admin_Settings::get_settings_pages();
		$page = null;
		foreach ( $pages as $candidate ) {
			if ( 'subscriptions' === $candidate->get_id() ) {
				$page = $candidate;
			}
		}
		$this->check( 'settings-page-registered', $page instanceof WC_Settings_Page );
		$this->check( 'settings-output-priority', $page && 1 === has_action( 'woocommerce_settings_subscriptions', array( $page, 'output' ) ) );
		rest_get_server();
		$settings = apply_filters( 'woocommerce_settings-subscriptions', array() );
		$suspensions = array_values( array_filter( $settings, static function ( $setting ) {
			return 'woocommerce_subscriptions_max_customer_suspensions' === ( $setting['id'] ?? '' );
		} ) );
		$this->check( 'rest-suspension-number-once', 1 === count( $suspensions ) && 'number' === $suspensions[0]['type'] && empty( $suspensions[0]['options'] ) );

		$yes = static function () { return 'yes'; };
		$no = static function () { return 'no'; };
		add_filter( 'pre_option_woocommerce_subscriptions_turn_off_automatic_payments', $yes );
		add_filter( 'pre_option_woocommerce_subscriptions_accept_manual_renewals', $no );
		try {
			$this->check( 'manual-renewal-parent-required', ! WCS_Manual_Renewal_Manager::is_manual_renewal_required() );
			remove_filter( 'pre_option_woocommerce_subscriptions_accept_manual_renewals', $no );
			add_filter( 'pre_option_woocommerce_subscriptions_accept_manual_renewals', $yes );
			$this->check( 'manual-renewal-parent-and-child', WCS_Manual_Renewal_Manager::is_manual_renewal_required() );
		} finally {
			remove_filter( 'pre_option_woocommerce_subscriptions_turn_off_automatic_payments', $yes );
			remove_filter( 'pre_option_woocommerce_subscriptions_accept_manual_renewals', $no );
			remove_filter( 'pre_option_woocommerce_subscriptions_accept_manual_renewals', $yes );
		}

		$owner = $this->user();
		$other = $this->user();
		$subscription = wcs_create_subscription( array( 'customer_id' => $owner, 'billing_period' => 'month', 'billing_interval' => 1 ) );
		if ( is_wp_error( $subscription ) ) {
			throw new RuntimeException( 'Subscription fixture failed.' );
		}
		$this->own( $subscription );
		$seen = null;
		$force = static function ( $allowed, $sub, $user_id ) use ( &$seen ) { $seen = $user_id; return true; };
		add_filter( 'wcs_can_items_be_removed', $force, 10, 3 );
		try {
			$this->check( 'removal-owner-capability', wcs_can_items_be_removed( $subscription, $owner ) && $seen === $owner );
			$this->check( 'removal-filter-cannot-authorize-other', ! wcs_can_items_be_removed( $subscription, $other ) );
			$this->check( 'removal-anonymous-owned-subscription-denied', ! wcs_can_items_be_removed( $subscription ) );
		} finally {
			remove_filter( 'wcs_can_items_be_removed', $force, 10 );
		}
		$url = WCS_Remove_Item::get_remove_url( $subscription->get_id(), 1 );
		parse_str( wp_parse_url( html_entity_decode( $url ), PHP_URL_QUERY ), $query );
		$nonce = $query['_wpnonce'] ?? '';
		$this->check( 'remove-nonce-operation-specific', false !== wp_verify_nonce( $nonce, 'woocommerce_subscriptions_remove_item_' . $subscription->get_id() ) );
		$this->check( 'remove-nonce-not-resubscribe', false === wp_verify_nonce( $nonce, WCS_Cart_Resubscribe::get_nonce_action( $subscription->get_id() ) ) );
		$this->check( 'legacy-id-nonce-rejected', false === wp_verify_nonce( wp_create_nonce( $subscription->get_id() ), WCS_Cart_Resubscribe::get_nonce_action( $subscription->get_id() ) ) );

		$first = new WC_Subscription( $subscription->get_id() );
		$stale = new WC_Subscription( $subscription->get_id() );
		$first->set_billing_interval( 2 );
		$first->save();
		$stale->set_billing_period( 'week' );
		$stale->save();
		$fresh = new WC_Subscription( $subscription->get_id() );
		$this->check( 'subscription-stale-save-preserves-other-property', 2 === (int) $fresh->get_billing_interval() && 'week' === $fresh->get_billing_period() );
		$product = $this->product();
		$modules = did_filter( 'wcsatt_modules' );
		$management = did_filter( 'wcsatt_management_modules' );
		$instance = WCS_ATT_Product::get_instance_id( $product );
		$this->check( 'apfs-instance-does-not-bootstrap', $instance === WCS_ATT_Product::get_instance_id( $product ) && $modules === did_filter( 'wcsatt_modules' ) && $management === did_filter( 'wcsatt_management_modules' ) );
		WCS_ATT_Display::frontend_scripts();
		$this->check( 'apfs-registered-not-global-enqueue', wp_script_is( 'wcsatt-frontend', 'registered' ) && ! wp_script_is( 'wcsatt-frontend', 'enqueued' ) );
		WCS_ATT_Display::enqueue_frontend_script();
		WCS_ATT_Display::enqueue_frontend_script();
		$this->check( 'apfs-explicit-enqueue-idempotent', 1 === count( array_keys( wp_scripts()->queue, 'wcsatt-frontend', true ) ) );
	}

	/**
	 * Run synthetic contracts on a disposable local WordPress install.
	 *
	 * ## OPTIONS
	 *
	 * [--confirm-disposable]
	 * : Confirm the complete installation and database are disposable and egress is blocked.
	 */
	public function run( $args, $assoc_args ) {
		if ( empty( $assoc_args['confirm-disposable'] ) || ! defined( 'WOO_SKILLS_SMOKE_ALLOW_WRITES' ) || true !== WOO_SKILLS_SMOKE_ALLOW_WRITES || 'local' !== wp_get_environment_type() ) {
			WP_CLI::error( 'Requires a disposable local install, blocked egress, WOO_SKILLS_SMOKE_ALLOW_WRITES=true and --confirm-disposable.' );
		}
		if ( ! defined( 'WC_VERSION' ) || '11.1.1' !== WC_VERSION || ! class_exists( 'WC_Subscriptions' ) || '9.2.0' !== WC_Subscriptions::$version ) {
			WP_CLI::error( 'This characterization suite is pinned to WooCommerce 11.1.1 and Subscriptions 9.2.0.' );
		}
		$this->prefix = 'woo-smoke-' . strtolower( wp_generate_password( 12, false, false ) );
		$original_user = get_current_user_id();
		wp_set_current_user( 0 );
		try {
			$this->coupons();
			$this->subscriptions();
		} catch ( Throwable $error ) {
			WP_CLI::debug( $error->getMessage() . ' at line ' . $error->getLine(), 'smoke' );
			$this->check( 'runtime-exception-' . get_class( $error ), false );
		} finally {
			foreach ( array_reverse( $this->objects ) as $object ) {
				try {
					if ( $object->get_id() ) {
						$object->delete( true );
					}
				} catch ( Throwable $error ) {
					$this->check( 'fixture-cleanup-' . get_class( $object ), false );
				}
			}
			require_once ABSPATH . 'wp-admin/includes/user.php';
			foreach ( $this->users as $id ) {
				$this->check( 'fixture-user-cleanup', wp_delete_user( $id ) );
			}
			wp_set_current_user( $original_user );
		}
		$failed = count( array_filter( $this->results, static function ( $result ) { return ! $result['pass']; } ) );
		WP_CLI::line( wp_json_encode( array(
			'versions' => array( 'wordpress' => get_bloginfo( 'version' ), 'woocommerce' => WC_VERSION, 'subscriptions' => WC_Subscriptions::$version, 'php' => PHP_VERSION ),
			'hpos' => \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled(),
			'failed' => $failed,
			'results' => $this->results,
		), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
		if ( $failed ) {
			WP_CLI::halt( 1 );
		}
	}
}

WP_CLI::add_command( 'woo-skills-smoke', 'Woo_Skills_Contract_Smoke' );
