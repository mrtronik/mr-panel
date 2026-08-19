const SubdomainService = require('../services/SubdomainService');
const WebsiteService = require('../services/WebsiteService');
const ActivityLogService = require('../services/ActivityLogService');
const DnsService = require('../services/DnsService');

exports.index = async (req, res) => {
    try {
        const user = req.session.user;
        const websites = await WebsiteService.listFromDB(user);
        res.render('subdomains/index', { title: 'Subdomains', websites });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.listByWebsite = async (req, res) => {
    try {
        const website = await WebsiteService.findById(req.params.websiteId);
        if (!website) return res.status(404).json({ error: 'Website not found' });

        const subdomains = await SubdomainService.list(req.params.websiteId);
        res.json({ success: true, subdomains, website });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.create = async (req, res) => {
    try {
        const user = req.session.user;
        const { website_id, subdomain, target_folder } = req.body;

        if (!website_id || !subdomain || !target_folder) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const website = await WebsiteService.findById(website_id);
        if (!website) return res.status(404).json({ error: 'Website not found' });

        const safeSubdomain = subdomain.replace(/[^a-zA-Z0-9.-]/g, '');
        const safeFolder = target_folder.replace(/[^a-zA-Z0-9_\-\/]/g, '');

        await SubdomainService.create(website_id, safeSubdomain, safeFolder, website.document_root);

        try {
            const parts = safeSubdomain.split('.');
            if (parts.length >= 2) {
                const prefix = parts[0];
                const parentDomain = parts.slice(1).join('.');
                await DnsService.createSubdomainRecords(prefix, parentDomain);
                try {
                    const EmailAuthService = require('../services/EmailAuthService');
                    await EmailAuthService.setupSubdomain(prefix, parentDomain);
                } catch (emailErr) {
                    console.error('Email auth setup warning:', emailErr.message);
                }
            }
        } catch (dnsErr) {
            console.error('DNS auto-record failed:', dnsErr.message);
        }

        await ActivityLogService.log(user.id, 'subdomain-create', 'subdomain', null, {
            domain: safeSubdomain, website: website.domain
        }, req.ip);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.remove = async (req, res) => {
    try {
        const user = req.session.user;
        const sub = await SubdomainService.findById(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Subdomain not found' });

        await SubdomainService.remove(req.params.id);

        try {
            const parts = sub.subdomain.split('.');
            if (parts.length >= 2) {
                const prefix = parts[0];
                const parentDomain = parts.slice(1).join('.');
                const zone = await DnsService.findZone(parentDomain);
                if (zone) {
                    const records = await DnsService.listRecords(zone.id);
                    const aRecord = records.find(r => r.type === 'A' && r.name === sub.subdomain);
                    if (aRecord) await DnsService.deleteRecord(aRecord.id);
                }
            }
        } catch (dnsErr) {
            console.error('DNS record removal failed:', dnsErr.message);
        }

        await ActivityLogService.log(user.id, 'subdomain-delete', 'subdomain', null, {
            domain: sub.subdomain
        }, req.ip);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
