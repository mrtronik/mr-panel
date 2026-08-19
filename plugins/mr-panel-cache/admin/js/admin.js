jQuery(function($) {

    // ─── Toggle Cache ─────────────────────────

    $(document).on('change', '.mrp-toggle input[data-type]', function() {
        var type = $(this).data('type');
        var enabled = $(this).is(':checked');
        var $card = $(this).closest('.mrp-card');
        var $status = $card.find('.mrp-status');

        $.post(mrpAjax.url, {
            action: 'mrp_toggle_cache',
            nonce: mrpAjax.nonce,
            type: type,
            enabled: enabled ? 1 : 0
        }, function(res) {
            if (res.success) {
                $status.removeClass('mrp-active mrp-inactive')
                    .addClass(enabled ? 'mrp-active' : 'mrp-inactive')
                    .text(enabled ? 'Active' : 'Inactive');
            }
        });
    });

    // ─── Save Page Cache ──────────────────────

    $('#mrp-page-cache-form').on('submit', function(e) {
        e.preventDefault();
        var $form = $(this);
        var $btn = $form.find('.button-primary');
        var data = {
            action: 'mrp_save_settings',
            nonce: mrpAjax.nonce,
            type: 'page_cache',
            settings: {
                enabled: $form.find('[name=enabled]').is(':checked') ? 1 : 0,
                ttl: $form.find('[name=ttl]').val(),
                exclude_login: $form.find('[name=exclude_login]').is(':checked') ? 1 : 0,
                exclude_cart: $form.find('[name=exclude_cart]').is(':checked') ? 1 : 0,
                preload: $form.find('[name=preload]').is(':checked') ? 1 : 0
            }
        };

        $btn.prop('disabled', true).text('Saving...');

        $.post(mrpAjax.url, data, function(res) {
            $btn.prop('disabled', false).text('Save Settings');
            if (res.success) {
                $btn.text('Saved!');
                setTimeout(function() { $btn.text('Save Settings'); }, 2000);
            }
        });
    });

    // ─── Save Browser Cache ───────────────────

    $('#mrp-browser-cache-form').on('submit', function(e) {
        e.preventDefault();
        var $form = $(this);
        var $btn = $form.find('.button-primary');
        var data = {
            action: 'mrp_save_settings',
            nonce: mrpAjax.nonce,
            type: 'browser_cache',
            settings: {
                enabled: $form.find('[name=enabled]').is(':checked') ? 1 : 0,
                max_age: $form.find('[name=max_age]').val(),
                css: $form.find('[name=css]').val(),
                js: $form.find('[name=js]').val(),
                images: $form.find('[name=images]').val(),
                fonts: $form.find('[name=fonts]').val()
            }
        };

        $btn.prop('disabled', true).text('Saving...');

        $.post(mrpAjax.url, data, function(res) {
            $btn.prop('disabled', false).text('Save Settings');
            if (res.success) {
                $btn.text('Saved!');
                setTimeout(function() { $btn.text('Save Settings'); }, 2000);
            }
        });
    });

    // ─── Save PHP Tuning ──────────────────────

    $('#mrp-php-tuning-form').on('submit', function(e) {
        e.preventDefault();
        var $form = $(this);
        var $btn = $form.find('.button-primary');
        var data = {
            action: 'mrp_save_settings',
            nonce: mrpAjax.nonce,
            type: 'php_tuning',
            settings: {
                enabled: $form.find('[name=enabled]').is(':checked') ? 1 : 0,
                opcache: $form.find('[name=opcache]').is(':checked') ? 1 : 0,
                opcache_memory: $form.find('[name=opcache_memory]').val(),
                opcache_accelerated: $form.find('[name=opcache_accelerated]').val(),
                memory_limit: $form.find('[name=memory_limit]').val(),
                max_execution: $form.find('[name=max_execution]').val(),
                upload_max: $form.find('[name=upload_max]').val(),
                post_max: $form.find('[name=post_max]').val()
            }
        };

        $btn.prop('disabled', true).text('Saving...');

        $.post(mrpAjax.url, data, function(res) {
            $btn.prop('disabled', false).text('Save Settings');
            if (res.success) {
                $btn.text('Saved!');
                setTimeout(function() { $btn.text('Save Settings'); }, 2000);
            }
        });
    });

    // ─── Save General Settings ────────────────

    $('#mrp-settings-form').on('submit', function(e) {
        e.preventDefault();
        var $form = $(this);
        var $btn = $form.find('.button-primary');
        var data = {
            action: 'mrp_save_general',
            nonce: mrpAjax.nonce,
            api_url: $form.find('[name=api_url]').val(),
            api_key: $form.find('[name=api_key]').val(),
            domain: $form.find('[name=domain]').val()
        };

        $btn.prop('disabled', true).text('Saving...');

        $.post(mrpAjax.url, data, function(res) {
            $btn.prop('disabled', false).text('Save Settings');
            if (res.success) {
                $btn.text('Saved!');
                setTimeout(function() { $btn.text('Save Settings'); }, 2000);
            }
        });
    });

    // ─── Test Connection ──────────────────────

    $('#mrp-btn-test').on('click', function() {
        var $btn = $(this);
        var $result = $('#mrp-connection-result');

        $btn.prop('disabled', true).html('<span class="mrp-loading"></span>Testing...');

        $.post(mrpAjax.url, {
            action: 'mrp_test_connection',
            nonce: mrpAjax.nonce
        }, function(res) {
            $btn.prop('disabled', false).text('Test Connection');
            $result.show();

            if (res.connected) {
                $result.removeClass('mrp-error').addClass('mrp-success')
                    .html('Connected! Panel version: ' + (res.data?.version || 'unknown'));
            } else {
                $result.removeClass('mrp-success').addClass('mrp-error')
                    .html('Connection failed: ' + (res.error || 'Unknown error'));
            }
        }).fail(function() {
            $btn.prop('disabled', false).text('Test Connection');
            $result.show().removeClass('mrp-success').addClass('mrp-error')
                .html('Connection failed: Network error');
        });
    });

    // ─── Purge Cache ─────────────────────────

    $(document).on('click', '.mrp-btn-purge', function() {
        var $btn = $(this);
        var type = $btn.data('purge-type');
        var originalText = $btn.text();

        if (type === 'all' && !confirm('Are you sure you want to purge all cache?')) {
            return;
        }

        $btn.prop('disabled', true).html('<span class="mrp-loading"></span>Purging...');

        $.post(mrpAjax.url, {
            action: 'mrp_purge_cache',
            nonce: mrpAjax.nonce,
            purge_type: type,
            purge_value: ''
        }, function(res) {
            $btn.prop('disabled', false);
            if (res.success) {
                $btn.text('Purged!').css('background', '#00a32a');
                setTimeout(function() {
                    $btn.text(originalText).css('background', '');
                }, 2000);
            } else {
                $btn.text('Error').css('background', '#d63638');
                setTimeout(function() {
                    $btn.text(originalText).css('background', '');
                }, 2000);
            }
        });
    });

    // ─── Purge URL ───────────────────────────

    $('#mrp-btn-purge-url').on('click', function() {
        var $btn = $(this);
        var url = $('#mrp-purge-url').val();

        if (!url) {
            alert('Please enter a URL');
            return;
        }

        $btn.prop('disabled', true).html('<span class="mrp-loading"></span>Purging...');

        $.post(mrpAjax.url, {
            action: 'mrp_purge_cache',
            nonce: mrpAjax.nonce,
            purge_type: 'url',
            purge_value: url
        }, function(res) {
            $btn.prop('disabled', false).text('Purge URL');
            if (res.success) {
                $btn.text('Purged!').css('background', '#00a32a');
                setTimeout(function() { $btn.text('Purge URL').css('background', ''); }, 2000);
                $('#mrp-purge-url').val('');
            }
        });
    });

});
