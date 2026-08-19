const ParkedDomainService = require('../services/ParkedDomainService');
const WebsiteService = require('../services/WebsiteService');
const ActivityLogService = require('../services/ActivityLogService');

exports.index = async (req, res) => {
    try {
        const user = req.session.user;
        const websites = await WebsiteService.listFromDB(user);
        const parkedDomains = await ParkedDomainService.listAll(user);
        res.render('parked/index', { title: 'Parked Domains', websites, parkedDomains });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.create = async (req, res) => {
    try {
        const user = req.session.user;
        const { website_id, parked_domain } = req.body;

        if (!website_id || !parked_domain) {
            return res.status(400).json({ error: 'All fields required' });
        }

        await ParkedDomainService.create(website_id, parked_domain);
        await ActivityLogService.log(user.id, 'parked-create', 'parked-domain', null, { domain: parked_domain }, req.ip);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.remove = async (req, res) => {
    try {
        const user = req.session.user;
        const parked = await ParkedDomainService.findById(req.params.id);
        if (!parked) return res.status(404).json({ error: 'Not found' });

        await ParkedDomainService.remove(req.params.id);
        await ActivityLogService.log(user.id, 'parked-delete', 'parked-domain', null, { domain: parked.parked_domain }, req.ip);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
