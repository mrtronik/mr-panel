const db = require('../config/db');

const PDNS_API_URL = process.env.PDNS_API_URL || 'http://127.0.0.1:8081';
const PDNS_API_KEY = process.env.PDNS_API_KEY || '';

class DnsService {

    static async getVpsIp() {
        const SystemSettingsService = require('./SystemSettingsService');
        return SystemSettingsService.getServerIp();
    }

    static async getNs1() {
        const SystemSettingsService = require('./SystemSettingsService');
        return SystemSettingsService.getNs1();
    }

    static async getNs2() {
        const SystemSettingsService = require('./SystemSettingsService');
        return SystemSettingsService.getNs2();
    }

    static async listZones(user) {
        if (!user || user.role === 'admin') {
            const [rows] = await db.execute('SELECT * FROM dns_zones ORDER BY name');
            return rows;
        }
        if (user.role === 'reseller') {
            const [rows] = await db.execute(
                'SELECT * FROM dns_zones WHERE user_id = ? OR user_id IN (SELECT id FROM users WHERE owner_id = ?) ORDER BY name',
                [user.id, user.id]
            );
            return rows;
        }
        const [rows] = await db.execute('SELECT * FROM dns_zones WHERE user_id = ? ORDER BY name', [user.id]);
        return rows;
    }

    static async findZone(name) {
        const [rows] = await db.execute('SELECT * FROM dns_zones WHERE name = ?', [name]);
        return rows[0] || null;
    }

    static async getZoneById(id) {
        const [rows] = await db.execute('SELECT * FROM dns_zones WHERE id = ?', [id]);
        return rows[0] || null;
    }

    static async createZone(name, user, mode = 'powerdns') {
        const existing = await this.findZone(name);
        if (existing) throw new Error('Zone already exists');
        const userId = user ? user.id : null;
        const vpsIp = await this.getVpsIp();
        const ns1Value = await this.getNs1();
        const ns2Value = await this.getNs2();
        if (mode === 'powerdns') {
            try { await this.pdnsCreateZone(name, ns1Value, ns2Value); } catch (e) { console.error('[DNS] PowerDNS create zone warning:', e.message); }
        }
        const [result] = await db.execute('INSERT INTO dns_zones (name, user_id, mode, status) VALUES (?, ?, ?, ?)', [name, userId, mode, 'active']);
        const zoneId = result.insertId;
        if (mode === 'powerdns' && zoneId) {
            const recordName = name;
            await db.execute('INSERT INTO dns_records (zone_id, name, type, content, ttl, prio) VALUES (?, ?, ?, ?, ?, ?)', [zoneId, recordName, 'NS', ns1Value, 86400, null]);
            await db.execute('INSERT INTO dns_records (zone_id, name, type, content, ttl, prio) VALUES (?, ?, ?, ?, ?, ?)', [zoneId, recordName, 'NS', ns2Value, 86400, null]);
            await db.execute('INSERT INTO dns_records (zone_id, name, type, content, ttl, prio) VALUES (?, ?, ?, ?, ?, ?)', [zoneId, recordName, 'A', vpsIp, 3600, null]);
            await db.execute('INSERT INTO dns_records (zone_id, name, type, content, ttl, prio) VALUES (?, ?, ?, ?, ?, ?)', [zoneId, 'www.' + name, 'CNAME', name + '.', 3600, null]);
            await db.execute('INSERT INTO dns_records (zone_id, name, type, content, ttl, prio) VALUES (?, ?, ?, ?, ?, ?)', [zoneId, recordName, 'MX', 'mx.' + name + '.', 3600, 10]);
            try {
                const soa = 'ns1.' + name + '. admin.' + name + '. 2026081001 10800 3600 604800 3600';
                const ns1Fqdn = ns1Value.endsWith('.') ? ns1Value : ns1Value + '.';
                const ns2Fqdn = ns2Value.endsWith('.') ? ns2Value : ns2Value + '.';
                const rrsets = [
                    { name: name + '.', type: 'SOA', ttl: 3600, changetype: 'REPLACE', records: [{ content: soa, disabled: false, auth: true }] },
                    { name: name + '.', type: 'NS', ttl: 86400, changetype: 'REPLACE', records: [{ content: ns1Fqdn, disabled: false, auth: true }, { content: ns2Fqdn, disabled: false, auth: true }] },
                    { name: name + '.', type: 'A', ttl: 3600, changetype: 'REPLACE', records: [{ content: vpsIp, disabled: false, auth: true }] },
                    { name: 'www.' + name + '.', type: 'CNAME', ttl: 3600, changetype: 'REPLACE', records: [{ content: name + '.', disabled: false, auth: true }] },
                    { name: name + '.', type: 'MX', ttl: 3600, changetype: 'REPLACE', records: [{ content: '10 mx.' + name + '.', disabled: false, auth: true }] }
                ];
                await this.pdnsApi('PATCH', '/api/v1/servers/localhost/zones/' + name + '.', { rrsets });
            } catch (e) { console.error('[DNS] PowerDNS sync warning:', e.message); }
        }
        return true;
    }

    static async syncFromPowerdns(user) {
        if (!PDNS_API_KEY) throw new Error('PowerDNS API key not configured');
        const pdnsZones = await this.pdnsApi('GET', '/api/v1/servers/localhost/zones');
        let imported = 0;
        for (const zone of pdnsZones) {
            const name = zone.name.replace(/\.$/, '');
            const existing = await this.findZone(name);
            if (!existing) {
                await db.execute('INSERT INTO dns_zones (name, user_id, mode, status) VALUES (?, ?, ?, ?)', [name, user.id, 'powerdns', 'active']);
                imported++;
            }
        }
        return imported;
    }

    static async deleteZoneFromPowerdns(name) {
        if (!PDNS_API_KEY) return;
        try { await this.pdnsDeleteZone(name); } catch (e) {
            console.error('[DNS] PowerDNS force delete error:', name, e.message);
        }
    }

    static async deleteZone(id) {
        const [rows] = await db.execute('SELECT * FROM dns_zones WHERE id = ?', [id]);
        if (rows.length === 0) throw new Error('Zone not found');
        const zone = rows[0];
        if (zone.mode === 'powerdns') {
            try { await this.pdnsDeleteZone(zone.name); } catch (e) {
                console.error('[DNS] PowerDNS delete zone error:', zone.name, e.message);
            }
        }
        await db.execute('DELETE FROM dns_records WHERE zone_id = ?', [id]);
        await db.execute('DELETE FROM dns_zones WHERE id = ?', [id]);
        return true;
    }

    static async listRecords(zoneId) {
        const [rows] = await db.execute('SELECT * FROM dns_records WHERE zone_id = ? ORDER BY type, name', [zoneId]);
        return rows;
    }

    static async findRecord(id) {
        const [rows] = await db.execute('SELECT * FROM dns_records WHERE id = ?', [id]);
        return rows[0] || null;
    }

    static async addRecord(zoneId, type, name, content, ttl = 3600, prio = null) {
        const zone = await this.getZoneById(zoneId);
        if (!zone) throw new Error('Zone not found');
        const recordName = (name === zone.name || name === '@') ? zone.name : name + '.' + zone.name;
        await db.execute('INSERT INTO dns_records (zone_id, name, type, content, ttl, prio) VALUES (?, ?, ?, ?, ?, ?)', [zoneId, recordName, type.toUpperCase(), content, ttl, prio]);
        if (zone.mode === 'powerdns') {
            try { await this.pdnsSyncZone(zone.name); } catch (e) { console.error('[DNS] Sync after addRecord error:', e.message); }
        }
        return true;
    }

    static async updateRecord(id, type, name, content, ttl = 3600, prio = null) {
        const record = await this.findRecord(id);
        if (!record) throw new Error('Record not found');
        const zone = await this.getZoneById(record.zone_id);
        const recordName = (name === zone.name || name === '@') ? zone.name : name + '.' + zone.name;
        await db.execute('UPDATE dns_records SET type = ?, name = ?, content = ?, ttl = ?, prio = ? WHERE id = ?', [type.toUpperCase(), recordName, content, ttl, prio, id]);
        if (zone.mode === 'powerdns') { try { await this.pdnsSyncZone(zone.name); } catch (e) { console.error('[DNS] Sync after updateRecord error:', e.message); } }
        return true;
    }

    static async deleteRecord(id) {
        const record = await this.findRecord(id);
        if (!record) throw new Error('Record not found');
        const zone = await this.getZoneById(record.zone_id);
        await db.execute('DELETE FROM dns_records WHERE id = ?', [id]);
        if (zone && zone.mode === 'powerdns') { try { await this.pdnsSyncZone(zone.name); } catch (e) { console.error('[DNS] Sync after deleteRecord error:', e.message); } }
        return true;
    }

    static async createWebsiteRecords(domain, user) {
        let zone = await this.findZone(domain);
        if (!zone) { await this.createZone(domain, user, 'powerdns'); zone = await this.findZone(domain); }
        const existing = await this.listRecords(zone.id);
        const vpsIp = await this.getVpsIp();
        const ns1Value = await this.getNs1();
        const ns2Value = await this.getNs2();
        if (!existing.some(r => r.type === 'NS')) {
            await this.addRecord(zone.id, 'NS', '@', ns1Value, 86400);
            await this.addRecord(zone.id, 'NS', '@', ns2Value, 86400);
        }
        if (!existing.some(r => r.type === 'A' && r.name === domain)) {
            await this.addRecord(zone.id, 'A', '@', vpsIp, 3600);
        }
        if (!existing.some(r => r.type === 'MX')) {
            await this.addRecord(zone.id, 'MX', '@', 'mx.' + domain, 3600, 10);
        }
        return true;
    }

    static async createSubdomainRecords(subdomain, targetDomain) {
        const zone = await this.findZone(targetDomain);
        if (!zone) return false;
        const fullDomain = subdomain + '.' + targetDomain;
        const existing = await this.listRecords(zone.id);
        const vpsIp = await this.getVpsIp();
        if (!existing.some(r => r.type === 'A' && r.name === fullDomain)) {
            await this.addRecord(zone.id, 'A', subdomain, vpsIp, 3600);
        }
        return true;
    }

    static async pdnsCreateZone(name, ns1Value, ns2Value) {
        if (!PDNS_API_KEY) return;
        const ns1 = ns1Value || await this.getNs1();
        const ns2 = ns2Value || await this.getNs2();
        const body = {
            name: name + '.', kind: 'NATIVE',
            nameservers: [(ns1.endsWith('.') ? ns1 : ns1 + '.'), (ns2.endsWith('.') ? ns2 : ns2 + '.')]
        };
        await this.pdnsApi('POST', '/api/v1/servers/localhost/zones', body);
    }

    static async pdnsDeleteZone(name) {
        if (!PDNS_API_KEY) return;
        await this.pdnsApi('DELETE', '/api/v1/servers/localhost/zones/' + name + '.');
    }

    static async pdnsSyncZone(name) {
        if (!PDNS_API_KEY) return;
        const zone = await this.findZone(name);
        if (!zone) return;
        const records = await this.listRecords(zone.id);
        const zoneFqdn = name.endsWith('.') ? name : name + '.';

        const grouped = {};
        records.forEach(r => {
            const recordName = (r.name === zone.name || r.name === '@') ? zoneFqdn : (r.name.endsWith('.') ? r.name : r.name + '.');
            const key = recordName + ':' + r.type;
            if (!grouped[key]) grouped[key] = { name: recordName, type: r.type, ttl: r.ttl || 3600, changetype: 'REPLACE', records: [] };
            let content = r.content;
            if (r.type === 'MX' && r.prio) content = r.prio + ' ' + content;
            if (r.type === 'NS' || r.type === 'CNAME') content = content.endsWith('.') ? content : content + '.';
            if (r.type === 'TXT' && !content.startsWith('"')) {
                content = '"' + content.replace(/"/g, '') + '"';
            }
            grouped[key].records.push({ content: content, disabled: false, auth: true });
        });
        const rrsets = Object.values(grouped);

        if (rrsets.length === 0) return;
        console.log('[DNS] Syncing', rrsets.length, 'rrsets for', name);
        await this.pdnsApi('PATCH', '/api/v1/servers/localhost/zones/' + zoneFqdn, { rrsets });
    }

    static async pdnsApi(method, path, body = null) {
        const url = PDNS_API_URL + path;
        const opts = { method, headers: { 'X-API-Key': PDNS_API_KEY, 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const response = await fetch(url, opts);
        if (!response.ok) {
            const t = await response.text();
            console.error('[DNS] PowerDNS API error:', method, path, response.status, t);
            throw new Error('PDNS ' + response.status + ': ' + t);
        }
        if (response.status === 204 || method === 'DELETE') return true;
        const text = await response.text();
        return text ? JSON.parse(text) : true;
    }

    static getRecordTypes() { return ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'PTR']; }
    static getTtlOptions() {
        return [{ l: '60s', v: 60 }, { l: '300s', v: 300 }, { l: '3600s', v: 3600 }, { l: '86400s', v: 86400 }];
    }
}

module.exports = DnsService;
