const db = require('../config/db');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');

const OLS_BASE = '/usr/local/lsws';
const OLS_VHOSTS = `${OLS_BASE}/conf/vhosts`;

class WebsiteSettingsService {

    // ═══════════════════════════════════════
    //  Shared: Get website document root
    // ═══════════════════════════════════════
    static async getDocRoot(domain) {
        const [rows] = await db.execute('SELECT document_root FROM websites WHERE domain = ?', [domain]);
        return rows[0] ? rows[0].document_root : `/home/public_html/${domain}`;
    }

    static async getHtaccessPath(domain) {
        const docRoot = await this.getDocRoot(domain);
        return path.join(docRoot, '.htaccess');
    }

    static async readHtaccess(domain) {
        const htPath = await this.getHtaccessPath(domain);
        try { return await fs.readFile(htPath, 'utf8'); } catch { return ''; }
    }

    static async writeHtaccess(domain, content) {
        const htPath = await this.getHtaccessPath(domain);
        await fs.writeFile(htPath, content);
        try { await execAsync(`chown lsadm:nogroup "${htPath}"`); } catch {}
    }

    // ═══════════════════════════════════════
    //  1. Error Pages
    // ═══════════════════════════════════════
    static async getErrorPages(domain) {
        const docRoot = await this.getDocRoot(domain);
        const [rows] = await db.execute('SELECT settings FROM website_settings WHERE domain = ?', [domain]);
        let settings = {};
        if (rows[0] && rows[0].settings) {
            try { settings = JSON.parse(rows[0].settings); } catch {}
        }
        const errorPages = settings.error_pages || {};
        // Check which files actually exist
        const result = {};
        for (const [code, file] of Object.entries(errorPages)) {
            const filePath = path.join(docRoot, file);
            try { await fs.access(filePath); result[code] = { file, exists: true }; }
            catch { result[code] = { file, exists: false }; }
        }
        return result;
    }

    static async saveErrorPage(domain, code, filePath) {
        await this.ensureSettingsRow(domain);
        const [rows] = await db.execute('SELECT settings FROM website_settings WHERE domain = ?', [domain]);
        const settings = rows[0] ? JSON.parse(rows[0].settings || '{}') : {};
        if (!settings.error_pages) settings.error_pages = {};
        settings.error_pages[code] = filePath;
        await db.execute('UPDATE website_settings SET settings = ? WHERE domain = ?', [JSON.stringify(settings), domain]);
        return true;
    }

    static async removeErrorPage(domain, code) {
        await this.ensureSettingsRow(domain);
        const [rows] = await db.execute('SELECT settings FROM website_settings WHERE domain = ?', [domain]);
        const settings = rows[0] ? JSON.parse(rows[0].settings || '{}') : {};
        if (settings.error_pages) delete settings.error_pages[code];
        await db.execute('UPDATE website_settings SET settings = ? WHERE domain = ?', [JSON.stringify(settings), domain]);
        return true;
    }

    static async generateErrorPagesHtaccess(domain) {
        const pages = await this.getErrorPages(domain);
        const codes = Object.keys(pages);
        if (codes.length === 0) return;
        let ht = await this.readHtaccess(domain);
        // Remove old error page rules
        ht = ht.replace(/# BEGIN Error Pages[\s\S]*?# END Error Pages\n?/g, '');
        if (codes.length > 0) {
            let block = '# BEGIN Error Pages\n';
            for (const [code, info] of Object.entries(pages)) {
                block += `ErrorDocument ${code} ${info.file}\n`;
            }
            block += '# END Error Pages\n';
            ht = block + ht;
        }
        await this.writeHtaccess(domain, ht);
    }

    // ═══════════════════════════════════════
    //  2. Hotlink Protection
    // ═══════════════════════════════════════
    static async getHotlink(domain) {
        await this.ensureSettingsRow(domain);
        const [rows] = await db.execute('SELECT settings FROM website_settings WHERE domain = ?', [domain]);
        const settings = rows[0] ? JSON.parse(rows[0].settings || '{}') : {};
        return settings.hotlink || { enabled: false, allowed_domains: [] };
    }

    static async saveHotlink(domain, enabled, allowedDomains) {
        await this.ensureSettingsRow(domain);
        const [rows] = await db.execute('SELECT settings FROM website_settings WHERE domain = ?', [domain]);
        const settings = rows[0] ? JSON.parse(rows[0].settings || '{}') : {};
        settings.hotlink = { enabled, allowed_domains: allowedDomains || [] };
        await db.execute('UPDATE website_settings SET settings = ? WHERE domain = ?', [JSON.stringify(settings), domain]);
        await this.generateHotlinkHtaccess(domain);
        return true;
    }

    static async generateHotlinkHtaccess(domain) {
        const hotlink = await this.getHotlink(domain);
        let ht = await this.readHtaccess(domain);
        ht = ht.replace(/# BEGIN Hotlink Protection[\s\S]*?# END Hotlink Protection\n?/g, '');
        if (hotlink.enabled) {
            const allowed = (hotlink.allowed_domains || []).map(d => d.replace(/^https?:\/\//, '')).join('|');
            let block = '# BEGIN Hotlink Protection\n';
            block += 'RewriteEngine On\n';
            block += `RewriteCond %{HTTP_REFERER} !^$ ${allowed ? '\nRewriteCond %{HTTP_REFERER} !^https?://(' + allowed + ') [NC]' : ''}\n`;
            block += 'RewriteCond %{HTTP_REFERER} !^https?://' + domain.replace(/\./g, '\\.') + ' [NC]\n';
            block += 'RewriteRule \\.(jpg|jpeg|png|gif|bmp|webp|svg|mp4|mp3|pdf|zip|rar)$ - [F,NC]\n';
            block += '# END Hotlink Protection\n';
            ht = block + ht;
        }
        await this.writeHtaccess(domain, ht);
    }

    // ═══════════════════════════════════════
    //  3. Directory Privacy
    // ═══════════════════════════════════════
    static async getDirectoryPrivacy(domain) {
        await this.ensureSettingsRow(domain);
        const [rows] = await db.execute('SELECT settings FROM website_settings WHERE domain = ?', [domain]);
        const settings = rows[0] ? JSON.parse(rows[0].settings || '{}') : {};
        return settings.directory_privacy || [];
    }

    static async addDirectoryPrivacy(domain, dirPath, username, password) {
        const dirs = await this.getDirectoryPrivacy(domain);
        // Check if path already exists
        if (dirs.some(d => d.path === dirPath)) throw new Error('Path already protected');
        // Hash password with htpasswd
        const docRoot = await this.getDocRoot(domain);
        const fullDir = path.join(docRoot, dirPath);
        await fs.mkdir(fullDir, { recursive: true });
        // Create htpasswd file
        const htpasswdPath = path.join(fullDir, '.htpasswd');
        const { stdout } = await execAsync(`htpasswd -bc "${htpasswdPath}" "${username}" "${password}" 2>&1 || echo "htpasswd not found"`);
        if (stdout.includes('htpasswd not found')) {
            // Use node crypto as fallback
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(password).digest('base64');
            await fs.writeFile(htpasswdPath, `${username}:{SHA}${hash}\n`);
        }
        try { await execAsync(`chown lsadm:nogroup "${htpasswdPath}"`); } catch {}
        dirs.push({ path: dirPath, username, htpasswd: `.htpasswd` });
        await this.saveDirectoryPrivacy(domain, dirs);
        await this.generateDirectoryPrivacyHtaccess(domain);
        return true;
    }

    static async removeDirectoryPrivacy(domain, dirPath) {
        let dirs = await this.getDirectoryPrivacy(domain);
        dirs = dirs.filter(d => d.path !== dirPath);
        await this.saveDirectoryPrivacy(domain, dirs);
        // Remove .htpasswd file
        const docRoot = await this.getDocRoot(domain);
        const htpasswdPath = path.join(docRoot, dirPath, '.htpasswd');
        try { await fs.unlink(htpasswdPath); } catch {}
        await this.generateDirectoryPrivacyHtaccess(domain);
        return true;
    }

    static async saveDirectoryPrivacy(domain, dirs) {
        await this.ensureSettingsRow(domain);
        const [rows] = await db.execute('SELECT settings FROM website_settings WHERE domain = ?', [domain]);
        const settings = rows[0] ? JSON.parse(rows[0].settings || '{}') : {};
        settings.directory_privacy = dirs;
        await db.execute('UPDATE website_settings SET settings = ? WHERE domain = ?', [JSON.stringify(settings), domain]);
    }

    static async generateDirectoryPrivacyHtaccess(domain) {
        const dirs = await this.getDirectoryPrivacy(domain);
        const docRoot = await this.getDocRoot(domain);
        // Remove old privacy rules from root .htaccess
        let ht = await this.readHtaccess(domain);
        ht = ht.replace(/# BEGIN Directory Privacy[\s\S]*?# END Directory Privacy\n?/g, '');
        await this.writeHtaccess(domain, ht);
        // Write individual .htaccess in each protected dir
        for (const d of dirs) {
            const dirHtPath = path.join(docRoot, d.path, '.htaccess');
            const content = `# Directory Privacy - Managed by MR Panel
AuthType Basic
AuthName "Restricted Area"
AuthUserFile ${path.join(docRoot, d.path, '.htpasswd')}
Require valid-user
`;
            await fs.writeFile(dirHtPath, content);
            try { await execAsync(`chown lsadm:nogroup "${dirHtPath}"`); } catch {}
        }
    }

    // ═══════════════════════════════════════
    //  4. MIME Types
    // ═══════════════════════════════════════
    static async getMimeTypes(domain) {
        await this.ensureSettingsRow(domain);
        const [rows] = await db.execute('SELECT settings FROM website_settings WHERE domain = ?', [domain]);
        const settings = rows[0] ? JSON.parse(rows[0].settings || '{}') : {};
        return settings.mime_types || {};
    }

    static async saveMimeTypes(domain, mimeTypes) {
        await this.ensureSettingsRow(domain);
        const [rows] = await db.execute('SELECT settings FROM website_settings WHERE domain = ?', [domain]);
        const settings = rows[0] ? JSON.parse(rows[0].settings || '{}') : {};
        settings.mime_types = mimeTypes;
        await db.execute('UPDATE website_settings SET settings = ? WHERE domain = ?', [JSON.stringify(settings), domain]);
        await this.generateMimeTypesHtaccess(domain);
        return true;
    }

    static async generateMimeTypesHtaccess(domain) {
        const mimeTypes = await this.getMimeTypes(domain);
        let ht = await this.readHtaccess(domain);
        ht = ht.replace(/# BEGIN MIME Types[\s\S]*?# END MIME Types\n?/g, '');
        const entries = Object.entries(mimeTypes);
        if (entries.length > 0) {
            let block = '# BEGIN MIME Types\n';
            for (const [ext, mime] of entries) {
                const safeExt = ext.startsWith('.') ? ext : '.' + ext;
                block += `AddType ${mime} ${safeExt}\n`;
            }
            block += '# END MIME Types\n';
            ht = block + ht;
        }
        await this.writeHtaccess(domain, ht);
    }

    // ═══════════════════════════════════════
    //  Helper: Ensure settings row exists
    // ═══════════════════════════════════════
    static async ensureSettingsRow(domain) {
        const [existing] = await db.execute('SELECT id FROM website_settings WHERE domain = ?', [domain]);
        if (existing.length === 0) {
            await db.execute('INSERT INTO website_settings (domain, settings) VALUES (?, ?)', [domain, '{}']);
        }
    }
}

module.exports = WebsiteSettingsService;
