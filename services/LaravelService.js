const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LARAVEL_REPO = 'https://github.com/laravel/laravel.git';

class LaravelInstaller {

 static async cloneProject(destDir, repoUrl) {
    // ✅ FIX: Clean directory first (like WP does)
    if (fs.existsSync(destDir)) {
        const laravelItems = [
            'artisan', 'composer.json', 'composer.lock', 'package.json',
            'phpunit.xml', 'README.md', 'server.php', '.env', '.env.example',
            '.env.backup', '.gitattributes', '.gitignore', '.git',
            'app', 'bootstrap', 'config', 'database', 'public',
            'resources', 'routes', 'storage', 'tests',
            'vendor', 'node_modules', '.htaccess'
        ];
        for (const item of laravelItems) {
            const itemPath = path.join(destDir, item);
            if (fs.existsSync(itemPath)) {
                execSync(`rm -rf "${itemPath}"`, { stdio: 'ignore' });
            }
        }
    } else {
        fs.mkdirSync(destDir, { recursive: true });
    }

    // ✅ FIX: Check git exists
    try {
        execSync('which git', { stdio: 'ignore' });
    } catch {
        throw new Error('git is not installed on this server');
    }

    const repo = repoUrl || LARAVEL_REPO;
    console.log('[LARAVEL] Cloning from', repo);

    await new Promise((resolve, reject) => {
        exec(`git clone "${repo}" "${destDir}"`, { timeout: 120000 }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve();
        });
    });

    return { success: true };
}
    static async composerInstall(destDir) {
        return new Promise((resolve, reject) => {
            exec('composer install --no-dev --optimize-autoloader', {
                cwd: destDir,
                timeout: 300000,
                maxBuffer: 10 * 1024 * 1024
            }, (err, stdout, stderr) => {
                if (err) reject(new Error(stderr || err.message));
                else resolve({ success: true, output: stdout });
            });
        });
    }

 static createEnv(destDir, config) {
    const envPath = path.join(destDir, '.env');
    const envExample = path.join(destDir, '.env.example');

    if (!fs.existsSync(envExample)) {
        throw new Error('.env.example not found');
    }

    let content = fs.readFileSync(envExample, 'utf8');
    const appKey = 'base64:' + crypto.randomBytes(32).toString('base64');

    // ✅ FIX: Uncomment all # lines first
    content = content.replace(/^#\s*DB_/gm, 'DB_');
    content = content.replace(/^#\s*APP_/gm, 'APP_');
    content = content.replace(/^#\s*SESSION_/gm, 'SESSION_');
    content = content.replace(/^#\s*CACHE_/gm, 'CACHE_');

    // APP settings
    content = content.replace(/^APP_NAME=.*/gm, `APP_NAME="${config.appName || 'Laravel'}"`);
    content = content.replace(/^APP_URL=.*/gm, `APP_URL=http://${config.domain}`);
    content = content.replace(/^APP_KEY=.*/gm, `APP_KEY=${appKey}`);

    // DB settings
    content = content.replace(/^DB_CONNECTION=.*/gm, `DB_CONNECTION=mysql`);
    content = content.replace(/^DB_HOST=.*/gm, `DB_HOST=127.0.0.1`);
    content = content.replace(/^DB_PORT=.*/gm, `DB_PORT=3306`);
    content = content.replace(/^DB_DATABASE=.*/gm, `DB_DATABASE=${config.dbName}`);
    content = content.replace(/^DB_USERNAME=.*/gm, `DB_USERNAME=${config.dbUser}`);
    content = content.replace(/^DB_PASSWORD=.*/gm, `DB_PASSWORD=${config.dbPassword}`);

    // ✅ FIX: Use file driver so migration doesn't crash
    content = content.replace(/^SESSION_DRIVER=.*/gm, `SESSION_DRIVER=file`);
    content = content.replace(/^CACHE_STORE=.*/gm, `CACHE_STORE=file`);

    // Redis
    content = content.replace(/^REDIS_HOST=.*/gm, `REDIS_HOST=127.0.0.1`);
    content = content.replace(/^REDIS_PASSWORD=.*/gm, `REDIS_PASSWORD=null`);
    content = content.replace(/^REDIS_PORT=.*/gm, `REDIS_PORT=6379`);

    fs.writeFileSync(envPath, content, 'utf8');
    console.log('[LARAVEL] .env created with DB:', config.dbName);
    try { execSync(`chmod 640 "${envPath}"`, { stdio: 'ignore' }); } catch {}

    return { success: true, appKey };
}
   static generateAppKey(destDir) {
        try {
            execSync('php artisan key:generate --force', {
                cwd: destDir,
                timeout: 30000
            });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    static runMigrations(destDir) {
        try {
            execSync('php artisan migrate --force', {
                cwd: destDir,
                timeout: 60000
            });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

   static async installLaravel(destDir, config) {
    console.log('[LARAVEL] Starting install to', destDir);

    // Step 1: Clone
    await this.cloneProject(destDir, config.repoUrl);

    // Step 2: Composer install
    await this.composerInstall(destDir);

    // Step 3: Create .env
    this.createEnv(destDir, config);

    // Step 4: Generate app key (✅ now throws on failure)
    this.generateAppKey(destDir);

    // Step 5: ✅ FIX: Set permissions + create log file
    try {
        execSync(`chmod -R 775 "${destDir}/storage" "${destDir}/bootstrap/cache"`, { stdio: 'ignore' });
        execSync(`chown -R lsadm:nogroup "${destDir}/storage" "${destDir}/bootstrap/cache" 2>/dev/null || chown -R www-data:www-data "${destDir}/storage" "${destDir}/bootstrap/cache" 2>/dev/null`, { stdio: 'ignore' });
        execSync(`chown -R lsadm:nogroup "${destDir}" 2>/dev/null || chown -R www-data:www-data "${destDir}" 2>/dev/null`, { stdio: 'ignore' });

        // ✅ FIX: Create logs directory + empty laravel.log
        const logsDir = path.join(destDir, 'storage', 'logs');
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
        const logFile = path.join(logsDir, 'laravel.log');
        if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '');
        execSync(`chmod 664 "${logFile}"`, { stdio: 'ignore' });
        execSync(`chown lsadm:nogroup "${logFile}" 2>/dev/null || true`, { stdio: 'ignore' });
    } catch {}

    // Step 6: Run migrations (non-critical)
    const migrationResult = this.runMigrations(destDir);

    // Step 7: ✅ FIX: .htaccess for OLS
    const publicHtaccess = path.join(destDir, 'public', '.htaccess');
    const publicContent = `<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ /index.php [L]
</IfModule>
Options -Indexes`;
    try { fs.writeFileSync(publicHtaccess, publicContent); } catch {}

    // ✅ FIX: Block access to project root
    const rootHtaccess = path.join(destDir, '.htaccess');
    const rootContent = `Order allow,deny
Deny from all`;
    try { fs.writeFileSync(rootHtaccess, rootContent); } catch {}

    console.log('[LARAVEL] Install complete');
    return {
        success: true,
        method: 'composer',
        migration: migrationResult
    };
}
    static isInstalled(destDir) {
        return fs.existsSync(path.join(destDir, 'artisan')) &&
               fs.existsSync(path.join(destDir, 'vendor')) &&
               fs.existsSync(path.join(destDir, '.env'));
    }

    static getVersion(destDir) {
        try {
            const output = execSync('php artisan --version', { cwd: destDir, encoding: 'utf8' });
            return output.trim();
        } catch {
            return null;
        }
    }

    static listRoutes(destDir) {
        try {
            const output = execSync('php artisan route:list --columns=method,uri --format=txt', {
                cwd: destDir,
                encoding: 'utf8',
                timeout: 30000
            });
            return output;
        } catch {
            return null;
        }
    }

    static clearCache(destDir) {
        try {
            execSync('php artisan cache:clear && php artisan config:clear && php artisan route:clear && php artisan view:clear', {
                cwd: destDir,
                timeout: 60000
            });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    static optimize(destDir) {
        try {
            execSync('php artisan optimize', {
                cwd: destDir,
                timeout: 60000
            });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    static removeLaravele(destDir) {
        if (fs.existsSync(destDir)) {
            const laravelItems = [
                'artisan', 'composer.json', 'composer.lock', 'package.json',
                'phpunit.xml', 'README.md', 'server.php', '.env', '.env.example',
                '.env.backup', '.gitattributes', '.gitignore',
                'app', 'bootstrap', 'config', 'database', 'public',
                'resources', 'routes', 'storage', 'tests',
                'vendor', 'node_modules'
            ];
            for (const item of laravelItems) {
                const itemPath = path.join(destDir, item);
                if (fs.existsSync(itemPath)) {
                    execSync(`rm -rf "${itemPath}"`, { stdio: 'ignore' });
                }
            }
            fs.mkdirSync(destDir, { recursive: true });
            try { execSync(`chown lsadm:nogroup "${destDir}" 2>/dev/null || true`, { stdio: 'ignore' }); } catch {}
        }
        return { success: true };
    }
	static removeLaravel(destDir) {
    if (fs.existsSync(destDir)) {
        // ✅ FIX: Delete entire directory, then recreate empty
        try { execSync(`rm -rf "${destDir}"`, { stdio: 'ignore' }); } catch {}
    }
    fs.mkdirSync(destDir, { recursive: true });
    try { execSync(`chown lsadm:nogroup "${destDir}" 2>/dev/null || true`, { stdio: 'ignore' }); } catch {}
    return { success: true };
}
}

module.exports = LaravelInstaller;
