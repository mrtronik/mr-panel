<?php if (!defined('ABSPATH')) exit;
$bc = $settings['browser_cache'] ?? ['enabled' => true, 'max_age' => 86400, 'css' => 604800, 'js' => 604800, 'images' => 2592000, 'fonts' => 2592000];
?>
<div class="mrp-wrap">
    <div class="mrp-header">
        <h1>Browser Cache Settings</h1>
        <p>Set browser caching headers to reduce server load</p>
    </div>

    <div class="mrp-card mrp-card-wide">
        <div class="mrp-card-header">
            <span class="dashicons dashicons-networking"></span>
            <h3>Browser Cache</h3>
        </div>
        <div class="mrp-card-body">
            <form id="mrp-browser-cache-form">
                <?php wp_nonce_field('mrp_nonce', 'nonce'); ?>

                <table class="form-table">
                    <tr>
                        <th>Enable Browser Cache</th>
                        <td>
                            <label class="mrp-toggle">
                                <input type="checkbox" name="enabled" value="1" <?php checked($bc['enabled']); ?>>
                                <span class="mrp-slider"></span>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th>Default Max Age (seconds)</th>
                        <td>
                            <input type="number" name="max_age" value="<?php echo esc_attr($bc['max_age']); ?>" min="300" max="31536000" class="small-text">
                            <p class="description">Default: 86400 (1 day)</p>
                        </td>
                    </tr>
                    <tr>
                        <th>CSS Files</th>
                        <td>
                            <input type="number" name="css" value="<?php echo esc_attr($bc['css']); ?>" min="300" max="31536000" class="small-text">
                            <p class="description">Default: 604800 (7 days)</p>
                        </td>
                    </tr>
                    <tr>
                        <th>JavaScript Files</th>
                        <td>
                            <input type="number" name="js" value="<?php echo esc_attr($bc['js']); ?>" min="300" max="31536000" class="small-text">
                            <p class="description">Default: 604800 (7 days)</p>
                        </td>
                    </tr>
                    <tr>
                        <th>Images</th>
                        <td>
                            <input type="number" name="images" value="<?php echo esc_attr($bc['images']); ?>" min="300" max="31536000" class="small-text">
                            <p class="description">Default: 2592000 (30 days)</p>
                        </td>
                    </tr>
                    <tr>
                        <th>Fonts</th>
                        <td>
                            <input type="number" name="fonts" value="<?php echo esc_attr($bc['fonts']); ?>" min="300" max="31536000" class="small-text">
                            <p class="description">Default: 2592000 (30 days)</p>
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
