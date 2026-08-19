<?php
/**
 * Plugin Name: MR Panel Cache
 * Plugin URI: https://mrpanel.com
 * Description: Performance cache plugin powered by MR Panel. Manage page cache, browser cache, PHP tuning, and more from your WordPress admin.
 * Version: 1.0.0
 * Author: MR Panel
 * Author URI: https://mrpanel.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: mr-panel-cache
 * Domain Path: /languages
 * Requires at least: 5.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

define('MRP_VERSION', '1.0.0');
define('MRP_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('MRP_PLUGIN_URL', plugin_dir_url(__FILE__));
define('MRP_PLUGIN_BASENAME', plugin_basename(__FILE__));

class MR_Panel_Cache {
    private static $instance = null;
    private $api;
    private $admin;

    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->load_dependencies();
        $this->api = new MRP_API();
        $this->admin = new MRP_Admin($this->api);

        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);
    }

    private function load_dependencies() {
        require_once MRP_PLUGIN_DIR . 'includes/class-mr-panel-api.php';
        require_once MRP_PLUGIN_DIR . 'includes/class-mr-panel-admin.php';
    }

    public function activate() {
        $defaults = [
            'page_cache'    => ['enabled' => true, 'ttl' => 3600],
            'browser_cache' => ['enabled' => true, 'max_age' => 86400],
            'object_cache'  => ['enabled' => false, 'driver' => ''],
            'php_tuning'    => ['enabled' => true, 'opcache' => true],
            'minify'        => ['css' => true, 'js' => true, 'html' => false],
        ];

        if (!get_option('mrp_cache_settings')) {
            add_option('mrp_cache_settings', $defaults);
        }

        if (!get_option('mrp_api_key')) {
            add_option('mrp_api_key', wp_generate_password(64, false));
        }

        flush_rewrite_rules();
    }

    public function deactivate() {
        flush_rewrite_rules();
    }

    public function get_api() {
        return $this->api;
    }
}

function mr_panel_cache() {
    return MR_Panel_Cache::instance();
}

mr_panel_cache();
