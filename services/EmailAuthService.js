const db = require('../config/db');
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class EmailAuthService {

    static async setupDomain(domain) {
        const results = { dkim: false, spf: false, dmarc: false, postfix: false };

        try {
            // 1. Generate DKIM key
            await this.generateDkimKey(domain);
            results.dkim = true;
        } catch (e) {
            console.error('[EmailAuth] DKIM key gen failed:', e.message);
        }

        try {
            // 2. Add DNS records (SPF, DKIM, DMARC)
            await this.addDnsRecords(domain);
            results.spf = true;
            results.dmarc = true;
        } catch (e) {
            console.error('[EmailAuth] DNS records failed:', e.message);
        }

        try {
            // 3. Configure Postfix
            this.configurePostfix(domain);
            results.postfix = true;
        } catch (e) {
            console.error('[EmailAuth] Postfix config failed:', e.message);
        }

        return results;
    }

    static async generateDkimKey(domain) {
        const keyDir = `/etc/opendkim/keys/${domain}`;
        fs.mkdirSync(keyDir, { recursive: true });

        const privateKeyPath = path.join(keyDir, 'default.private');
        const pubKeyPath = path.join(keyDir, 'default.pub');

        // Generate 2048-bit RSA key pair
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' }
        });

        // Extract raw modulus and exponent for DNS record
        const pubKeyObj = crypto.createPublicKey(publicKey);
        const keyDetail = pubKeyObj.export({ format: 'jwk' });
        const modulus = Buffer.from(keyDetail.n, 'base64url');
        const exponent = Buffer.from(keyDetail.e, 'base64url');

        // Format as OpenDKIM-style public key (base64, 64-char lines)
        const rawKey = modulus.toString('base64');
        const formattedKey = rawKey.match(/.{1,64}/g).join('\n');

        // Write private key (OpenDKIM format)
        const dkimPriv = `-----BEGIN RSA PRIVATE KEY-----\n${privateKey.replace(/-----BEGIN RSA PRIVATE KEY-----\n?/, '').replace(/\n?-----END RSA PRIVATE KEY-----/, '').match(/.{1,64}/g).join('\n')}\n-----END RSA PRIVATE KEY-----`;
        fs.writeFileSync(privateKeyPath, dkimPriv, { mode: 0o600 });

        // Write public key (OpenDKIM format)
        fs.writeFileSync(pubKeyPath, `-----BEGIN PUBLIC KEY-----\n${formattedKey}\n-----END PUBLIC KEY-----`);

        // Fix ownership
        try {
            execSync(`chown -R opendkim:opendkim /etc/opendkim/keys/${domain}`, { timeout: 5000 });
        } catch (e) {}

        console.log(`[EmailAuth] DKIM key generated for ${domain}`);
        return formattedKey;
    }

    static getDkimPublicKey(domain) {
        const pubKeyPath = `/etc/opendkim/keys/${domain}/default.pub`;
        if (!fs.existsSync(pubKeyPath)) return null;
        const content = fs.readFileSync(pubKeyPath, 'utf8');
        const match = content.match(/-----BEGIN PUBLIC KEY-----\n([\s\S]+)\n-----END PUBLIC KEY-----/);
        if (!match) return null;
        return match[1].replace(/\n/g, '');
    }

    static async addDnsRecords(domain) {
        const DnsService = require('./DnsService');
        const zone = await DnsService.findZone(domain);
        if (!zone) {
            console.log(`[EmailAuth] Zone not found for ${domain}, creating...`);
            const user = { id: null };
            await DnsService.createZone(domain, user, 'powerdns');
        }

        const existingZone = await DnsService.findZone(domain);
        if (!existingZone) throw new Error(`Zone ${domain} could not be created`);
        const zoneId = existingZone.id;
        const records = await DnsService.listRecords(zoneId);

        // SPF
        if (!records.some(r => r.type === 'TXT' && r.name === domain && r.content.includes('v=spf1'))) {
            const SystemSettingsService = require('./SystemSettingsService');
            const serverIp = await SystemSettingsService.getServerIp();
            await DnsService.addRecord(zoneId, 'TXT', '@', `v=spf1 ip4:${serverIp} a mx ~all`, 3600);
        }

        // DKIM
        const dkimPub = this.getDkimPublicKey(domain);
        if (dkimPub) {
            const dkimName = `default._domainkey.${domain}`;
            if (!records.some(r => r.type === 'TXT' && r.name === dkimName)) {
                await DnsService.addRecord(zoneId, 'TXT', `default._domainkey`, `v=DKIM1; k=rsa; p=${dkimPub}`, 3600);
            }
        }

        // DMARC
        const dmarcName = `_dmarc.${domain}`;
        if (!records.some(r => r.type === 'TXT' && r.name === dmarcName)) {
            await DnsService.addRecord(zoneId, 'TXT', `_dmarc`, `v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}; pct=100`, 3600);
        }

        console.log(`[EmailAuth] DNS records added for ${domain}: SPF, DKIM, DMARC`);
    }

    static async setupSubdomain(subdomain, parentDomain) {
        const fullDomain = subdomain + '.' + parentDomain;
        const results = { dkim: false, spf: false, dmarc: false, postfix: false };

        try {
            // DKIM: use parent domain's key if exists, otherwise generate
            const parentKeyPath = `/etc/opendkim/keys/${parentDomain}/default.private`;
            const subKeyDir = `/etc/opendkim/keys/${fullDomain}`;
            fs.mkdirSync(subKeyDir, { recursive: true });
            if (fs.existsSync(parentKeyPath)) {
                fs.copyFileSync(parentKeyPath, path.join(subKeyDir, 'default.private'));
                try { execSync(`chown opendkim:opendkim ${subKeyDir}/default.private`, { timeout: 5000 }); } catch (e) {}
            } else {
                await this.generateDkimKey(fullDomain);
            }
            results.dkim = true;
        } catch (e) {
            console.error('[EmailAuth] Subdomain DKIM failed:', e.message);
        }

        try {
            // DNS records go into parent zone
            const DnsService = require('./DnsService');
            const zone = await DnsService.findZone(parentDomain);
            if (zone) {
                const records = await DnsService.listRecords(zone.id);

                if (!records.some(r => r.type === 'TXT' && r.name === fullDomain && r.content.includes('v=spf1'))) {
                    const SystemSettingsService = require('./SystemSettingsService');
                    const serverIp = await SystemSettingsService.getServerIp();
                    await DnsService.addRecord(zone.id, 'TXT', subdomain, `v=spf1 ip4:${serverIp} a mx ~all`, 3600);
                }

                const dkimPub = this.getDkimPublicKey(fullDomain) || this.getDkimPublicKey(parentDomain);
                if (dkimPub) {
                    const dkimName = `default._domainkey.${fullDomain}`;
                    if (!records.some(r => r.type === 'TXT' && r.name === dkimName)) {
                        await DnsService.addRecord(zone.id, 'TXT', `default._domainkey.${subdomain}`, `v=DKIM1; k=rsa; p=${dkimPub}`, 3600);
                    }
                }

                const dmarcName = `_dmarc.${fullDomain}`;
                if (!records.some(r => r.type === 'TXT' && r.name === dmarcName)) {
                    await DnsService.addRecord(zone.id, 'TXT', `_dmarc.${subdomain}`, `v=DMARC1; p=quarantine; rua=mailto:postmaster@${parentDomain}; pct=100`, 3600);
                }
            }
            results.spf = true;
            results.dmarc = true;
        } catch (e) {
            console.error('[EmailAuth] Subdomain DNS failed:', e.message);
        }

        try {
            this.configurePostfix(fullDomain);
            results.postfix = true;
        } catch (e) {}

        return results;
    }

    static configurePostfix(domain) {
        // Update SigningTable to include this domain
        const signingTable = '/etc/opendkim/SigningTable';
        const keyTable = '/etc/opendkim/KeyTable';
        const trustedHosts = '/etc/opendkim/TrustedHosts';

        let signing = fs.existsSync(signingTable) ? fs.readFileSync(signingTable, 'utf8') : '';
        let keytbl = fs.existsSync(keyTable) ? fs.readFileSync(keyTable, 'utf8') : '';
        let trusted = fs.existsSync(trustedHosts) ? fs.readFileSync(trustedHosts, 'utf8') : '';

        const signingEntry = `*@${domain} default._domainkey.${domain}`;
        const keyEntry = `default._domainkey.${domain} ${domain}:default:/etc/opendkim/keys/${domain}/default.private`;
        const trustedEntry = domain;

        if (!signing.includes(signingEntry)) {
            signing += '\n' + signingEntry;
            fs.writeFileSync(signingTable, signing);
        }

        if (!keytbl.includes(keyEntry)) {
            keytbl += '\n' + keyEntry;
            fs.writeFileSync(keyTable, keytbl);
        }

        if (!trusted.includes(trustedEntry)) {
            trusted += '\n' + trustedEntry;
            fs.writeFileSync(trustedHosts, trusted);
        }

        // Ensure opendkim.conf has proper settings
        const confPath = '/etc/opendkim.conf';
        if (fs.existsSync(confPath)) {
            let conf = fs.readFileSync(confPath, 'utf8');
            if (!conf.includes('Socket')) {
                conf += '\nSocket               inet:8891@localhost\n';
                fs.writeFileSync(confPath, conf);
            }
        }

        // Restart services
        try { execSync('systemctl restart opendkim', { timeout: 10000 }); } catch (e) {}
        try { execSync('systemctl restart postfix', { timeout: 10000 }); } catch (e) {}

        console.log(`[EmailAuth] Postfix configured for ${domain}`);
    }
}

module.exports = EmailAuthService;
