const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LARAVEL_REPO = 'https://github.com/laravel/laravel.git';

class LaravelInstaller {

    static async cloneProject(destDir, repoUrl) {
        if (fs.existsSync(destDir) && fs.readdirSync(destDir).length > 0) {
            throw new Error('Directory is not empty');
        }

        const repo = repoUrl || LARAVEL_REPO;

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

        // Generate app key
        const appKey = 'base64:' + crypto.randomBytes(32).toString('base64');

        content = content.replace(/APP_NAME=.*/g, `APP_NAME="${config.appName || 'Laravel'}"`);
        content = content.replace(/APP_URL=.*/g, `APP_URL=http://${config.domain}`);

        content = content.replace(/DB_CONNECTION=.*/g, `DB_CONNECTION=mysql`);
        content = content.replace(/DB_HOST=.*/g, `DB_HOST=127.0.0.1`);
        content = content.replace(/DB_PORT=.*/g, `DB_PORT=3306`);
        content = content.replace(/DB_DATABASE=.*/g, `DB_DATABASE=${config.dbName}`);
        content = content.replace(/DB_USERNAME=.*/g, `DB_USERNAME=${config.dbUser}`);
        content = content.replace(/DB_PASSWORD=.*/g, `DB_PASSWORD=${config.dbPassword}`);

        // Redis (comment out if present)
        content = content.replace(/REDIS_HOST=.*/g, `REDIS_HOST=127.0.0.1`);
        content = content.replace(/REDIS_PASSWORD=.*/g, `REDIS_PASSWORD=null`);
        content = content.replace(/REDIS_PORT=.*/g, `REDIS_PORT=6379`);

        fs.writeFileSync(envPath, content, 'utf8');

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
        // Step 1: Clone
        await this.cloneProject(destDir, config.repoUrl);

        // Step 2: Composer install
        await this.composerInstall(destDir);

        // Step 3: Create .env
        this.createEnv(destDir, config);

        // Step 4: Generate app key
        this.generateAppKey(destDir);

        // Step 5: Set permissions
        try {
            // Storage and bootstrap/cache need write permissions
            execSync(`chmod -R 775 "${destDir}/storage" "${destDir}/bootstrap/cache"`, { stdio: 'ignore' });
            execSync(`chown -R lsadm:nogroup "${destDir}/storage" "${destDir}/bootstrap/cache" 2>/dev/null || true`, { stdio: 'ignore' });
        } catch {}

        // Step 6: Run migrations
        const migrationResult = this.runMigrations(destDir);

        return {
            success: true,
            method: 'composer',
            db: {
                name: config.dbName,
                user: config.dbUser,
                password: config.dbPassword
            },
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

    static removeLaravel(destDir) {
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
}

module.exports = LaravelInstaller;
