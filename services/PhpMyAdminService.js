const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PHPMYADMIN_URL = 'https://files.phpmyadmin.net/phpMyAdmin/5.2.1/phpMyAdmin-5.2.1-all-languages.zip';

class PhpMyAdminService {

    static async downloadAndExtract(destDir) {
        const tmpId = 'phpmyadmin-' + Date.now();
        const zipPath = `/tmp/${tmpId}.zip`;
        const extractDir = `/tmp/${tmpId}-extract`;

        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Download
        await new Promise((resolve, reject) => {
            const https = require('https');
            const file = fs.createWriteStream(zipPath);
            https.get(PHPMYADMIN_URL, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    https.get(response.headers.location, (res2) => {
                        res2.pipe(file);
                        file.on('finish', () => { file.close(); resolve(); });
                    }).on('error', reject);
                } else {
                    response.pipe(file);
                    file.on('finish', () => { file.close(); resolve(); });
                }
            }).on('error', reject);
        });

        // Extract
        execSync(`mkdir -p "${extractDir}" && unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'ignore' });

        // Find phpMyAdmin directory
        const dirs = fs.readdirSync(extractDir).filter(d => d.toLowerCase().includes('phpmyadmin'));
        const phpmyadminDir = dirs.length > 0 ? path.join(extractDir, dirs[0]) : extractDir;

        // Move to dest
        execSync(`cp -r "${phpmyadminDir}/." "${destDir}/"`, { stdio: 'ignore' });

        // Cleanup
        try { fs.unlinkSync(zipPath); } catch {}
        try { fs.rmSync(extractDir, { recursive: true }); } catch {}

        return { success: true };
    }

    static createConfig(destDir, config) {
        const configPath = path.join(destDir, 'config.inc.php');

        const secret = require('crypto').randomBytes(32).toString('hex');

        const content = `<?php
$cfg['blowfish_secret'] = '${secret}';

$i = 0;
$i++;
$cfg['Servers'][$i]['host'] = '${config.dbHost || 'localhost'}';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = false;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['user'] = '';
$cfg['Servers'][$i]['password'] = '';
$cfg['Servers'][$i]['AllowRoot'] = true;
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
$cfg['TempDir'] = '/tmp';
$cfg['ControlDir'] = '';
$cfg['LoginCookieValidity'] = 1440;
$cfg['ShowPhpInfo'] = true;
$cfg['ShowChgPassword'] = true;
$cfg['ShowCreateDb'] = true;
?>`;

        fs.writeFileSync(configPath, content, 'utf8');
        try { execSync(`chmod 644 "${configPath}"`, { stdio: 'ignore' }); } catch {}

        return { success: true };
    }

    static isInstalled(destDir) {
        return fs.existsSync(path.join(destDir, 'index.php')) &&
               fs.existsSync(path.join(destDir, 'config.inc.php'));
    }

    static getVersion(destDir) {
        const versionFile = path.join(destDir, 'libraries', 'Version.php');
        if (!fs.existsSync(versionFile)) return null;
        const content = fs.readFileSync(versionFile, 'utf8');
        const match = content.match(/VERSION\s*=\s*'([^']+)'/);
        return match ? match[1] : null;
    }

    static async installPhpMyAdmin(destDir) {
        await this.downloadAndExtract(destDir);
        this.createConfig(destDir, { dbHost: 'localhost' });

        try {
            execSync(`chown -R lsadm:nogroup "${destDir}" 2>/dev/null || chown -R www-data:www-data "${destDir}" 2>/dev/null`, { stdio: 'ignore' });
        } catch {}

        return { success: true };
    }

    static removePhpMyAdmin(destDir) {
        if (fs.existsSync(destDir)) {
            execSync(`rm -rf "${destDir}"`, { stdio: 'ignore' });
        }
        return { success: true };
    }
}

module.exports = PhpMyAdminService;
