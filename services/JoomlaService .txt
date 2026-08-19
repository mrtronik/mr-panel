const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const JOOMLA_URL = 'https://downloads.joomla.org/cms/joomla5/5.2.3/Joomla_5.2.3-Stable-Full_Package.zip';

class JoomlaInstaller {

    static async downloadAndExtract(destDir) {
        const tmpId = 'joomla-' + Date.now();
        const zipPath = `/tmp/${tmpId}.zip`;
        const extractDir = `/tmp/${tmpId}-extract`;

        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Download
        await new Promise((resolve, reject) => {
            const file = fs.createWriteStream(zipPath);
            https.get(JOOMLA_URL, (response) => {
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

        // Joomla extracts to root of extract dir
        execSync(`cp -r "${extractDir}/." "${destDir}/"`, { stdio: 'ignore' });

        // Cleanup
        try { fs.unlinkSync(zipPath); } catch {}
        try { fs.rmSync(extractDir, { recursive: true }); } catch {}

        return { success: true };
    }

    static createConfiguration(destDir, config) {
        const configPath = path.join(destDir, 'configuration.php');

        // Joomla requires a specific format - create minimal config for installation
        const content = `<?php
class JConfig {
    public $offline = false;
    public $offline_message = 'This site is down for maintenance. Please check back again soon.';
    public $display_offline_message = 1;
    public $offline_image = '';
    public $sitename = '${config.siteName || 'Joomla Site'}';
    public $editor = 'tinymce';
    public $captcha = '0';
    public $list_limit = 20;
    public $access = 1;
    public $debug = false;
    public $debug_lang = false;
    public $dbtype = 'mysqli';
    public $host = '${config.dbHost || 'localhost'}';
    public $user = '${config.dbUser}';
    public $password = '${config.dbPassword}';
    public $db = '${config.dbName}';
    public $dbprefix = 'jos_';
    public $ftp_enable = 0;
    public $ftp_host = '';
    public $ftp_port = '';
    public $ftp_user = '';
    public $ftp_pass = '';
    public $ftp_root = '';
    public $ftp_timeout = 30;
    public $tmp_path = '${destDir}/tmp';
    public $log_path = '${destDir}/administrator/logs';
    public $sef = 1;
    public $sef_rewrite = 0;
    public $sef_suffix = 0;
    public $unicodetranslit = 1;
    public $feed_limit = 10;
    public $feed_email = '';
    public $secret = '${require('crypto').randomBytes(32).toString('hex')}';
    public $mailonline = 1;
    public $mailer = 'mail';
    public $mailfrom = '';
    public $fromname = '${config.siteName || 'Joomla Site'}';
    public $sendmail = '/usr/sbin/sendmail';
    public $smtpauth = 0;
    public $smtpsecure = 'none';
    public $smtphost = '';
    public $smtpport = 25;
    public $smtpuser = '';
    public $smtppass = '';
    public $smtptimeout = 10;
    public $caching = 0;
    public $cache_handler = 'file';
    public $cachetime = '15';
    public $cache_platformprefix = 'joomla';
    public $MetaDesc = '';
    public $MetaKeys = '';
    public $MetaTitle = 1;
    public $MetaAuthor = 1;
    public $MetaVersion = '0';
    public $robots = '';
    public $sitename_blank = 0;
    public $language = 'en-GB';
    public $helpurl = 'https://help.joomla.org/';
    public $offset = 'UTC';
    public $hideTitle = 0;
}
?>`;

        fs.writeFileSync(configPath, content, 'utf8');
        try { execSync(`chmod 640 "${configPath}"`, { stdio: 'ignore' }); } catch {}

        return { success: true };
    }

    static isInstalled(destDir) {
        const configPath = path.join(destDir, 'configuration.php');
        if (!fs.existsSync(configPath)) return false;
        const content = fs.readFileSync(configPath, 'utf8');
        return content.includes("public $db =") && !content.includes("$db = ''");
    }

    static getVersion(destDir) {
        const versionFile = path.join(destDir, 'libraries', 'src', 'Version.php');
        if (!fs.existsSync(versionFile)) return null;
        const content = fs.readFileSync(versionFile, 'utf8');
        const match = content.match(/MAJOR_VERSION\s*=\s*(\d+)/);
        const match2 = content.match(/MINOR_VERSION\s*=\s*(\d+)/);
        const match3 = content.match(/PATCH_VERSION\s*=\s*(\d+)/);
        if (match && match2 && match3) return `${match[1]}.${match2[1]}.${match3[1]}`;
        return null;
    }

    static removeJoomla(destDir) {
        if (fs.existsSync(destDir)) {
            const joomlaItems = [
                'administrator', 'components', 'images', 'includes',
                'installation', 'language', 'layouts', 'libraries',
                'media', 'modules', 'plugins', 'templates', 'tmp', 'xmlrpc',
                'cli', 'tests',
                'configuration.php', 'htaccess.txt', 'web.config.txt',
                'robots.txt.dist', 'favicon.ico', 'index.php',
                'LICENSE.txt', 'README.txt', 'CONTRIBUTING.md'
            ];
            for (const item of joomlaItems) {
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

module.exports = JoomlaInstaller;
