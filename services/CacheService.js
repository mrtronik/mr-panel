const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const OLS_BASE = '/usr/local/lsws';
const OLS_CONF = `${OLS_BASE}/conf`;
const OLS_VHOSTS = `${OLS_CONF}/vhosts`;
const PHP_BIN = '/usr/bin/php8.3';

class CacheService {

    // ─── Settings ──────────────────────────────

    static async getSettings(domain) {
        const [rows] = await db.execute(
            'SELECT cache_settings FROM websites WHERE domain = ?',
            [domain]
        );
        if (!rows[0] || !rows[0].cache_settings) {
            return this.defaultSettings();
        }
        const settings = typeof rows[0].cache_settings === 'string'
            ? JSON.parse(rows[0].cache_settings)
            : rows[0].cache_settings;
        return { ...this.defaultSettings(), ...settings };
    }

    static async saveSettings(domain, settings) {
        const current = await this.getSettings(domain);
        const merged = { ...current, ...settings };
        await db.execute(
            'UPDATE websites SET cache_settings = ? WHERE domain = ?',
            [JSON.stringify(merged), domain]
        );
        return merged;
    }

    static defaultSettings() {
        return {
            page_cache:    { enabled: true, ttl: 3600, exclude_login: false, exclude_cart: false, preload: false },
            browser_cache: { enabled: true, max_age: 86400, css: 604800, js: 604800, images: 2592000, fonts: 2592000 },
            object_cache:  { enabled: false, driver: '' },
            php_tuning:    { enabled: true, opcache: true, opcache_memory: 128, opcache_accelerated: 10000, memory_limit: '256M', max_execution: 30, upload_max: '64M', post_max: '64M' },
            minify:        { css: true, js: true, html: false },
        };
    }

    // ─── OLS Vhost Config ──────────────────────

    static async applyPageCache(domain, settings) {
        const vhconfPath = `${OLS_VHOSTS}/${domain}/vhconf.conf`;
        if (!fs.existsSync(vhconfPath)) return { success: false, error: 'vhost not found' };

        let conf = fs.readFileSync(vhconfPath, 'utf8');

        // Ensure rewrite block uses autoLoadHtaccess
        if (!conf.includes('autoLoadHtaccess')) {
            conf = conf.replace(
                /rewrite\s*\{[\s\S]*?\}/,
                `rewrite {\n  enable 1\n  autoLoadHtaccess 1\n}`
            );
        }

        fs.writeFileSync(vhconfPath, conf);
        this.setOwner(vhconfPath);

        return { success: true };
    }

    static async applyBrowserCache(domain, settings) {
        const vhconfPath = `${OLS_VHOSTS}/${domain}/vhconf.conf`;
        if (!fs.existsSync(vhconfPath)) return { success: false, error: 'vhost not found' };

        let conf = fs.readFileSync(vhconfPath, 'utf8');

        // Generate expires rules
        const maxAge = settings.max_age || 86400;
        const cssAge = settings.css || 604800;
        const jsAge = settings.js || 604800;
        const imgAge = settings.images || 2592000;
        const fontAge = settings.fonts || 2592000;

        const expiresBlock = settings.enabled ? `
expires {
  enableExpires 1
  expiresByType text/css=${cssAge}
  expiresByType application/javascript=${jsAge}
  expiresByType application/x-javascript=${jsAge}
  expiresByType image/*=${imgAge}
  expiresByType font/*=${fontAge}
  expiresByType application/font-woff=${fontAge}
  expiresByType image/svg+xml=${imgAge}
}` : '';

        // Remove old expires block and add new
        conf = conf.replace(/expires\s*\{[\s\S]*?\}/g, '');
        if (settings.enabled) {
            // Insert before rewrite block or at end
            if (conf.includes('rewrite {')) {
                conf = conf.replace('(rewrite {)', expiresBlock.trim() + '\n\n$1');
            } else {
                conf += '\n' + expiresBlock;
            }
        }

        fs.writeFileSync(vhconfPath, conf);
        this.setOwner(vhconfPath);

        return { success: true };
    }

    // ─── PHP Tuning ────────────────────────────

    static async getPhpSettings(domain) {
        const settings = await this.getSettings(domain);
        const pt = settings.php_tuning || {};

        // Try to get current values from PHP
        let opcache = { enabled: false, memory: 128, accelerated: 10000 };
        let memory_limit = '256M';
        let max_execution = 30;
        let upload_max = '64M';
        let post_max = '64M';

        try {
            const opcacheJson = execSync(`${PHP_BIN} -r "echo json_encode(ini_get_all('opcache'));"` , { encoding: 'utf8', timeout: 5000 });
            const opData = JSON.parse(opcacheJson);
            opcache.enabled = opData['opcache.enable']?.local_value == 1;
            opcache.memory = parseInt(opData['opcache.memory_consumption']?.local_value || 128);
            opcache.accelerated = parseInt(opData['opcache.max_accelerated_files']?.local_value || 10000);
        } catch {}

        try {
            memory_limit = execSync(`${PHP_BIN} -r "echo ini_get('memory_limit');"` , { encoding: 'utf8', timeout: 5000 }).trim();
            max_execution = parseInt(execSync(`${PHP_BIN} -r "echo ini_get('max_execution_time');"` , { encoding: 'utf8', timeout: 5000 }).trim());
            upload_max = execSync(`${PHP_BIN} -r "echo ini_get('upload_max_filesize');"` , { encoding: 'utf8', timeout: 5000 }).trim();
            post_max = execSync(`${PHP_BIN} -r "echo ini_get('post_max_size');"` , { encoding: 'utf8', timeout: 5000 }).trim();
        } catch {}

        return {
            current: { opcache, memory_limit, max_execution, upload_max, post_max },
            saved: pt
        };
    }

    static async applyPhpTuning(domain, settings) {
        const pt = settings.php_tuning || {};
        if (!pt.enabled) return { success: true, message: 'PHP tuning disabled' };

        const results = [];

        // OPcache settings via /etc/php/8.3/mods-available/opcache.ini or lsphp config
        const opcacheFile = '/etc/php/8.3/mods-available/opcache.ini';
        const lsphpOpcache = `${OLS_BASE}/lsphp83/etc/php/8.3/mods/opcache.ini`;

        for (const iniFile of [opcacheFile, lsphpOpcache]) {
            if (!fs.existsSync(iniFile)) continue;

            let content = fs.readFileSync(iniFile, 'utf8');

            content = this.setIniValue(content, 'opcache.enable', pt.opcache ? '1' : '0');
            content = this.setIniValue(content, 'opcache.memory_consumption', String(pt.opcache_memory || 128));
            content = this.setIniValue(content, 'opcache.max_accelerated_files', String(pt.opcache_accelerated || 10000));
            content = this.setIniValue(content, 'opcache.interned_strings_buffer', '16');
            content = this.setIniValue(content, 'opcache.revalidate_freq', '2');
            content = this.setIniValue(content, 'opcache.save_comments', '1');

            fs.writeFileSync(iniFile, content);
            this.setOwner(iniFile);
            results.push(`Updated ${iniFile}`);
        }

        // PHP limits
        const phpConfDir = `${OLS_BASE}/lsphp83/etc/php/8.3/litespeed`;
        const phpIni = `${phpConfDir}/php.ini`;

        if (fs.existsSync(phpIni)) {
            let content = fs.readFileSync(phpIni, 'utf8');

            content = this.setIniValue(content, 'memory_limit', pt.memory_limit || '256M');
            content = this.setIniValue(content, 'max_execution_time', String(pt.max_execution || 30));
            content = this.setIniValue(content, 'upload_max_filesize', pt.upload_max || '64M');
            content = this.setIniValue(content, 'post_max_size', pt.post_max || '64M');
            content = this.setIniValue(content, 'max_input_time', '60');
            content = this.setIniValue(content, 'max_input_vars', '3000');

            fs.writeFileSync(phpIni, content);
            this.setOwner(phpIni);
            results.push('Updated php.ini');
        }

        // Restart OLS to apply
        this.reloadOLS();

        return { success: true, results };
    }

    // ─── Purge ─────────────────────────────────

    static async purgeCache(domain, type = 'all', value = '') {
        const docRoot = `/home/public_html/${domain}`;

        switch (type) {
            case 'all':
                return this.purgeAll(domain, docRoot);
            case 'page':
                return this.purgePages(domain, docRoot);
            case 'assets':
                return this.purgeAssets(domain, docRoot);
            case 'opcache':
                return this.purgeOpcache();
            case 'url':
                return this.purgeUrl(domain, docRoot, value);
            default:
                return { success: false, error: 'Unknown purge type' };
        }
    }

    static async purgeAll(domain, docRoot) {
        let purged = 0;

        // Clear any page cache files
        const cacheDir = `${docRoot}/wp-content/cache`;
        if (fs.existsSync(cacheDir)) {
            try { execSync(`rm -rf "${cacheDir}"`, { stdio: 'ignore' }); purged++; } catch {}
        }

        // Clear OLS cache via lswsctrl
        try { execSync(`${OLS_BASE}/bin/lswsctrl flush-cache 2>/dev/null`, { stdio: 'ignore' }); purged++; } catch {}

        // Reset OPcache
        try { execSync(`${PHP_BIN} -r "if(function_exists('opcache_reset')){opcache_reset();echo 1;}else{echo 0;}"`, { encoding: 'utf8', timeout: 5000 }); purged++; } catch {}

        return { success: true, purged };
    }

    static async purgePages(domain, docRoot) {
        let purged = 0;
        const cacheDir = `${docRoot}/wp-content/cache`;
        if (fs.existsSync(cacheDir)) {
            try { execSync(`rm -rf "${cacheDir}"`, { stdio: 'ignore' }); purged++; } catch {}
        }
        try { execSync(`${OLS_BASE}/bin/lswsctrl flush-cache 2>/dev/null`, { stdio: 'ignore' }); purged++; } catch {}
        return { success: true, purged };
    }

    static async purgeAssets(domain, docRoot) {
        let purged = 0;
        const cacheDir = `${docRoot}/wp-content/cache/minify`;
        if (fs.existsSync(cacheDir)) {
            try { execSync(`rm -rf "${cacheDir}"`, { stdio: 'ignore' }); purged++; } catch {}
        }
        try { execSync(`${OLS_BASE}/bin/lswsctrl flush-lscache 2>/dev/null`, { stdio: 'ignore' }); purged++; } catch {}
        return { success: true, purged };
    }

    static async purgeOpcache() {
        try {
            const result = execSync(`${PHP_BIN} -r "if(function_exists('opcache_reset')){opcache_reset();echo json_encode(['reset'=>true]);}else{echo json_encode(['reset'=>false]);}"`, { encoding: 'utf8', timeout: 5000 });
            return { success: true, opcache: JSON.parse(result.trim()) };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    static async purgeUrl(domain, docRoot, url) {
        // For URL-specific purge, we clear the entire page cache
        // More granular would require tracking individual URLs
        return this.purgePages(domain, docRoot);
    }

    // ─── Dashboard Stats ───────────────────────

    static async getDashboard(domain) {
        const settings = await this.getSettings(domain);
        const phpSettings = await this.getPhpSettings(domain);

        return {
            cache_status: {
                page: settings.page_cache?.enabled ?? true,
                browser: settings.browser_cache?.enabled ?? true,
                object: settings.object_cache?.enabled ?? false,
                php: settings.php_tuning?.enabled ?? true,
            },
            php: phpSettings.current,
            server: {
                php_version: '8.3',
                opcache: phpSettings.current.opcache?.enabled ?? false,
            }
        };
    }

    // ─── Helpers ───────────────────────────────

    static setIniValue(content, key, value) {
        const regex = new RegExp(`^(;?\\s*${key}\\s*=\\s*).*$`, 'm');
        if (content.match(regex)) {
            return content.replace(regex, `${key} = ${value}`);
        }
        return content + `\n${key} = ${value}`;
    }

    static setOwner(filePath) {
        try { execSync(`chown lsadm:nogroup "${filePath}" 2>/dev/null`, { stdio: 'ignore' }); } catch {}
    }

    static reloadOLS() {
        try { execSync(`${OLS_BASE}/bin/lswsctrl reload 2>/dev/null`, { stdio: 'ignore' }); } catch {}
    }
}

module.exports = CacheService;
