<?php if (!defined('ABSPATH')) exit;
$pt = $settings['php_tuning'] ?? ['enabled' => true, 'opcache' => true, 'opcache_memory' => 128, 'opcache_accelerated' => 10000, 'memory_limit' => '256M', 'max_execution' => 30, 'upload_max' => '64M', 'post_max' => '64M'];
?>
<div class="mrp-wrap">
    <div class="mrp-header">
        <h1>PHP Tuning</h1>
        <p>Optimize PHP settings for better performance</p>
    </div>

    <div class="mrp-card mrp-card-wide">
        <div class="mrp-card-header">
            <span class="dashicons dashicons-admin-tools"></span>
            <h3>PHP Configuration</h3>
        </div>
        <div class="mrp-card-body">
            <form id="mrp-php-tuning-form">
                <?php wp_nonce_field('mrp_nonce', 'nonce'); ?>

                <table class="form-table">
                    <tr>
                        <th>Enable PHP Tuning</th>
                        <td>
                            <label class="mrp-toggle">
                                <input type="checkbox" name="enabled" value="1" <?php checked($pt['enabled']); ?>>
                                <span class="mrp-slider"></span>
                            </label>
                        </td>
                    </tr>
                </table>

                <h2>OPcache</h2>
                <table class="form-table">
                    <tr>
                        <th>Enable OPcache</th>
                        <td>
                            <label class="mrp-toggle">
                                <input type="checkbox" name="opcache" value="1" <?php checked($pt['opcache']); ?>>
                                <span class="mrp-slider"></span>
                            </label>
                            <p class="description">Bytecode cache for PHP. Recommended: ON</p>
                        </td>
                    </tr>
                    <tr>
                        <th>OPcache Memory Size (MB)</th>
                        <td>
                            <input type="number" name="opcache_memory" value="<?php echo esc_attr($pt['opcache_memory']); ?>" min="32" max="512" class="small-text">
                            <p class="description">Default: 128MB</p>
                        </td>
                    </tr>
                    <tr>
                        <th>Max Accelerated Files</th>
                        <td>
                            <input type="number" name="opcache_accelerated" value="<?php echo esc_attr($pt['opcache_accelerated']); ?>" min="1000" max="100000" class="small-text">
                            <p class="description">Default: 10000</p>
                        </td>
                    </tr>
                </table>

                <h2>PHP Limits</h2>
                <table class="form-table">
                    <tr>
                        <th>Memory Limit</th>
                        <td>
                            <select name="memory_limit">
                                <?php foreach (['64M','128M','192M','256M','384M','512M'] as $v): ?>
                                    <option value="<?php echo $v ?>" <?php selected($pt['memory_limit'], $v); ?>><?php echo $v ?></option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th>Max Execution Time (seconds)</th>
                        <td>
                            <input type="number" name="max_execution" value="<?php echo esc_attr($pt['max_execution']); ?>" min="10" max="300" class="small-text">
                        </td>
                    </tr>
                    <tr>
                        <th>Upload Max Size</th>
                        <td>
                            <select name="upload_max">
                                <?php foreach (['8M','16M','32M','64M','128M','256M'] as $v): ?>
                                    <option value="<?php echo $v ?>" <?php selected($pt['upload_max'], $v); ?>><?php echo $v ?></option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th>Post Max Size</th>
                        <td>
                            <select name="post_max">
                                <?php foreach (['8M','16M','32M','64M','128M','256M'] as $v): ?>
                                    <option value="<?php echo $v ?>" <?php selected($pt['post_max'], $v); ?>><?php echo $v ?></option>
                                <?php endforeach; ?>
                            </select>
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
