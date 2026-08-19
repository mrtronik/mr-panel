<?php
if (!defined('ABSPATH')) exit;

class MRP_Admin {
    private $api;

    public function __construct(MRP_API $api) {
        $this->api = $api;

        if (is_admin()) {
            add_action('admin_menu', [$this, 'add_menu']);
            add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
            add_action('wp_ajax_mrp_save_settings', [$this, 'ajax_save_settings']);
            add_action('wp_ajax_mrp_toggle_cache', [$this, 'ajax_toggle_cache']);
            add_action('wp_ajax_mrp_purge_cache', [$this, 'ajax_purge_cache']);
            add_action('wp_ajax_mrp_test_connection', [$this, 'ajax_test_connection']);
            add_action('wp_ajax_mrp_save_general', [$this, 'ajax_save_general']);
        }
    }

    public function add_menu() {
        add_menu_page(
            'MR Panel Cache',
            'MR Panel Cache',
            'manage_options',
            'mr-panel-cache',
            [$this, 'page_dashboard'],
            'dashicons-performance',
            80
        );

        add_submenu_page(
            'mr-panel-cache',
            'Dashboard',
            'Dashboard',
            'manage_options',
            'mr-panel-cache',
            [$this, 'page_dashboard']
        );

        add_submenu_page(
            'mr-panel-cache',
            'Page Cache',
            'Page Cache',
            'manage_options',
            'mr-panel-page-cache',
            [$this, 'page_page_cache']
        );

        add_submenu_page(
            'mr-panel-cache',
            'Browser Cache',
            'Browser Cache',
            'manage_options',
            'mr-panel-browser-cache',
            [$this, 'page_browser_cache']
        );

        add_submenu_page(
            'mr-panel-cache',
            'PHP Tuning',
            'PHP Tuning',
            'manage_options',
            'mr-panel-php-tuning',
            [$this, 'page_php_tuning']
        );

        add_submenu_page(
            'mr-panel-cache',
            'Purge',
            'Purge Cache',
            'manage_options',
            'mr-panel-purge',
            [$this, 'page_purge']
        );

        add_submenu_page(
            'mr-panel-cache',
            'Settings',
            'Settings',
            'manage_options',
            'mr-panel-settings',
            [$this, 'page_settings']
        );
    }

    public function enqueue_assets($hook) {
        if (strpos($hook, 'mr-panel') === false) return;

        wp_enqueue_style('mrp-admin', MRP_PLUGIN_URL . 'admin/css/admin.css', [], MRP_VERSION);
        wp_enqueue_script('mrp-admin', MRP_PLUGIN_URL . 'admin/js/admin.js', ['jquery'], MRP_VERSION, true);
        wp_localize_script('mrp-admin', 'mrpAjax', [
            'url'   => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('mrp_nonce'),
        ]);
    }

    private function get_settings() {
        return get_option('mrp_cache_settings', [
            'page_cache'    => ['enabled' => true, 'ttl' => 3600],
            'browser_cache' => ['enabled' => true, 'max_age' => 86400],
            'object_cache'  => ['enabled' => false, 'driver' => ''],
            'php_tuning'    => ['enabled' => true, 'opcache' => true],
            'minify'        => ['css' => true, 'js' => true, 'html' => false],
        ]);
    }

    private function render($template, $data = []) {
        extract($data);
        include MRP_PLUGIN_DIR . "admin/views/{$template}.php";
    }

    // ─── Pages ───────────────────────────────────────

    public function page_dashboard() {
        $connected = $this->api->is_connected();
        $settings  = $this->get_settings();
        $this->render('dashboard', compact('connected', 'settings'));
    }

    public function page_page_cache() {
        $settings = $this->get_settings();
        $this->render('page-cache', compact('settings'));
    }

    public function page_browser_cache() {
        $settings = $this->get_settings();
        $this->render('browser-cache', compact('settings'));
    }

    public function page_php_tuning() {
        $settings = $this->get_settings();
        $this->render('php-tuning', compact('settings'));
    }

    public function page_purge() {
        $this->render('purge');
    }

    public function page_settings() {
        $this->render('settings', [
            'api_url' => $this->api->get_api_url(),
            'api_key' => $this->api->get_api_key(),
            'domain'  => $this->api->get_domain(),
        ]);
    }

    // ─── AJAX Handlers ───────────────────────────────

    public function ajax_save_settings() {
        check_ajax_referer('mrp_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $type = sanitize_text_field($_POST['type'] ?? '');
        $data = $_POST['settings'] ?? [];

        $settings = $this->get_settings();

        switch ($type) {
            case 'page_cache':
                $settings['page_cache'] = [
                    'enabled'       => (bool)($data['enabled'] ?? false),
                    'ttl'           => absint($data['ttl'] ?? 3600),
                    'exclude_login' => (bool)($data['exclude_login'] ?? false),
                    'exclude_cart'  => (bool)($data['exclude_cart'] ?? false),
                    'preload'       => (bool)($data['preload'] ?? false),
                ];
                break;

            case 'browser_cache':
                $settings['browser_cache'] = [
                    'enabled'  => (bool)($data['enabled'] ?? false),
                    'max_age'  => absint($data['max_age'] ?? 86400),
                    'css'      => absint($data['css'] ?? 604800),
                    'js'       => absint($data['js'] ?? 604800),
                    'images'   => absint($data['images'] ?? 2592000),
                    'fonts'    => absint($data['fonts'] ?? 2592000),
                ];
                break;

            case 'php_tuning':
                $settings['php_tuning'] = [
                    'enabled'           => (bool)($data['enabled'] ?? false),
                    'opcache'           => (bool)($data['opcache'] ?? false),
                    'opcache_memory'    => absint($data['opcache_memory'] ?? 128),
                    'opcache_accelerated'=> absint($data['opcache_accelerated'] ?? 10000),
                    'memory_limit'      => sanitize_text_field($data['memory_limit'] ?? '256M'),
                    'max_execution'     => absint($data['max_execution'] ?? 30),
                    'upload_max'        => sanitize_text_field($data['upload_max'] ?? '64M'),
                    'post_max'          => sanitize_text_field($data['post_max'] ?? '64M'),
                ];
                break;

            case 'minify':
                $settings['minify'] = [
                    'css'  => (bool)($data['css'] ?? false),
                    'js'   => (bool)($data['js'] ?? false),
                    'html' => (bool)($data['html'] ?? false),
                ];
                break;
        }

        update_option('mrp_cache_settings', $settings);
        wp_send_json_success(['settings' => $settings]);
    }

    public function ajax_toggle_cache() {
        check_ajax_referer('mrp_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $type    = sanitize_text_field($_POST['type'] ?? '');
        $enabled = (bool)($_POST['enabled'] ?? false);

        $settings = $this->get_settings();

        if (isset($settings[$type])) {
            $settings[$type]['enabled'] = $enabled;
            update_option('mrp_cache_settings', $settings);
        }

        wp_send_json_success(['enabled' => $enabled]);
    }

    public function ajax_purge_cache() {
        check_ajax_referer('mrp_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $type  = sanitize_text_field($_POST['purge_type'] ?? 'all');
        $value = sanitize_url($_POST['purge_value'] ?? '');

        // TODO: Call MR Panel API to actually purge
        // For now, simulate success
        wp_send_json_success([
            'message' => "Cache purged (type: {$type})",
            'purged'  => 0,
        ]);
    }

    public function ajax_test_connection() {
        check_ajax_referer('mrp_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $result = $this->api->test_connection();
        wp_send_json($result);
    }

    public function ajax_save_general() {
        check_ajax_referer('mrp_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $api_url = esc_url_raw($_POST['api_url'] ?? '');
        $api_key = sanitize_text_field($_POST['api_key'] ?? '');
        $domain  = sanitize_text_field($_POST['domain'] ?? '');

        update_option('mrp_api_url', $api_url);
        update_option('mrp_api_key', $api_key);
        update_option('mrp_domain', $domain);

        $this->api = new MRP_API();

        wp_send_json_success(['message' => 'Settings saved']);
    }
}
