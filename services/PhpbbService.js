const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PHPBB_URL = 'https://www.phpbb.com/files/release/phpBB-3.3.14.zip';

class PhpbbInstaller {

    static async downloadAndExtract(destDir) {
        const tmpId = 'phpbb-' + Date.now();
        const zipPath = `/tmp/${tmpId}.zip`;
        const extractDir = `/tmp/${tmpId}-extract`;

        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Download
        await new Promise((resolve, reject) => {
            const file = fs.createWriteStream(zipPath);
            https.get(PHPBB_URL, (response) => {
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

        // phpBB extracts to phpBB3/ subfolder
        const phpbbSource = path.join(extractDir, 'phpBB3');
        if (!fs.existsSync(phpbbSource)) {
            // Try finding any folder with phpbb files
            const dirs = fs.readdirSync(extractDir).filter(d => fs.existsSync(path.join(extractDir, d, 'includes')));
            if (dirs.length === 0) throw new Error('phpBB extraction failed');
            var srcDir = path.join(extractDir, dirs[0]);
        } else {
            var srcDir = phpbbSource;
        }

        // Move to dest
        execSync(`cp -r "${srcDir}/." "${destDir}/"`, { stdio: 'ignore' });

        // Cleanup
        try { fs.unlinkSync(zipPath); } catch {}
        try { fs.rmSync(extractDir, { recursive: true }); } catch {}

        return { success: true };
    }

    static createConfig(destDir, config) {
        const configPath = path.join(destDir, 'config.php');

        const content = `<?php
$phpbb_config_path = 'config';

// Database
$dbms = 'dbal_mysqli';
$dbhost = '${config.dbHost || 'localhost'}';
$dbport = '';
$dbname = '${config.dbName}';
$dbuser = '${config.dbUser}';
$dbpasswd = '${config.dbPassword}';
$table_prefix = 'phpbb_';

$db_tools = false;
$db_proxied = false;

@define('PHPBB_INSTALLED', false);
@define('PHPBB_DISPLAY_HERALD', false);
?>`;

        fs.writeFileSync(configPath, content, 'utf8');
        try { execSync(`chmod 640 "${configPath}"`, { stdio: 'ignore' }); } catch {}

        return { success: true };
    }

    static isInstalled(destDir) {
        const configPath = path.join(destDir, 'config.php');
        if (!fs.existsSync(configPath)) return false;
        const content = fs.readFileSync(configPath, 'utf8');
        return content.includes("PHPBB_INSTALLED', true");
    }

    static getVersion(destDir) {
        const files = ['includes/constants.php', 'includes/functions.php', 'phpbb/version.json'];
        for (const f of files) {
            const fp = path.join(destDir, f);
            if (!fs.existsSync(fp)) continue;
            const content = fs.readFileSync(fp, 'utf8');
            const match = content.match(/PHPBB_VERSION['"]\s*,\s*['"]([^'"]+)/i) ||
                          content.match(/phpbb_version\s*=\s*['"]([^'"]+)/i);
            if (match) return match[1];
        }
        return null;
    }

    static removePhpbb(destDir) {
        if (fs.existsSync(destDir)) {
            const phpbbItems = [
                'cache', 'common.php', 'config.php', 'config',
                'docs', 'download', 'files', 'images',
                'includes', 'install', 'language', 'phpbb',
                'store', 'styles', 'vendor',
                'index.php', 'cron.php', 'viewforum.php',
                'viewtopic.php', 'posting.php', 'ucp.php',
                'mcp.php', 'search.php', 'memberlist.php',
                'help', 'adm', 'report.php'
            ];
            for (const item of phpbbItems) {
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

module.exports = PhpbbInstaller;
