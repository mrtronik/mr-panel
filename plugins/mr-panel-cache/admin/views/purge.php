<?php if (!defined('ABSPATH')) exit; ?>
<div class="mrp-wrap">
    <div class="mrp-header">
        <h1>Purge Cache</h1>
        <p>Clear cached files from your server</p>
    </div>

    <div class="mrp-grid mrp-grid-2">
        <div class="mrp-card">
            <div class="mrp-card-header">
                <span class="dashicons dashicons-trash"></span>
                <h3>Purge All Cache</h3>
            </div>
            <div class="mrp-card-body">
                <p>Clear all cached pages, assets, and OPcache.</p>
                <div class="mrp-form-actions">
                    <button class="button button-primary button-hero mrp-btn-purge" data-purge-type="all">Purge All</button>
                </div>
            </div>
        </div>

        <div class="mrp-card">
            <div class="mrp-card-header">
                <span class="dashicons dashicons-privacy"></span>
                <h3>Purge Page Cache</h3>
            </div>
            <div class="mrp-card-body">
                <p>Clear cached pages only. Assets remain intact.</p>
                <div class="mrp-form-actions">
                    <button class="button button-secondary mrp-btn-purge" data-purge-type="page">Purge Pages</button>
                </div>
            </div>
        </div>

        <div class="mrp-card">
            <div class="mrp-card-header">
                <span class="dashicons dashicons-admin-generic"></span>
                <h3>Purge Assets</h3>
            </div>
            <div class="mrp-card-body">
                <p>Clear minified CSS and JavaScript files.</p>
                <div class="mrp-form-actions">
                    <button class="button button-secondary mrp-btn-purge" data-purge-type="assets">Purge Assets</button>
                </div>
            </div>
        </div>

        <div class="mrp-card">
            <div class="mrp-card-header">
                <span class="dashicons dashicons-performance"></span>
                <h3>Purge OPcache</h3>
            </div>
            <div class="mrp-card-body">
                <p>Reset PHP OPcache. PHP scripts will be recompiled.</p>
                <div class="mrp-form-actions">
                    <button class="button button-secondary mrp-btn-purge" data-purge-type="opcache">Purge OPcache</button>
                </div>
            </div>
        </div>
    </div>

    <div class="mrp-card mrp-card-wide">
        <div class="mrp-card-header">
            <span class="dashicons dashicons-admin-links"></span>
            <h3>Purge by URL</h3>
        </div>
        <div class="mrp-card-body">
            <p>Clear cache for a specific URL only.</p>
            <div class="mrp-purge-url">
                <input type="url" id="mrp-purge-url" placeholder="https://example.com/some-post/" class="regular-text">
                <button class="button button-primary" id="mrp-btn-purge-url">Purge URL</button>
            </div>
        </div>
    </div>
</div>
