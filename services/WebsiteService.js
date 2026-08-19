const { execFile } = require('child_process');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');

const OLS_BASE = '/usr/local/lsws';
const OLS_CONF = `${OLS_BASE}/conf`;
const OLS_VHOSTS = `${OLS_CONF}/vhosts`;
const OLS_HTTPD_CONF = `${OLS_CONF}/httpd_config.conf`;

class WebsiteService {

    static async create(domain, documentRoot) {
        const vhostDir = `${OLS_VHOSTS}/${domain}`;

        await fs.mkdir(documentRoot, { recursive: true });
        await fs.mkdir(vhostDir, { recursive: true });

        await this.createDefaultIndex(domain, documentRoot);
        await this.createVhostConf(domain, documentRoot);
        await this.addToHttpdConf(domain, documentRoot);

        try {
            await execAsync(`chown -R lsadm:nogroup "${vhostDir}"`);
            await execAsync(`chown -R lsadm:nogroup "${documentRoot}"`);
            await execAsync(`chown lsadm:nogroup "${OLS_HTTPD_CONF}"`);
        } catch (e) {}

        await this.reloadOLS();

        return { success: true, domain, documentRoot };
    }

    static async delete(domain) {
        const vhostDir = `${OLS_VHOSTS}/${domain}`;

        try {
            await fs.rm(vhostDir, { recursive: true, force: true });
        } catch (e) {}

        await this.removeFromHttpdConf(domain);
        await this.reloadOLS();

        return { success: true };
    }

    static async createDefaultIndex(domain, documentRoot) {
        const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ${domain}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { background: #fff; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); padding: 60px; text-align: center; max-width: 600px; }
        h1 { color: #333; margin-bottom: 16px; font-size: 2.5rem; }
        p { color: #666; font-size: 1.1rem; line-height: 1.6; margin-bottom: 24px; }
        .badge { display: inline-block; background: #667eea; color: #fff; padding: 8px 20px; border-radius: 50px; font-size: 0.9rem; }
        .footer { margin-top: 30px; color: #999; font-size: 0.85rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${domain}</h1>
        <p>This website is successfully configured and ready to use.</p>
        <span class="badge">Powered by OpenLiteSpeed + MR Panel</span>
        <div class="footer">MR Panel Server Management</div>
    </div>
</body>
</html>`;

        await fs.writeFile(path.join(documentRoot, 'index.html'), indexHtml);
    }

    static async createVhostConf(domain, documentRoot) {
        const conf = `docRoot ${documentRoot}

enableGzip 1

index {
  indexFiles index.php, index.html
}

accessControl {
  deny
  allow *
}

errorlog $VH_ROOT/logs/error.log {
  logLevel DEBUG
  rollingSize 10M
  useServer 1
}

accessLog $VH_ROOT/logs/access.log {
  compressArchive 0
  logReferer 1
  keepDays 30
  rollingSize 10M
  logUserAgent 1
  useServer 0
}

rewrite {
  enable 1
  autoLoadHtaccess 1
}
`;

        await fs.writeFile(`${OLS_VHOSTS}/${domain}/vhconf.conf`, conf);
    }

    static async fixExistingVhost(domain) {
        const vhostDir = `${OLS_VHOSTS}/${domain}`;
        const vhconfPath = `${vhostDir}/vhconf.conf`;

        if (!await fs.access(vhconfPath).then(() => true).catch(() => false)) return;

        let vhconf = await fs.readFile(vhconfPath, 'utf8');

        // Replace entire rewrite block with autoLoadHtaccess
        vhconf = vhconf.replace(
            /rewrite\s*\{[\s\S]*?\}/,
            `rewrite {
  enable 1
  autoLoadHtaccess 1
}`
        );
        await fs.writeFile(vhconfPath, vhconf);
    }

    static async addToHttpdConf(domain, documentRoot) {
        try {
            let httpdConf = await fs.readFile(OLS_HTTPD_CONF, 'utf8');

            // Check if virtualhost already exists
            if (httpdConf.includes(`virtualhost ${domain}`)) {
                // Virtualhost exists, just make sure there's a map line
                if (!httpdConf.includes(`map`) || !httpdConf.split('\n').some(l => l.trim().startsWith('map') && l.includes(domain))) {
                    // Find the Default listener's map Example line and add after it
                    const lines = httpdConf.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].trim().startsWith('map') && lines[i].includes('Example')) {
                            lines.splice(i + 1, 0, `  map                     ${domain} ${domain}`);
                            await fs.writeFile(OLS_HTTPD_CONF, lines.join('\n'));
                            break;
                        }
                    }
                }
                return;
            }

            const vhostBlock = `virtualhost ${domain} {
  vhRoot                  ${documentRoot}
  configFile              ${OLS_VHOSTS}/${domain}/vhconf.conf
  allowSymbolLink         1
  enableScript            1
  restrained              1
}
`;

            const mapLine = `  map                     ${domain} ${domain}`;

            const lines = httpdConf.split('\n');

            // Find the last virtualhost block and insert after it
            let lastVhostEnd = -1;
            let inVhost = false;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith('virtualhost ')) {
                    inVhost = true;
                }
                if (inVhost && lines[i].trim() === '}') {
                    lastVhostEnd = i;
                    inVhost = false;
                }
            }

            if (lastVhostEnd > -1) {
                lines.splice(lastVhostEnd + 1, 0, '', vhostBlock);
            } else {
                // Insert before first listener
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].trim().startsWith('listener ')) {
                        lines.splice(i, 0, vhostBlock);
                        break;
                    }
                }
            }

            // Add map line after "map Example Example" in Default listener
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith('map') && lines[i].includes('Example')) {
                    lines.splice(i + 1, 0, mapLine);
                    break;
                }
            }

            await fs.writeFile(OLS_HTTPD_CONF, lines.join('\n'));
        } catch (err) {
            console.error('Failed to update httpd_config.conf:', err.message);
        }
    }

    static async removeFromHttpdConf(domain) {
        try {
            let httpdConf = await fs.readFile(OLS_HTTPD_CONF, 'utf8');

            const lines = httpdConf.split('\n');
            const newLines = [];
            let skipBlock = false;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim() === `virtualhost ${domain} {`) {
                    skipBlock = true;
                    continue;
                }
                if (skipBlock && lines[i].trim() === '}') {
                    skipBlock = false;
                    continue;
                }
                if (skipBlock) continue;

                const trimmed = lines[i].trim();
                if (trimmed.startsWith(`map`) && trimmed.includes(domain)) {
                    continue;
                }

                newLines.push(lines[i]);
            }

            await fs.writeFile(OLS_HTTPD_CONF, newLines.join('\n'));
        } catch (err) {
            console.error('Failed to update httpd_config.conf:', err.message);
        }
    }

    static reloadOLS() {
        return new Promise((resolve) => {
            execFile(`${OLS_BASE}/bin/lswsctrl`, ['reload'], (err, stdout) => {
                resolve({ success: !err, output: stdout || err?.message });
            });
        });
    }

    static async listFromDB(user = null) {
        const db = require('../config/db');
        if (!user || user.role === 'admin') {
            const [rows] = await db.execute('SELECT w.*, u.name AS owner_name FROM websites w LEFT JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC');
            return rows;
        }
        if (user.role === 'reseller') {
            const [rows] = await db.execute(
                `SELECT w.*, u.name AS owner_name FROM websites w
                 LEFT JOIN users u ON w.user_id = u.id
                 WHERE w.user_id IN (SELECT id FROM users WHERE owner_id = ?)
                 OR w.user_id = ?
                 OR w.user_id IS NULL
                 ORDER BY w.created_at DESC`,
                [user.id, user.id]
            );
            return rows;
        }
        const [rows] = await db.execute(
            'SELECT w.*, u.name AS owner_name FROM websites w LEFT JOIN users u ON w.user_id = u.id WHERE w.user_id = ? ORDER BY w.created_at DESC',
            [user.id]
        );
        return rows;
    }

    static async findById(id) {
        const db = require('../config/db');
        const [rows] = await db.execute('SELECT w.*, u.name AS owner_name FROM websites w LEFT JOIN users u ON w.user_id = u.id WHERE w.id = ?', [id]);
        return rows[0] || null;
    }

    static async countByUser(userId) {
        const db = require('../config/db');
        const [rows] = await db.execute('SELECT COUNT(*) as cnt FROM websites WHERE user_id = ?', [userId]);
        return rows[0].cnt;
    }

    static async findByDomain(domain) {
        const db = require('../config/db');
        const [rows] = await db.execute('SELECT * FROM websites WHERE domain = ?', [domain]);
        return rows[0] || null;
    }

    static async save(domain, documentRoot, phpVersion = '8.2', userId = null) {
        const db = require('../config/db');
        const [result] = await db.execute(
            'INSERT INTO websites (domain, document_root, php_version, status, user_id) VALUES (?, ?, ?, ?, ?)',
            [domain, documentRoot, phpVersion, 'active', userId]
        );
        return result.insertId;
    }

    static async updateStatus(id, status) {
        const db = require('../config/db');
        await db.execute('UPDATE websites SET status = ? WHERE id = ?', [status, id]);
    }

    static async remove(id) {
        const db = require('../config/db');
        await db.execute('DELETE FROM websites WHERE id = ?', [id]);
    }

    static async changeOwner(id, userId) {
        const db = require('../config/db');
        const [rows] = await db.execute('SELECT domain FROM websites WHERE id = ?', [id]);
        const domain = rows[0]?.domain;

        await db.execute('UPDATE websites SET user_id = ? WHERE id = ?', [userId, id]);

        if (domain) {
            try { await db.execute('UPDATE dns_zones SET user_id = ? WHERE name = ?', [userId, domain]); } catch (e) {}
            try { await db.execute('UPDATE email_accounts SET user_id = ? WHERE domain = ?', [userId, domain]); } catch (e) {}
        }
    }

    static async updatePhpVersion(id, phpVersion) {
        const db = require('../config/db');
        const website = await this.findById(id);
        if (!website) throw new Error('Website not found');

        await db.execute('UPDATE websites SET php_version = ? WHERE id = ?', [phpVersion, id]);
        await this.updateVhostPhp(website.domain, phpVersion);
        await this.reloadOLS();

        return { success: true, phpVersion };
    }

    static async updateVhostPhp(domain, phpVersion) {
        const vhconfPath = `${OLS_VHOSTS}/${domain}/vhconf.conf`;
        try {
            let conf = await fs.readFile(vhconfPath, 'utf8');

            const handler = `lsapi:php${phpVersion.replace('.', '')}`;

            if (conf.includes('phpHandler')) {
                conf = conf.replace(/phpHandler\s+\S+/, `phpHandler ${handler}`);
            } else {
                conf = `phpHandler ${handler}\n\n` + conf;
            }

            await fs.writeFile(vhconfPath, conf);
        } catch (err) {
            console.error('Failed to update vhost PHP handler:', err.message);
        }
    }

    static async getAvailablePhpVersions() {
        const PhpService = require('./PhpService');
        return PhpService.getInstalledVersions();
    }

    static async updateSslStatus(domain, sslStatus) {
        const db = require('../config/db');
        await db.execute('UPDATE websites SET ssl_status = ? WHERE domain = ?', [sslStatus, domain]);
    }
}

module.exports = WebsiteService;
