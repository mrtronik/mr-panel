const { execSync, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs');
const path = require('path');
const SystemCacheService = require('./SystemCacheService');

const CACHE_TTL = 300; // 5 minutes

class PhpService {
    static _envCache = null;
    static _envCacheTime = 0;

    static detectPhpEnv(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && this._envCache && (now - this._envCacheTime) < 60000) {
            return this._envCache;
        }

        try {
            const httpdConf = '/usr/local/lsws/conf/httpd_config.conf';
            let activeNum = null;
            
            if (fs.existsSync(httpdConf)) {
                const conf = fs.readFileSync(httpdConf, 'utf8');
                const match = conf.match(/path\s+lsphp(\d+)\/bin\/lsphp/);
                if (match) activeNum = match[1];
            }
            
            const olsBin = execSync('ls /usr/local/lsws/lsphp*/bin/php 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim().split('\n').filter(Boolean);
            if (olsBin.length > 0) {
                let binPath;
                if (activeNum) binPath = olsBin.find(b => b.includes(`lsphp${activeNum}/`));
                if (!binPath) binPath = olsBin[olsBin.length - 1];
                
                const match = binPath.match(/lsphp(\d+)/);
                const ver = match ? match[1] : '83';
                const base = binPath.replace('/bin/php', '');
                const mm = ver.charAt(0) + '.' + ver.slice(1);
                
                let extDir = '';
                let mmVer = mm;
                try {
                    extDir = execSync(`${binPath} -r "echo PHP_EXTENSION_DIR;" 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }).trim();
                    mmVer = execSync(`${binPath} -r "echo PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;" 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }).trim();
                } catch {}
                
                this._envCache = {
                    type: 'litespeed', binPath, basePath: base, phpVersion: mm,
                    iniPath: `${base}/etc/php/${mm}/litespeed/php.ini`,
                    extDir, mm: mmVer, activeNum: ver
                };
                this._envCacheTime = now;
                return this._envCache;
            }
        } catch {}
        
        const fpmVersion = this.getFpmVersion();
        if (fpmVersion) {
            let extDir = '', mm = fpmVersion;
            try {
                extDir = execSync('php -r "echo PHP_EXTENSION_DIR;" 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
                mm = execSync('php -r "echo PHP_MAJOR_VERSION.\'.\'.PHP_MINOR_VERSION;" 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
            } catch {}
            
            this._envCache = {
                type: 'fpm', binPath: 'php', basePath: `/etc/php/${fpmVersion}`,
                phpVersion: fpmVersion, iniPath: `/etc/php/${fpmVersion}/fpm/php.ini`,
                extDir, mm
            };
            this._envCacheTime = now;
            return this._envCache;
        }
        return null;
    }

    // ========== CACHED METHODS ==========

    static async getCachedPageData(forceRefresh = false) {
        const cacheKey = 'php_page_data';
        
        if (!forceRefresh) {
            const cached = await SystemCacheService.get(cacheKey, CACHE_TTL);
            if (cached) return cached;
        }

        const data = this._fetchPageData();
        await SystemCacheService.set(cacheKey, data);
        return data;
    }

    static _fetchPageData() {
        const env = this.detectPhpEnv(true);
        const phpBin = env ? env.binPath : 'php';

        const version = env ? `PHP ${env.phpVersion}` : this.getVersion();
        const modules = this.getModules();
        const iniSettings = this.getIniSettings();
        const installedVersions = this.getInstalledVersions();
        const serviceStatus = this.getServiceStatus();
        const opcache = this.getOpCacheStatus();
        const iniPath = this.getPhpIniPath();
        const ionCube = this.getIonCubeStatus();
        const availableVersions = this.getAvailableVersions();

        return {
            version, modules, iniSettings, installedVersions,
            serviceStatus, opcache, iniPath, ionCube, availableVersions,
            cachedAt: new Date().toISOString()
        };
    }

    static async getCacheAge() {
        return await SystemCacheService.getAge('php_page_data');
    }

    static VERSION_INI_PATHS = {
        '8.3': '/etc/php/8.3/fpm/php.ini',
        '8.2': '/etc/php/8.2/fpm/php.ini',
        '8.1': '/etc/php/8.1/fpm/php.ini',
        '8.0': '/etc/php/8.0/fpm/php.ini',
        '7.4': '/etc/php/7.4/fpm/php.ini',
    };

    static COMMON_SETTINGS = [
        { key: 'memory_limit', label: 'Memory Limit', default: '128M', type: 'size' },
        { key: 'upload_max_filesize', label: 'Upload Max Filesize', default: '2M', type: 'size' },
        { key: 'post_max_size', label: 'Post Max Size', default: '8M', type: 'size' },
        { key: 'max_execution_time', label: 'Max Execution Time', default: '30', type: 'number' },
        { key: 'max_input_time', label: 'Max Input Time', default: '60', type: 'number' },
        { key: 'max_file_uploads', label: 'Max File Uploads', default: '20', type: 'number' },
        { key: 'display_errors', label: 'Display Errors', default: 'Off', type: 'toggle' },
        { key: 'error_reporting', label: 'Error Reporting', default: 'E_ALL & ~E_DEPRECATED & ~E_STRICT', type: 'text' },
        { key: 'date.timezone', label: 'Date Timezone', default: 'UTC', type: 'text' },
        { key: 'session.auto_start', label: 'Session Auto Start', default: '0', type: 'toggle' },
        { key: 'session.gc_maxlifetime', label: 'Session GC Max Lifetime', default: '1440', type: 'number' },
        { key: 'opcache.enable', label: 'OPcache Enable', default: '1', type: 'toggle' },
        { key: 'opcache.memory_consumption', label: 'OPcache Memory', default: '128', type: 'number' },
        { key: 'opcache.max_accelerated_files', label: 'OPcache Max Files', default: '10000', type: 'number' },
        { key: 'short_open_tag', label: 'Short Open Tag', default: 'Off', type: 'toggle' },
        { key: 'allow_url_fopen', label: 'Allow URL Fopen', default: 'On', type: 'toggle' },
        { key: 'allow_url_include', label: 'Allow URL Include', default: 'Off', type: 'toggle' },
        { key: 'cgi.fix_pathinfo', label: 'CGI Fix Pathinfo', default: '1', type: 'number' },
    ];

    static getVersion() {
        const env = this.detectPhpEnv();
        const phpBin = env ? env.binPath : 'php';
        try {
            return execSync(`${phpBin} -v 2>/dev/null | head -1`, { encoding: 'utf8' }).trim();
        } catch {
            return 'Not installed';
        }
    }

    static getInfo() {
        const env = this.detectPhpEnv();
        const phpBin = env ? env.binPath : 'php';
        try {
            const output = execSync(`${phpBin} -i 2>/dev/null`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            const lines = output.split('\n');
            const info = {};
            for (const line of lines) {
                const match = line.match(/^(\w[\w\s]*?)\s*=>\s*(.*)/);
                if (match) {
                    info[match[1].trim()] = match[2].trim();
                }
            }
            return info;
        } catch {
            return {};
        }
    }

    static getModules() {
        const env = this.detectPhpEnv();
        const phpBin = env ? env.binPath : 'php';
        try {
            const output = execSync(`${phpBin} -m 2>/dev/null`, { encoding: 'utf8' });
            return output.split('\n').filter(m => m.trim() && !m.startsWith('[')).map(m => m.trim());
        } catch {
            return [];
        }
    }

    static getLoadedModules() {
        const env = this.detectPhpEnv();
        const phpBin = env ? env.binPath : 'php';
        try {
            const output = execSync(`${phpBin} -m 2>/dev/null`, { encoding: 'utf8' });
            return output.split('\n').filter(m => m.trim() && !m.startsWith('[')).map(m => m.trim());
        } catch {
            return [];
        }
    }

    static getPhpIniPath() {
        const env = this.detectPhpEnv();
        if (env) return env.iniPath;
        try {
            const output = execSync('php --ini 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
            const match = output.match(/Loaded Configuration File:\s*(.*)/);
            return match ? match[1].trim() : null;
        } catch { return null; }
    }

    static getIniSettings() {
        const iniPath = this.getPhpIniPath();
        if (!iniPath || !fs.existsSync(iniPath)) return {};

        try {
            const content = fs.readFileSync(iniPath, 'utf8');
            const settings = {};
            const important = [
                'memory_limit', 'upload_max_filesize', 'post_max_size',
                'max_execution_time', 'max_input_time', 'max_file_uploads',
                'display_errors', 'error_reporting', 'date.timezone',
                'session.auto_start', 'session.cookie_lifetime', 'session.gc_maxlifetime',
                'opcache.enable', 'opcache.memory_consumption',
                'mysqli.default_socket', 'pdo_mysql.default_socket'
            ];

            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('[')) return;
                const match = trimmed.match(/^(\w[\w_.]*?)\s*=\s*(.*)/);
                if (match) {
                    const key = match[1].trim();
                    if (important.includes(key)) settings[key] = match[2].trim();
                }
            });
            return settings;
        } catch { return {}; }
    }

    static getFpmPools() {
        try {
            const output = execSync('ls /etc/php/*/fpm/pool.d/ 2>/dev/null || ls /etc/php*/fpm/pool.d/ 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 5000 }).trim();
            if (!output) return [];
            return output.split('\n').filter(f => f.trim()).map(f => f.trim());
        } catch { return []; }
    }

    static getFpmVersion() {
        const env = this.detectPhpEnv();
        if (env) return env.phpVersion;
        try {
            const versions = execSync('ls /etc/php/ 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim().split('\n').filter(v => v.trim());
            return versions.length > 0 ? versions[versions.length - 1] : null;
        } catch { return null; }
    }

    static getInstalledVersions() {
        try {
            const output = execSync('ls /etc/php/ 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
            return output ? output.split('\n').filter(v => v.trim()).map(v => v.trim()) : [];
        } catch { return []; }
    }

    static getOpCacheStatus() {
        const env = this.detectPhpEnv();
        const phpBin = env ? env.binPath : 'php';
        try {
            const output = execSync(`${phpBin} -r "echo json_encode(opcache_get_status(false));" 2>/dev/null`, { encoding: 'utf8', timeout: 5000 });
            return JSON.parse(output);
        } catch { return null; }
    }

    static getServiceStatus() {
        const env = this.detectPhpEnv();
        if (!env) return { running: false, version: null };
        if (env.type === 'litespeed') {
            try {
                const active = execSync('systemctl is-active lsws 2>/dev/null || /usr/local/lsws/bin/lswsctrl status 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
                return { running: active.includes('running') || active === 'active', version: env.phpVersion };
            } catch { return { running: false, version: env.phpVersion }; }
        }
        try {
            const active = execSync(`systemctl is-active php${env.phpVersion}-fpm 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }).trim();
            return { running: active === 'active', version: env.phpVersion };
        } catch { return { running: false, version: env.phpVersion }; }
    }

    static restartFpm() {
        const env = this.detectPhpEnv();
        if (!env) throw new Error('PHP not found');
        try {
            if (env.type === 'litespeed') {
                execSync('/usr/local/lsws/bin/lswsctrl restart 2>/dev/null || systemctl restart lsws', { encoding: 'utf8' });
            } else {
                execSync(`systemctl restart php${env.phpVersion}-fpm`, { encoding: 'utf8' });
            }
            return { success: true };
        } catch (err) {
            throw new Error('Failed to restart PHP: ' + err.message);
        }
    }

    static getPhpInfoHtml() {
        const env = this.detectPhpEnv();
        const phpBin = env ? env.binPath : 'php';
        try {
            return execSync(`${phpBin} -i 2>/dev/null`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        } catch {
            return '';
        }
    }

    static getUserIniSettings(documentRoot) {
        const iniPath = path.join(documentRoot, '.user.ini');
        const settings = {};

        this.COMMON_SETTINGS.forEach(s => { settings[s.key] = s.default; });

        try {
            if (fs.existsSync(iniPath)) {
                const content = fs.readFileSync(iniPath, 'utf8');
                content.split('\n').forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('[')) return;
                    const match = trimmed.match(/^([\w.]+)\s*=\s*(.*)/);
                    if (match) {
                        settings[match[1].trim()] = match[2].trim();
                    }
                });
            }
        } catch (e) {}

        return settings;
    }

    static saveUserIniSettings(documentRoot, settings) {
        const iniPath = path.join(documentRoot, '.user.ini');
        const lines = [];
        lines.push('; Managed by MR Panel - PHP Settings');
        lines.push('; Changes take effect immediately (no restart needed)');
        lines.push('');

        Object.entries(settings).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                lines.push(`${key} = ${value}`);
            }
        });

        lines.push('');
        fs.writeFileSync(iniPath, lines.join('\n'), 'utf8');
        return true;
    }

    static getServerPhpIni(phpVersion) {
        const iniPath = this.VERSION_INI_PATHS[phpVersion];
        if (!iniPath || !fs.existsSync(iniPath)) return {};

        try {
            const content = fs.readFileSync(iniPath, 'utf8');
            const settings = {};
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('[')) return;
                const match = trimmed.match(/^([\w.]+)\s*=\s*(.*)/);
                if (match) {
                    settings[match[1].trim()] = match[2].trim();
                }
            });
            return settings;
        } catch {
            return {};
        }
    }

    static getExtensions(phpVersion) {
        try {
            const output = execSync(`php${phpVersion} -m 2>/dev/null || php -m 2>/dev/null`, { encoding: 'utf8', timeout: 5000 });
            return output.split('\n').filter(m => m.trim() && !m.startsWith('[')).map(m => m.trim());
        } catch { return []; }
    }

    static formatSize(iniValue) {
        if (!iniValue || iniValue === 'Off' || iniValue === '0') return iniValue;
        return iniValue;
    }

    static checkIonCube() {
        const env = this.detectPhpEnv();
        const phpBin = env ? env.binPath : 'php';
        try {
            const output = execSync(`${phpBin} -m 2>&1`, { encoding: 'utf8', timeout: 5000 });
            return output.toLowerCase().includes('ioncube');
        } catch { return false; }
    }

    static getIonCubeVersion() {
        const env = this.detectPhpEnv();
        const phpBin = env ? env.binPath : 'php';
        try {
            const output = execSync(`${phpBin} -v 2>&1`, { encoding: 'utf8', timeout: 5000 });
            const match = output.match(/ionCube Loader v([\d.]+)/i);
            if (match) return match[1];
            const modules = execSync(`${phpBin} -m 2>&1`, { encoding: 'utf8', timeout: 5000 });
            if (modules.toLowerCase().includes('ioncube')) return 'loaded';
            return null;
        } catch { return null; }
    }

    static getIonCubeStatus() {
        const installed = this.checkIonCube();
        const version = this.getIonCubeVersion();
        const iniLoaded = this.isIonCubeInIni();
        return { installed, version, iniLoaded, enabled: installed && iniLoaded };
    }

    static isIonCubeInIni() {
        const env = this.detectPhpEnv();
        if (!env) return false;
        try {
            if (!fs.existsSync(env.iniPath)) return false;
            const content = fs.readFileSync(env.iniPath, 'utf8');
            return content.includes('ioncube_loader') && !content.match(/^;\s*zend_extension=.*ioncube/m);
        } catch {
            return false;
        }
    }

    static installIonCube() {
        const env = this.detectPhpEnv();
        if (!env) throw new Error('PHP not found');

        const phpExtDir = env.extDir;
        const phpMm = env.mm;
        const phpBin = env.binPath;
        const phpNum = env.activeNum || env.phpVersion.replace('.', '');

        if (!phpMm) throw new Error('Cannot detect PHP version');
        console.log('[ionCube] PHP env:', env.type, 'version:', phpMm, 'ext dir:', phpExtDir, 'activeNum:', phpNum);

        const ioncubeDir = '/tmp/ioncube';
        const loaderFile = `${phpExtDir}/ioncube_loader_lin_${phpMm}.so`;

        if (!fs.existsSync(loaderFile)) {
            console.log('[ionCube] Downloading loader...');
            try {
                execSync(`cd /tmp && wget -q https://downloads.ioncube.com/loader_downloads/ioncube_loaders_lin_x86-64.tar.gz`, { timeout: 60000 });
                console.log('[ionCube] Extracting...');
                execSync(`cd /tmp && tar xzf ioncube_loaders_lin_x86-64.tar.gz`, { timeout: 30000 });
                execSync(`cp ${ioncubeDir}/ioncube_loader_lin_${phpMm}.so ${phpExtDir}/`, { timeout: 10000 });
                console.log('[ionCube] Loader copied to', phpExtDir);
            } catch (e) {
                throw new Error('Failed to download/install ioncube loader: ' + e.message);
            }
        } else {
            console.log('[ionCube] Loader file already exists:', loaderFile);
        }

        const zendLine = `zend_extension=ioncube_loader_lin_${phpMm}.so`;
        const iniLocations = [env.iniPath];

        if (env.type === 'fpm') {
            iniLocations.push(`/etc/php/${env.phpVersion}/cli/php.ini`);
        }

        try {
            const cliIni = execSync(`${phpBin} -r "echo php_ini_loaded_file();" 2>&1`, { encoding: 'utf8' }).trim();
            if (cliIni && !iniLocations.includes(cliIni)) iniLocations.push(cliIni);
        } catch {}

        let enabled = false;
        let updatedFiles = [];
        for (const iniPath of iniLocations) {
            if (!fs.existsSync(iniPath)) {
                console.log('[ionCube] Skipping (not found):', iniPath);
                continue;
            }
            try {
                let iniContent = fs.readFileSync(iniPath, 'utf8');
                if (!iniContent.includes('ioncube_loader')) {
                    iniContent = zendLine + '\n' + iniContent;
                } else {
                    iniContent = iniContent.replace(/^;\s*(zend_extension=.*ioncube.*)$/m, '$1');
                }
                fs.writeFileSync(iniPath, iniContent);
                updatedFiles.push(iniPath);
                enabled = true;
                console.log('[ionCube] Updated:', iniPath);
            } catch (e) {
                console.error('[ionCube] Failed to update', iniPath, e.message);
            }
        }

        if (!enabled) {
            throw new Error('No php.ini files found to enable ionCube');
        }

        try {
            this.restartFpm();
            console.log('[ionCube] PHP restarted');
        } catch (e) {
            console.error('[ionCube] Failed to restart PHP:', e.message);
        }

        const verify = this.getIonCubeVersion();
        console.log('[ionCube] Verification - version:', verify);

        return { success: true, version: verify || 'installed', updatedFiles };
    }

    static uninstallIonCube() {
        const env = this.detectPhpEnv();
        if (!env) throw new Error('PHP not found');

        const iniLocations = [env.iniPath];
        if (env.type === 'fpm') {
            iniLocations.push(`/etc/php/${env.phpVersion}/cli/php.ini`);
        }

        for (const iniPath of iniLocations) {
            if (!fs.existsSync(iniPath)) continue;
            try {
                let iniContent = fs.readFileSync(iniPath, 'utf8');
                iniContent = iniContent.replace(/^zend_extension=.*ioncube.*\n?/m, '');
                iniContent = iniContent.replace(/^;\s*zend_extension=.*ioncube.*\n?/m, '');
                fs.writeFileSync(iniPath, iniContent);
            } catch (e) {
                console.error('[ionCube] Failed to update', iniPath, e.message);
            }
        }

        try { this.restartFpm(); } catch (e) {}
        return { success: true };
    }

    static AVAILABLE_VERSIONS = ['8.5', '8.4', '8.3', '8.2', '8.1'];

    static getAvailableVersions() {
        const installed = this.getInstalledLsphpVersions();
        const installedPkgs = this.getAllInstalledLsphpPackages();
        
        return this.AVAILABLE_VERSIONS.map(v => {
            const num = v.replace('.', '');
            const pkg = 'lsphp' + num;
            const isInstalled = installed.some(i => i.version === v);
            const extensions = this.getExtensionsFromPkgs(installedPkgs, pkg);
            return {
                version: v, pkg, installed: isInstalled,
                active: isInstalled && this.isDefaultPhp(v),
                extensions
            };
        });
    }

    static getAllInstalledLsphpPackages() {
        try {
            const output = execSync('apt list --installed 2>/dev/null | grep "^lsphp"', { encoding: 'utf8', timeout: 10000 });
            return output.split('\n').filter(l => l.trim()).map(l => l.split('/')[0]);
        } catch { return []; }
    }

    static getExtensionsFromPkgs(installedPkgs, pkg) {
        return installedPkgs.filter(p => p.startsWith(pkg + '-')).map(p => p.replace(pkg + '-', ''));
    }

    static getInstalledLsphpVersions() {
        try {
            const output = execSync('ls /usr/local/lsws/ 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
            if (!output) return [];
            return output.split('\n')
                .filter(d => d.match(/^lsphp\d+$/))
                .map(d => {
                    const num = d.replace('lsphp', '');
                    const ver = num.charAt(0) + '.' + num.slice(1);
                    const binPath = `/usr/local/lsws/${d}/bin/php`;
                    return { version: ver, dir: d, binPath, exists: fs.existsSync(binPath) };
                })
                .filter(v => v.exists);
        } catch { return []; }
    }

    static isDefaultPhp(version) {
        try {
            const httpdConf = '/usr/local/lsws/conf/httpd_config.conf';
            if (!fs.existsSync(httpdConf)) return false;
            const conf = fs.readFileSync(httpdConf, 'utf8');
            const num = version.replace('.', '');
            return conf.includes(`lsphp${num}/bin/lsphp`);
        } catch {
            return false;
        }
    }

    static getCommonExtensionsForVersion(version) {
        const num = version.replace('.', '');
        const pkg = `lsphp${num}`;
        try {
            const output = execSync(`apt list --installed 2>/dev/null | grep ^${pkg}`, { encoding: 'utf8' });
            return output.split('\n').filter(l => l.trim()).map(l => l.split('/')[0]);
        } catch {
            return [];
        }
    }

    static async installPhpVersion(version) {
        const num = version.replace('.', '');
        const pkg = `lsphp${num}`;
        const desiredPackages = [
            pkg, `${pkg}-common`, `${pkg}-mysql`, `${pkg}-curl`,
            `${pkg}-opcache`, `${pkg}-imap`, `${pkg}-ldap`,
            `${pkg}-pgsql`, `${pkg}-sqlite3`, `${pkg}-redis`,
            `${pkg}-imagick`, `${pkg}-intl`
        ];

        let availablePackages = [];
        try {
            const { stdout } = await execAsync('apt-cache search lsphp' + num + ' 2>/dev/null', { timeout: 15000 });
            availablePackages = stdout.split('\n')
                .filter(line => line.startsWith(pkg + '-'))
                .map(line => line.split(' ')[0]);
        } catch (e) {}

        const packages = desiredPackages.filter(p => {
            if (p === pkg || p === `${pkg}-common`) return true;
            return availablePackages.includes(p);
        });

        console.log(`[PHP Install] Installing: ${packages.join(', ')}`);

        try {
            console.log(`[PHP Install] Installing ${pkg}...`);
            const { stdout, stderr } = await execAsync(
                `DEBIAN_FRONTEND=noninteractive apt-get install -y ${packages.join(' ')} 2>&1`,
                { timeout: 300000 }
            );
            console.log(`[PHP Install] ${pkg} installed successfully`);

            const lsapiDir = `/usr/local/lsws/${pkg}`;
            if (fs.existsSync(`${lsapiDir}/bin/lsphp`)) {
                const cliLink = `/usr/bin/php${version}`;
                try {
                    execSync(`ln -sf ${lsapiDir}/bin/lsphp ${cliLink}`, { encoding: 'utf8' });
                    console.log(`[PHP Install] Symlink created: ${cliLink}`);
                } catch (e) {
                    console.error(`[PHP Install] Symlink failed:`, e.message);
                }
            }

            try {
                execSync('/usr/local/lsws/bin/lswsctrl reload 2>&1', { encoding: 'utf8', timeout: 10000 });
            } catch (e) {}

            return { success: true, message: `PHP ${version} installed successfully` };
        } catch (err) {
            const msg = err.stdout ? err.stdout.trim() : err.message;
            throw new Error(`Failed to install PHP ${version}: ${msg}`);
        }
    }

    static async uninstallPhpVersion(version) {
        if (this.isDefaultPhp(version)) {
            throw new Error(`Cannot uninstall PHP ${version} — it is the active system PHP`);
        }

        const num = version.replace('.', '');
        const pkg = `lsphp${num}`;

        const websites = this.getWebsitesUsingPhp(version);
        if (websites.length > 0) {
            throw new Error(`Cannot uninstall PHP ${version} — ${websites.length} website(s) still use it: ${websites.join(', ')}`);
        }

        try {
            console.log(`[PHP Uninstall] Removing ${pkg}...`);
            await execAsync(
                `DEBIAN_FRONTEND=noninteractive apt-get remove -y ${pkg}* 2>&1`,
                { timeout: 120000 }
            );

            const lsapiDir = `/usr/local/lsws/${pkg}`;
            if (fs.existsSync(lsapiDir)) {
                execSync(`rm -rf ${lsapiDir}`, { encoding: 'utf8' });
            }

            const cliLink = `/usr/bin/php${version}`;
            if (fs.existsSync(cliLink)) {
                execSync(`rm -f ${cliLink}`, { encoding: 'utf8' });
            }

            try {
                execSync('/usr/local/lsws/bin/lswsctrl reload 2>&1', { encoding: 'utf8', timeout: 10000 });
            } catch (e) {}

            return { success: true, message: `PHP ${version} uninstalled successfully` };
        } catch (err) {
            const msg = err.stdout ? err.stdout.trim() : err.message;
            throw new Error(`Failed to uninstall PHP ${version}: ${msg}`);
        }
    }

    static getWebsitesUsingPhp(version) {
        try {
            const db = require('../config/db');
            const [rows] = db.prepare
                ? db.prepare('SELECT domain FROM websites WHERE php_version = ?').all(version)
                : [];
            return rows.map(r => r.domain);
        } catch {
            return [];
        }
    }

    static getLsphpIniPath(version) {
        const num = version.replace('.', '');
        const mm = version;
        const candidates = [
            `/usr/local/lsws/lsphp${num}/etc/php/${mm}/litespeed/php.ini`,
            `/usr/local/lsws/lsphp${num}/etc/php.ini`,
            `/etc/php/${mm}/fpm/php.ini`
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
        return candidates[0];
    }

    static getServerPhpIniForVersion(version) {
        const iniPath = this.getLsphpIniPath(version);
        if (!fs.existsSync(iniPath)) return {};

        try {
            const content = fs.readFileSync(iniPath, 'utf8');
            const settings = {};
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('[')) return;
                const match = trimmed.match(/^([\w.]+)\s*=\s*(.*)/);
                if (match) {
                    settings[match[1].trim()] = match[2].trim();
                }
            });
            return settings;
        } catch {
            return {};
        }
    }

    static saveServerPhpIniForVersion(version, settings) {
        const iniPath = this.getLsphpIniPath(version);
        if (!fs.existsSync(iniPath)) {
            throw new Error(`php.ini not found for PHP ${version}`);
        }

        try {
            let content = fs.readFileSync(iniPath, 'utf8');
            for (const [key, value] of Object.entries(settings)) {
                const regex = new RegExp(`^(;?\\s*${key.replace('.', '\\.')}\\s*=\\s*).*$`, 'm');
                if (content.match(regex)) {
                    content = content.replace(regex, `${key} = ${value}`);
                } else {
                    content += `\n${key} = ${value}`;
                }
            }
            fs.writeFileSync(iniPath, content, 'utf8');
            return { success: true, iniPath };
        } catch (err) {
            throw new Error(`Failed to save php.ini: ${err.message}`);
        }
    }

    static async getExtensionsForVersion(version) {
        const num = version.replace('.', '');
        const phpBin = `/usr/local/lsws/lsphp${num}/bin/php`;
        if (!fs.existsSync(phpBin)) return [];
        try {
            const { stdout } = await execAsync(`${phpBin} -m 2>/dev/null`, { timeout: 10000 });
            return stdout.split('\n').filter(m => m.trim() && !m.startsWith('[')).map(m => m.trim());
        } catch {
            return [];
        }
    }

    static async setDefaultPhp(version) {
        const num = version.replace('.', '');
        const lsapiDir = `/usr/local/lsws/lsphp${num}`;
        const lsphpBin = `${lsapiDir}/bin/lsphp`;
        const phpBin = `${lsapiDir}/bin/php`;

        if (!fs.existsSync(lsphpBin) && !fs.existsSync(phpBin)) {
            throw new Error(`PHP ${version} is not installed`);
        }

        const binPath = fs.existsSync(lsphpBin) ? lsphpBin : phpBin;

        try {
            const httpdConf = '/usr/local/lsws/conf/httpd_config.conf';
            let conf = fs.readFileSync(httpdConf, 'utf8');

            conf = conf.replace(
                /path\s+lsphp\d+\/bin\/lsphp/,
                `path                    lsphp${num}/bin/lsphp`
            );

            fs.writeFileSync(httpdConf, conf, 'utf8');
            console.log(`[PHP Default] Updated httpd_config.conf to lsphp${num}`);

            try {
                execSync('/usr/local/lsws/bin/lswsctrl reload 2>&1', { encoding: 'utf8', timeout: 10000 });
                console.log('[PHP Default] OLS reloaded');
            } catch (e) {
                console.error('[PHP Default] OLS reload failed:', e.message);
            }

            return { success: true, message: `PHP ${version} set as default` };
        } catch (err) {
            throw new Error(`Failed to set default PHP: ${err.message}`);
        }
    }
}

module.exports = PhpService;
