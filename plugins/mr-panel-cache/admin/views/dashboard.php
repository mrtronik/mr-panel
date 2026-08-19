<?php if (!defined('ABSPATH')) exit; ?>
<div class="mrp-wrap">
    <div class="mrp-header">
        <h1>MR Panel Cache</h1>
        <p>Performance cache powered by MR Panel</p>
    </div>

    <?php if (!$connected): ?>
    <div class="mrp-notice mrp-notice-warning">
        <span class="dashicons dashicons-warning"></span>
        <div>
            <strong>Not connected to MR Panel</strong>
            <p>Go to <a href="<?php echo admin_url('admin.php?page=mr-panel-settings'); ?>">Settings</a> to configure your MR Panel connection.</p>
        </div>
    </div>
    <?php endif; ?>

    <div class="mrp-grid">
        <!-- Page Cache Card -->
        <div class="mrp-card">
            <div class="mrp-card-header">
                <span class="dashicons dashicons-privacy"></span>
                <h3>Page Cache</h3>
            </div>
            <div class="mrp-card-body">
                <div class="mrp-status <?php echo $settings['page_cache']['enabled'] ?? true ? 'mrp-active' : 'mrp-inactive'; ?>">
                    <?php echo ($settings['page_cache']['enabled'] ?? true) ? 'Active' : 'Inactive'; ?>
                </div>
                <p>TTL: <?php echo ($settings['page_cache']['ttl'] ?? 3600) / 60; ?> minutes</p>
            </div>
            <div class="mrp-card-footer">
                <label class="mrp-toggle">
                    <input type="checkbox" data-type="page_cache" <?php checked($settings['page_cache']['enabled'] ?? true); ?>>
                    <span class="mrp-slider"></span>
                </label>
            </div>
        </div>

        <!-- Browser Cache Card -->
        <div class="mrp-card">
            <div class="mrp-card-header">
                <span class="dashicons dashicons-networking"></span>
                <h3>Browser Cache</h3>
            </div>
            <div class="mrp-card-body">
                <div class="mrp-status <?php echo $settings['browser_cache']['enabled'] ?? true ? 'mrp-active' : 'mrp-inactive'; ?>">
                    <?php echo ($settings['browser_cache']['enabled'] ?? true) ? 'Active' : 'Inactive'; ?>
                </div>
                <p>Max Age: <?php echo (($settings['browser_cache']['max_age'] ?? 86400) / 86400); ?> days</p>
            </div>
            <div class="mrp-card-footer">
                <label class="mrp-toggle">
                    <input type="checkbox" data-type="browser_cache" <?php checked($settings['browser_cache']['enabled'] ?? true); ?>>
                    <span class="mrp-slider"></span>
                </label>
            </div>
        </div>

        <!-- PHP Tuning Card -->
        <div class="mrp-card">
            <div class="mrp-card-header">
                <span class="dashicons dashicons-admin-tools"></span>
                <h3>PHP Tuning</h3>
            </div>
            <div class="mrp-card-body">
                <div class="mrp-status <?php echo $settings['php_tuning']['enabled'] ?? true ? 'mrp-active' : 'mrp-inactive'; ?>">
                    <?php echo ($settings['php_tuning']['enabled'] ?? true) ? 'Active' : 'Inactive'; ?>
                </div>
                <p>OPcache: <?php echo ($settings['php_tuning']['opcache'] ?? true) ? 'ON' : 'OFF'; ?></p>
            </div>
            <div class="mrp-card-footer">
                <label class="mrp-toggle">
                    <input type="checkbox" data-type="php_tuning" <?php checked($settings['php_tuning']['enabled'] ?? true); ?>>
                    <span class="mrp-slider"></span>
                </label>
            </div>
        </div>

        <!-- Minify Card -->
        <div class="mrp-card">
            <div class="mrp-card-header">
                <span class="dashicons dashicons-admin-generic"></span>
                <h3>Minify</h3>
            </div>
            <div class="mrp-card-body">
                <div class="mrp-status mrp-active">Active</div>
                <p>CSS: <?php echo ($settings['minify']['css'] ?? true) ? 'ON' : 'OFF'; ?> | JS: <?php echo ($settings['minify']['js'] ?? true) ? 'ON' : 'OFF'; ?></p>
            </div>
            <div class="mrp-card-footer">
                <label class="mrp-toggle">
                    <input type="checkbox" data-type="minify" <?php echo ($settings['minify']['css'] ?? true) || ($settings['minify']['js'] ?? true) ? 'checked' : ''; ?>>
                    <span class="mrp-slider"></span>
                </label>
            </div>
        </div>
    </div>

    <!-- Quick Purge -->
    <div class="mrp-card mrp-card-wide">
        <div class="mrp-card-header">
            <span class="dashicons dashicons-trash"></span>
            <h3>Quick Purge</h3>
        </div>
        <div class="mrp-card-body">
            <div class="mrp-purge-actions">
                <button class="button button-primary mrp-btn-purge" data-purge-type="all">Purge All Cache</button>
                <button class="button mrp-btn-purge" data-purge-type="page">Purge Page Cache</button>
                <button class="button mrp-btn-purge" data-purge-type="assets">Purge Assets</button>
                <button class="button mrp-btn-purge" data-purge-type="opcache">Purge OPcache</button>
            </div>
            <div class="mrp-purge-url">
                <input type="url" id="mrp-purge-url" placeholder="Purge specific URL: https://example.com/post/" class="regular-text">
                <button class="button" id="mrp-btn-purge-url">Purge URL</button>
            </div>
        </div>
    </div>
</div>
