const { exec, execSync } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = util.promisify(exec);

class SslService {

    static CERTBOT_PATH = '/etc/letsencrypt/live';
    static OLS_CONF = '/usr/local/lsws/conf';

    static async requestCert(domain, webroot) {
        const cmd = `certbot certonly --webroot -w "${webroot}" -d "${domain}" --non-interactive --agree-tos --email admin@${domain} --force-renewal 2>&1`;
        try {
            const { stdout } = await execAsync(cmd, { timeout: 120000 });
			// PENTING: Fix permission segera setelah certbot selesai bikin cert!
            await this.fixCertPermissions(domain);
            return { success: true, message: stdout.trim() };
        } catch (err) {
            const msg = err.stdout ? err.stdout.trim() : err.message;
            throw new Error(msg);
        }
    }

    static async listCerts() {
        try {
            const { stdout } = await execAsync('certbot certificates 2>&1', { timeout: 30000 });
            return this.parseCertificates(stdout);
        } catch (err) {
            return [];
        }
    }

    static parseCertificates(output) {
        const certs = [];
        const blocks = output.split('Certificate Name:');
        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const nameMatch = block.match(/^\s*(.+?)$/m);
            const expiryMatch = block.match(/Expiry Date:\s+(.+?)\s+\(/);
            const pathMatch = block.match(/Certificate Path:\s+(.+?)$/m);
            const domainsMatch = block.match(/Domains:\s+(.+?)$/m);

            if (nameMatch) {
                certs.push({
                    name: nameMatch[1].trim(),
                    expiry: expiryMatch ? expiryMatch[1].trim() : '-',
                    path: pathMatch ? pathMatch[1].trim() : '-',
                    domains: domainsMatch ? domainsMatch[1].trim().split(' ') : [],
                    valid: expiryMatch ? new Date(expiryMatch[1]) > new Date() : false
                });
            }
        }
        return certs;
    }

    static async renewAll() {
        try {
            const { stdout } = await execAsync('certbot renew --quiet 2>&1', { timeout: 180000 });
			 // PENTING: Fix permission setelah renew, karena certbot sering reset permission ke 600!
            await this.fixCertPermissions(); // gak pakai domain spesifik, buat semua
            return { success: true, message: stdout.trim() || 'Renewal completed' };
        } catch (err) {
            throw new Error(err.stdout ? err.stdout.trim() : err.message);
        }
    }

    static async renewCert(certName) {
        try {
            const { stdout } = await execAsync(`certbot renew --cert-name "${certName}" 2>&1`, { timeout: 120000 });
            await this.fixCertPermissions(certName);
            return { success: true, message: stdout.trim() };
        } catch (err) {
            throw new Error(err.stdout ? err.stdout.trim() : err.message);
        }
    }

    static async deleteCert(certName) {
        try {
            const { stdout } = await execAsync(`certbot delete --cert-name "${certName}" --non-interactive 2>&1`, { timeout: 30000 });
            return { success: true, message: stdout.trim() };
        } catch (err) {
            throw new Error(err.stdout ? err.stdout.trim() : err.message);
        }
    }

    static async certStatus(domain) {
        const certPath = path.join(this.CERTBOT_PATH, domain, 'fullchain.pem');
        try {
            await fs.access(certPath);
            const cmd = `openssl x509 -in "${certPath}" -noout -dates -subject -issuer 2>&1`;
            const { stdout } = await execAsync(cmd, { timeout: 10000 });
            const notAfter = stdout.match(/notAfter=(.+)/);
            const subject = stdout.match(/subject=(.+)/);
            const issuer = stdout.match(/issuer=(.+)/);
            return {
                installed: true,
                expiry: notAfter ? notAfter[1].trim() : '-',
                subject: subject ? subject[1].trim() : '-',
                issuer: issuer ? issuer[1].trim() : '-',
                valid: notAfter ? new Date(notAfter[1]) > new Date() : false
            };
        } catch (e) {
            return { installed: false, expiry: '-', subject: '-', issuer: '-', valid: false };
        }
    }

    static async installToOls(domain) {
        const certDir = path.join(this.CERTBOT_PATH, domain);
        const certFile = path.join(certDir, 'fullchain.pem');
        const keyFile = path.join(certDir, 'privkey.pem');

        try {
            await fs.access(certFile);
            await fs.access(keyFile);
        } catch (e) {
            throw new Error('Certificate not found. Request certificate first.');
        }

        const vhostConfDir = path.join(this.OLS_CONF, 'vhosts', domain);
        await fs.mkdir(vhostConfDir, { recursive: true });

        const vhconfPath = path.join(vhostConfDir, 'vhconf.conf');
        let vhconf = '';
        try {
            vhconf = await fs.readFile(vhconfPath, 'utf8');
        } catch (e) {
            throw new Error(`vhconf.conf not found for ${domain}. Create the website first.`);
        }

        // Bersihin vhssl lama di VHost kalau ada (Regex multiline)
        vhconf = vhconf.replace(/vhssl\s*\{[\s\S]*?\}/g, '');

        // Tambahin .well-known context buat renewal certbot
        if (!vhconf.includes('.well-known')) {
            const wellKnown = `
context /.well-known/ {
  allowBrowse             1
  location                \$VH_ROOT/.well-known/
  allowOverride           0
  enhancedPrivacy         0
  noAccessControl         1
}`;
            vhconf = vhconf.trimEnd() + '\n' + wellKnown;
        }

        // Pasang SSL di VHost
        const sslBlock = `
vhssl  {
  keyFile                 ${keyFile}
  certFile                ${certFile}
  certChain               1
}`;
        vhconf = vhconf.trimEnd() + '\n' + sslBlock;
        await fs.writeFile(vhconfPath, vhconf, 'utf8');

        const httpdConf = path.join(this.OLS_CONF, 'httpd_config.conf');
        let conf = await fs.readFile(httpdConf, 'utf8');

        // LOGICA BARU: BRUTAL FORCE BIAR GAK PAKE REGEX RAPUH
        // Kalau listener SSL udah ada tapi gak punya keyFile/certFile, kita musnahkan blok itu dulu!
        if (conf.includes('listener SSL') && !conf.match(/listener SSL\s*\{[\s\S]*?keyFile/)) {
            conf = conf.replace(/listener SSL\s*\{[\s\S]*?\}/g, ''); // Hapus blok lama yang rusak
        }

        // Kalau sekarang gak ada listener SSL (baik dari awal atau baru dihapus), kita bikin baru yang LENGKAP
        if (!conf.includes('listener SSL')) {
            const sslListener = `
listener SSL {
  address                 *:443
  secure                  1
  keyFile                 ${keyFile}
  certFile                ${certFile}
  certChain               1
  map                     ${domain} ${domain}
}`;
            conf = conf.trimEnd() + '\n' + sslListener;
            await fs.writeFile(httpdConf, conf, 'utf8');
        } else {
            // Kalau listener SSL udah ada dan udah lengkap (punya keyFile), cuma nambah map domain baru
            let modified = false;
            if (!conf.includes(`map                     ${domain} ${domain}`)) {
                conf = conf.replace(
                    /(listener SSL\s*\{[\s\S]*?secure\s+1)/,
                    `$1\n  map                     ${domain} ${domain}`
                );
                modified = true;
            }
            if (modified) {
                await fs.writeFile(httpdConf, conf, 'utf8');
            }
        }

        // Fix Permission biar OLS bisa baca private key certbot
        try {
            await execAsync(`chmod 755 /etc/letsencrypt/live/ /etc/letsencrypt/archive/ /etc/letsencrypt/archive/${domain}/`);
            await execAsync(`chmod 644 "${keyFile}"`);
            await execAsync(`chown -R lsadm:nogroup "${vhostConfDir}"`);
            await execAsync(`chmod 664 "${vhconfPath}"`);
            await execAsync(`chown lsadm:nogroup "${httpdConf}"`);
        } catch (e) {}

        await this.reloadOls();
        return { success: true };
    }
    static async removeFromOls(domain) {
        const httpdConf = path.join(this.OLS_CONF, 'httpd_config.conf');
        try {
            let conf = await fs.readFile(httpdConf, 'utf8');
            // FIX BUG 2: Regex multiline buat hapus map domain
            const mapRegex = new RegExp(`\\n?  map\\s+${domain.replace('.', '\\.')}\\s+${domain.replace('.', '\\.')}`, 'g');
            conf = conf.replace(mapRegex, '');
            await fs.writeFile(httpdConf, conf, 'utf8');
        } catch (e) {}

        const vhconfPath = path.join(this.OLS_CONF, 'vhosts', domain, 'vhconf.conf');
        try {
            let vhconf = await fs.readFile(vhconfPath, 'utf8');
            // FIX BUG 2: Regex multiline buat hapus blok vhssl
            vhconf = vhconf.replace(/vhssl\s*\{[\s\S]*?\}/g, '');
            await fs.writeFile(vhconfPath, vhconf, 'utf8');
        } catch (e) {}

        await this.reloadOls();
        return { success: true };
    }
    static async reloadOls() {
        try {
            const { stdout, stderr } = await execAsync('/usr/local/lsws/bin/lswsctrl reload 2>&1', { timeout: 10000 });
            if (stderr && stderr.includes('error')) {
                console.error('OLS reload error:', stderr);
                return false;
            }
            return true;
        } catch (e) {
            console.error('OLS reload failed:', e.message);
            return false;
        }
    }

    static async checkAutoRenew() {
        try {
            const { stdout } = await execAsync('systemctl is-active certbot.timer 2>&1', { timeout: 5000 });
            return stdout.trim() === 'active';
        } catch (e) {
            return false;
        }
    }

    static async enableAutoRenew() {
        try {
            await execAsync('systemctl enable certbot.timer && systemctl start certbot.timer 2>&1', { timeout: 10000 });
            return { success: true };
        } catch (err) {
            throw new Error(err.message);
        }
    }
	    static async fixCertPermissions(domain = '') {
        try {
            // Buka akses folder certbot
            await execAsync('chmod 755 /etc/letsencrypt/live/ /etc/letsencrypt/archive/');
            
            // Kalau ada domain spesifik, buka archive + privkey domain itu
            if (domain) {
                await execAsync(`chmod 755 /etc/letsencrypt/archive/${domain}/`);
                const keyFile = path.join(this.CERTBOT_PATH, domain, 'privkey.pem');
                await execAsync(`chmod 644 "${keyFile}"`);
            } else {
                // Kalau gak ada domain (misal buat renew all), buat semua privkey bisa dibaca
                await execAsync('chmod 755 /etc/letsencrypt/archive/*/');
                await execAsync('chmod 644 /etc/letsencrypt/live/*/privkey.pem');
            }
            return true;
        } catch (e) {
            console.error('Failed to fix cert permissions:', e.message);
            return false;
        }
    }
}

module.exports = SslService;
