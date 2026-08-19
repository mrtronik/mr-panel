<?php if (!defined('ABSPATH')) exit; ?>
<div class="mrp-wrap">
    <div class="mrp-header">
        <h1>Settings</h1>
        <p>Configure MR Panel connection</p>
    </div>

    <div class="mrp-card mrp-card-wide">
        <div class="mrp-card-header">
            <span class="dashicons dashicons-admin-network"></span>
            <h3>Connection</h3>
        </div>
        <div class="mrp-card-body">
            <form id="mrp-settings-form">
                <?php wp_nonce_field('mrp_nonce', 'nonce'); ?>

                <table class="form-table">
                    <tr>
                        <th>MR Panel URL</th>
                        <td>
                            <input type="url" name="api_url" value="<?php echo esc_attr($api_url); ?>" class="regular-text" placeholder="http://103.191.63.147:3000">
                            <p class="description">Your MR Panel instance URL (e.g. http://your-panel.com:3000)</p>
                        </td>
                    </tr>
                    <tr>
                        <th>API Key</th>
                        <td>
                            <input type="text" name="api_key" value="<?php echo esc_attr($api_key); ?>" class="regular-text" placeholder="Your API key">
                            <p class="description">Found in MR Panel &gt; Website Settings</p>
                        </td>
                    </tr>
                    <tr>
                        <th>Domain</th>
                        <td>
                            <input type="text" name="domain" value="<?php echo esc_attr($domain); ?>" class="regular-text" placeholder="example.com">
                            <p class="description">This website domain (auto-detected)</p>
                        </td>
                    </tr>
                </table>

                <div class="mrp-form-actions">
                    <button type="submit" class="button button-primary">Save Settings</button>
                    <button type="button" class="button" id="mrp-btn-test">Test Connection</button>
                </div>
            </form>

            <div id="mrp-connection-result" style="display:none;"></div>
        </div>
    </div>
</div>
