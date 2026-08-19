const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const JOOMLA_URL = 'https://update.joomla.org/releases/6.1.2/Joomla_6.1.2-Stable-Full_Package.zip';

class JoomlaInstaller {

  static async downloadAndExtract(destDir) {
    const tmpId = 'joomla-' + Date.now();
    const zipPath = `/tmp/${tmpId}.zip`;
    const extractDir = `/tmp/${tmpId}-extract`;

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    // ✅ FIX: curl silent, ga buffer output
    console.log('[JOOMLA] Downloading from', JOOMLA_URL);
    execSync(`curl -sL -o "${zipPath}" "${JOOMLA_URL}"`, { 
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024  // 10MB
    });

    // Verify download
    if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 1000000) {
        throw new Error('Joomla download failed - file too small or missing');
    }
    console.log('[JOOMLA] Download done, size:', fs.statSync(zipPath).size);

    // ✅ FIX: stdio ignore + maxBuffer besar
    console.log('[JOOMLA] Extracting...');
    execSync(`rm -rf "${extractDir}" && mkdir -p "${extractDir}" && unzip -o -q "${zipPath}" -d "${extractDir}"`, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: 'ignore'  // ← ga buffer output unzip
    });

    // Copy to destination
    execSync(`cp -r "${extractDir}/." "${destDir}/"`, { 
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: 'ignore'
    });

    // Remove default index.html
    const defaultIndex = path.join(destDir, 'index.html');
    if (fs.existsSync(defaultIndex)) {
        try { fs.unlinkSync(defaultIndex); } catch {}
    }

    // Cleanup
    try { fs.unlinkSync(zipPath); } catch {}
    try { execSync(`rm -rf "${extractDir}"`, { stdio: 'ignore' }); } catch {}

    console.log('[JOOMLA] Download and extract done');
    return { success: true };
}
    static createConfiguration(destDir, config) {
        const configPath = path.join(destDir, 'configuration.php');

        const content = `<?php
class JConfig {
    public $offline = false;
    public $offline_message = 'This site is down for maintenance.<br /> Please check back again soon.';
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
    public $secret = '${crypto.randomBytes(32).toString('hex')}';
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

    // ✅ FIX: Hapus seluruh folder, buat baru (sama kayak WP & Laravel)
    static removeJoomla(destDir) {
        if (fs.existsSync(destDir)) {
            try { execSync(`rm -rf "${destDir}"`, { stdio: 'ignore' }); } catch {}
        }
        fs.mkdirSync(destDir, { recursive: true });
        try { execSync(`chown lsadm:nogroup "${destDir}" 2>/dev/null || true`, { stdio: 'ignore' }); } catch {}
        return { success: true };
    }
}

module.exports = JoomlaInstaller;