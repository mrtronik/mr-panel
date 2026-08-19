const SslService = require('../services/SslService');
const WebsiteService = require('../services/WebsiteService');

exports.listCerts = async (req, res) => {
    try {
        const certs = await SslService.listCerts();
        const autoRenew = await SslService.checkAutoRenew();
        res.json({ certs, autoRenew });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getPage = async (req, res) => {
    try {
        const websites = await WebsiteService.listFromDB(req.session.user);
        res.render('ssl/index', { title: 'SSL Manager', websites });
    } catch (err) {
        res.render('ssl/index', { title: 'SSL Manager', websites: [] });
    }
};

exports.request = async (req, res) => {
    try {
        const { domain, webroot } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });
        const root = webroot || `/home/public_html/${domain}`;
        const status = await SslService.certStatus(domain);
        if (!status.installed) {
            await SslService.requestCert(domain, root);
        }
        try {
            await SslService.installToOls(domain);
        } catch (olsErr) {
            return res.json({ success: true, message: 'Certificate ready but OLS install failed: ' + olsErr.message });
        }
        await WebsiteService.updateSslStatus(domain, 'active');
        res.json({ success: true, message: status.installed ? 'Existing certificate installed to OLS' : 'Certificate requested & installed to OLS' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.renew = async (req, res) => {
    try {
        const { certName } = req.body;
        if (!certName) return res.status(400).json({ error: 'Certificate name required' });
        const result = await SslService.renewCert(certName);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.renewAll = async (req, res) => {
    try {
        const result = await SslService.renewAll();
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const { certName } = req.body;
        if (!certName) return res.status(400).json({ error: 'Certificate name required' });
        await SslService.removeFromOls(certName);
        const result = await SslService.deleteCert(certName);
        await WebsiteService.updateSslStatus(certName, 'none');
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.status = async (req, res) => {
    try {
        const { domain } = req.query;
        if (!domain) return res.status(400).json({ error: 'Domain required' });
        const status = await SslService.certStatus(domain);
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.install = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });
        const result = await SslService.installToOls(domain);
        await WebsiteService.updateSslStatus(domain, 'active');
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.toggleAutoRenew = async (req, res) => {
    try {
        const result = await SslService.enableAutoRenew();
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
