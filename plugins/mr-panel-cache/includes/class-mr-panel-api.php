<?php
if (!defined('ABSPATH')) exit;

class MRP_API {
    private $api_url;
    private $api_key;
    private $domain;

    public function __construct() {
        $this->api_url  = get_option('mrp_api_url', '');
        $this->api_key  = get_option('mrp_api_key', '');
        $this->domain   = get_option('mrp_domain', parse_url(home_url(), PHP_URL_HOST));
    }

    public function is_connected() {
        return !empty($this->api_url) && !empty($this->api_key);
    }

    public function get_api_url() {
        return $this->api_url;
    }

    public function get_api_key() {
        return $this->api_key;
    }

    public function get_domain() {
        return $this->domain;
    }

    private function request($method, $endpoint, $data = []) {
        if (!$this->is_connected()) {
            return ['connected' => false, 'error' => 'MR Panel not configured'];
        }

        $url = rtrim($this->api_url, '/') . '/' . ltrim($endpoint, '/');

        $args = [
            'method'  => $method,
            'timeout' => 15,
            'headers' => [
                'Content-Type'  => 'application/json',
                'X-API-Key'     => $this->api_key,
                'X-Domain'      => $this->domain,
            ],
        ];

        if ($method !== 'GET' && !empty($data)) {
            $args['body'] = wp_json_encode($data);
        }

        $response = wp_remote_request($url, $args);

        if (is_wp_error($response)) {
            return ['connected' => false, 'error' => $response->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $parsed = json_decode($body, true);

        if ($code >= 400) {
            return ['connected' => false, 'error' => $parsed['error'] ?? "HTTP $code"];
        }

        return ['connected' => true, 'data' => $parsed];
    }

    public function get($endpoint) {
        return $this->request('GET', $endpoint);
    }

    public function post($endpoint, $data = []) {
        return $this->request('POST', $endpoint, $data);
    }

    public function get_dashboard() {
        return $this->get('dashboard');
    }

    public function get_cache_status($type) {
        return $this->get("cache/{$type}");
    }

    public function update_cache_status($type, $data) {
        return $this->post("cache/{$type}", $data);
    }

    public function purge_cache($type = 'all', $value = '') {
        return $this->post('purge', ['type' => $type, 'value' => $value]);
    }

    public function get_php_settings() {
        return $this->get('php');
    }

    public function update_php_settings($data) {
        return $this->post('php', $data);
    }

    public function test_connection() {
        return $this->get('auth');
    }
}
