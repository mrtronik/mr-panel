const DnsService = require('../services/DnsService');
const ActivityLogService = require('../services/ActivityLogService');

exports.index = async (req, res) => {
    try {
        const user = req.session.user;
        const zones = await DnsService.listZones(user);
        res.render('dns/index', { title: 'DNS Manager', zones });
    } catch (err) { res.status(500).send(err.message); }
};

exports.zoneDetail = async (req, res) => {
    try {
        const zone = await DnsService.getZoneById(req.params.id);
        if (!zone) return res.redirect('/dns');
        const records = await DnsService.listRecords(zone.id);
        const recordTypes = DnsService.getRecordTypes();
        const ttlOptions = DnsService.getTtlOptions();
        res.render('dns/zone', { title: zone.name + ' - DNS', zone, records, recordTypes, ttlOptions });
    } catch (err) { res.status(500).send(err.message); }
};

exports.createZone = async (req, res) => {
    try {
        const user = req.session.user;
        const { name, mode } = req.body;
        if (!name) return res.status(400).json({ error: 'Zone name required' });
        await DnsService.createZone(name.toLowerCase().trim(), user, mode || 'powerdns');
        await ActivityLogService.log(user.id, 'dns-create-zone', 'dns', null, { name }, req.ip);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.syncFromPowerdns = async (req, res) => {
    try {
        const user = req.session.user;
        const imported = await DnsService.syncFromPowerdns(user);
        await ActivityLogService.log(user.id, 'dns-sync-pdns', 'dns', null, { imported }, req.ip);
        res.json({ success: true, imported });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteZone = async (req, res) => {
    try {
        const user = req.session.user;
        const zone = await DnsService.getZoneById(req.params.id);
        if (!zone) return res.status(404).json({ error: 'Zone not found' });
        await DnsService.deleteZone(req.params.id);
        await ActivityLogService.log(user.id, 'dns-delete-zone', 'dns', null, { name: zone.name }, req.ip);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.addRecord = async (req, res) => {
    try {
        const user = req.session.user;
        const { zone_id, type, name, content, ttl, prio } = req.body;
        if (!zone_id || !type || !content) return res.status(400).json({ error: 'Required fields missing' });
        await DnsService.addRecord(zone_id, type, name || '@', content, parseInt(ttl) || 3600, prio ? parseInt(prio) : null);
        await ActivityLogService.log(user.id, 'dns-add-record', 'dns', zone_id, { type, name, content }, req.ip);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateRecord = async (req, res) => {
    try {
        const user = req.session.user;
        const { type, name, content, ttl, prio } = req.body;
        await DnsService.updateRecord(req.params.id, type, name || '@', content, parseInt(ttl) || 3600, prio ? parseInt(prio) : null);
        await ActivityLogService.log(user.id, 'dns-update-record', 'dns', req.params.id, { type, name, content }, req.ip);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteRecord = async (req, res) => {
    try {
        const user = req.session.user;
        const record = await DnsService.findRecord(req.params.id);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        await DnsService.deleteRecord(req.params.id);
        await ActivityLogService.log(user.id, 'dns-delete-record', 'dns', req.params.id, { name: record.name, type: record.type }, req.ip);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.resyncZone = async (req, res) => {
    try {
        const zone = await DnsService.getZoneById(req.params.id);
        if (!zone) return res.status(404).json({ error: 'Zone not found' });
        await DnsService.pdnsSyncZone(zone.name);
        res.json({ success: true, message: 'Zone ' + zone.name + ' re-synced to PowerDNS' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
