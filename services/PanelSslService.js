const { exec, execSync } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const execAsync = util.promisify(exec);

class PanelSslService {

    static OLS_CONF = '/usr/local/lsws/conf';

    // Panel vhost dir reuses OLS vhost structure but serves webroot for certbot
    static getVhostDir(domain) {
        return `${this.OLS_CONF}/vhosts/${domain}`;
    }

    static getWebroot(domain) {
        return `${this.getVhostDir(domain)}/webroot`;
    }

    static getCertPath(domain, file) {
        return `/etc/letsencrypt/live/${domain}/${file}`;
    }

    static async certExists(domain) {
        try {
            await fs.promises.access(this.getCertPath(domain, 'fullchain.pem'));
            await fs.promises.access(this.getCertPath(domain, 'privkey.pem'));
            return true;
        } catch (e) {
            return false;
        }
    }

    // Create a minimal OLS vhost for the panel domain to serve .well-known
    // so certbot can validate via webroot.
    static async ensurePanelVhost(domain) {
        const vhostDir = this.getVhostDir(domain);
        const webroot = this.getWebroot(domain);

        await fs.promises.mkdir(vhostDir, { recursive: true });
        await fs.promises.mkdir(webroot, { recursive: true });

        const vhconf = `docRoot ${webroot}

enableGzip 1

index {
  indexFiles index.html
}

accessControl {
  deny
  allow *
}

rewrite {
  enable 1
  autoLoadHtaccess 0
}

context /.well-known/ {
  allowBrowse             1
  location                $VH_ROOT/webroot/.well-known/
  allowOverride           0
  enhancedPrivacy         0
  noAccessControl         1
}

errorlog $VH_ROOT/logs/error.log {
  logLevel INFO
  rollingSize 10M
  useServer 1
}

accessLog $VH_ROOT/logs/access.log {
  compressArchive 0
  logReferer 1
  keepDays 7
  rollingSize 10M
  logUserAgent 1
  useServer 0
}
`;
        await fs.promises.writeFile(`${vhostDir}/vhconf.conf`, vhconf);

        const indexHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Panel</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111">
<div style="text-align:center;color:#fff"><h1>${domain}</h1><p>MR Panel HTTPS setup</p></div>
</body></html>`;
        await fs.promises.writeFile(`${webroot}/index.html`, indexHtml);

        return { vhostDir, webroot };
    }

    // Register vhost + map in httpd_config.conf
    static async registerVhost(domain) {
        const httpdConfPath = `${this.OLS_CONF}/httpd_config.conf`;
        let conf = await fs.promises.readFile(httpdConfPath, 'utf8');

        const vhostBlock = `virtualhost ${domain} {
  vhRoot                  ${this.getVhostDir(domain)}
  configFile              ${this.getVhostDir(domain)}/vhconf.conf
  allowSymbolLink         1
  enableScript            1
  restrained              1
}
`;

        // Register virtualhost block if not exists
        if (!conf.includes(`virtualhost ${domain} {`)) {
            // Insert before first listener block
            const lines = conf.split('\n');
            let insertIdx = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith('listener ')) {
                    insertIdx = i;
                    break;
                }
            }
            if (insertIdx === -1) insertIdx = lines.length;
            lines.splice(insertIdx, 0, vhostBlock);
            conf = lines.join('\n');
        }

        // Add map in Default listener
        if (!conf.includes(`map                     ${domain} ${domain}`)) {
            const mapLine = `  map                     ${domain} ${domain}`;
            const lines = conf.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith('map') && lines[i].includes('Example')) {
                    lines.splice(i + 1, 0, mapLine);
                    break;
                }
            }
            conf = lines.join('\n');
        }

        await fs.promises.writeFile(httpdConfPath, conf);
    }

    static async requestCert(domain, webroot) {
        const email = `admin@${domain}`;
        const cmd = `certbot certonly --webroot -w "${webroot}" -d "${domain}" --non-interactive --agree-tos --email "${email}" --force-renewal 2>&1`;
        const { stdout } = await execAsync(cmd, { timeout: 120000 });
        await this.fixCertPermissions(domain);
        return { success: true, message: stdout.trim() };
    }

    static async fixCertPermissions(domain) {
        try {
            await execAsync('chmod 755 /etc/letsencrypt/live/ /etc/letsencrypt/archive/');
            await execAsync(`chmod 755 /etc/letsencrypt/archive/${domain}/`);
            await execAsync(`chmod 644 ${this.getCertPath(domain, 'privkey.pem')}`);
        } catch (e) {}
    }

    static async reloadOls() {
        try {
            await execAsync('/usr/local/lsws/bin/lswsctrl reload 2>&1', { timeout: 10000 });
            return true;
        } catch (e) {
            console.error('OLS reload failed:', e.message);
            return false;
        }
    }

    // Keep the vhost (webroot) accessible for certbot renewal, but we
    // don't map the domain on port 80's OLS for normal traffic — the Node
    // app itself serves HTTPS on 1708. We only need .well-known to be
    // reachable for renewal. Simplest: leave the vhost registered on default
    // listener so http://domain/.well-known works for renewal.
    static async setupPanelSsl(domain) {
        const { webroot } = await this.ensurePanelVhost(domain);
        await this.registerVhost(domain);
        await this.reloadOls();

        const exists = await this.certExists(domain);
        if (exists) {
            await this.fixCertPermissions(domain);
            return { success: true, reused: true, webroot };
        }

        const result = await this.requestCert(domain, webroot);
        return { success: true, reused: false, ...result, webroot };
    }

    static async removePanelVhost(domain) {
        const httpdConfPath = `${this.OLS_CONF}/httpd_config.conf`;
        try {
            let conf = await fs.promises.readFile(httpdConfPath, 'utf8');
            const lines = conf.split('\n');
            const newLines = [];
            let skip = false;
            for (let i = 0; i < lines.length; i++) {
                const t = lines[i].trim();
                if (t === `virtualhost ${domain} {`) { skip = true; continue; }
                if (skip && t === '}') { skip = false; continue; }
                if (skip) continue;
                if (t.startsWith('map') && t.includes(domain)) continue;
                newLines.push(lines[i]);
            }
            await fs.promises.writeFile(httpdConfPath, newLines.join('\n'));
        } catch (e) {}

        try {
            const vhostDir = this.getVhostDir(domain);
            if (fs.existsSync(vhostDir)) {
                fs.rmSync(vhostDir, { recursive: true, force: true });
            }
        } catch (e) {}

        await this.reloadOls();
        return { success: true };
    }

    // Delete the cert for the panel domain (used when disabling)
    static async deleteCert(domain) {
        try {
            await execAsync(`certbot delete --cert-name "${domain}" --non-interactive 2>&1`, { timeout: 30000 });
        } catch (e) {}
        return { success: true };
    }

    static async panelCertStatus(domain) {
        const exists = await this.certExists(domain);
        if (!exists) return { installed: false, valid: false };
        try {
            const certPath = this.getCertPath(domain, 'fullchain.pem');
            const { stdout } = await execAsync(`openssl x509 -in "${certPath}" -noout -dates -subject 2>&1`, { timeout: 10000 });
            const notAfter = stdout.match(/notAfter=(.+)/);
            return {
                installed: true,
                expiry: notAfter ? notAfter[1].trim() : '-',
                valid: notAfter ? new Date(notAfter[1]) > new Date() : false
            };
        } catch (e) {
            return { installed: true, valid: false, error: e.message };
        }
    }
}

module.exports = PanelSslService;