const ForwarderService = require('../services/ForwarderService');
const ActivityLogService = require('../services/ActivityLogService');

exports.index = async (req, res) => {
    try {
        const user = req.session.user;
        const forwarders = await ForwarderService.list(user);
        const emailAccounts = await ForwarderService.listEmailAccounts(user);
        res.render('forwarders/index', { title: 'Email Forwarders', forwarders, emailAccounts });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.create = async (req, res) => {
    try {
        const user = req.session.user;
        const { email_account_id, destination } = req.body;

        if (!email_account_id || !destination) {
            return res.status(400).json({ error: 'All fields required' });
        }

        await ForwarderService.create(email_account_id, destination);
        await ActivityLogService.log(user.id, 'forwarder-create', 'email', null, { destination }, req.ip);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.remove = async (req, res) => {
    try {
        const user = req.session.user;
        const fwd = await ForwarderService.findById(req.params.id);
        if (!fwd) return res.status(404).json({ error: 'Not found' });

        await ForwarderService.remove(req.params.id);
        await ActivityLogService.log(user.id, 'forwarder-delete', 'email', null, { destination: fwd.destination }, req.ip);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
