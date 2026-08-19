<?php if (!defined('ABSPATH')) exit;
$pc = $settings['page_cache'] ?? ['enabled' => true, 'ttl' => 3600, 'exclude_login' => false, 'exclude_cart' => false, 'preload' => false];
?>
<div class="mrp-wrap">
    <div class="mrp-header">
        <h1>Page Cache Settings</h1>
        <p>Configure page caching to speed up your site</p>
    </div>

    <div class="mrp-card mrp-card-wide">
        <div class="mrp-card-header">
            <span class="dashicons dashicons-privacy"></span>
            <h3>Page Cache</h3>
        </div>
        <div class="mrp-card-body">
            <form id="mrp-page-cache-form">
                <?php wp_nonce_field('mrp_nonce', 'nonce'); ?>

                <table class="form-table">
                    <tr>
                        <th>Enable Page Cache</th>
                        <td>
                            <label class="mrp-toggle">
                                <input type="checkbox" name="enabled" value="1" <?php checked($pc['enabled']); ?>>
                                <span class="mrp-slider"></span>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th>Cache TTL (seconds)</th>
                        <td>
                            <input type="number" name="ttl" value="<?php echo esc_attr($pc['ttl']); ?>" min="60" max="86400" class="small-text">
                            <p class="description">How long pages stay cached. Default: 3600 (1 hour)</p>
                        </td>
                    </tr>
                    <tr>
                        <th>Exclude Login Page</th>
                        <td>
                            <label class="mrp-toggle">
                                <input type="checkbox" name="exclude_login" value="1" <?php checked($pc['exclude_login']); ?>>
                                <span class="mrp-slider"></span>
                            </label>
                            <p class="description">Don't cache wp-login.php</p>
                        </td>
                    </tr>
                    <tr>
                        <th>Exclude Cart Pages</th>
                        <td>
                            <label class="mrp-toggle">
                                <input type="checkbox" name="exclude_cart" value="1" <?php checked($pc['exclude_cart']); ?>>
                                <span class="mrp-slider"></span>
                            </label>
                            <p class="description">Don't cache WooCommerce cart/checkout pages</p>
                        </td>
                    </tr>
                    <tr>
                        <th>Preload Cache</th>
                        <td>
                            <label class="mrp-toggle">
                                <input type="checkbox" name="preload" value="1" <?php checked($pc['preload']); ?>>
                                <span class="mrp-slider"></span>
                            </label>
                            <p class="description">Automatically cache pages on publish/update</p>
                        </td>
                    </tr>
                </table>

                <div class="mrp-form-actions">
                    <button type="submit" class="button button-primary">Save Settings</button>
                </div>
            </form>
        </div>
    </div>
</div>
