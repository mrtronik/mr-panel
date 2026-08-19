const WordpressToolkitService = require('../services/WordpressToolkitService');
const WebsiteService = require('../services/WebsiteService');

exports.getPage = async (req, res) => {
    try {
        res.render('wordpress-toolkit/index', { title: 'WordPress Toolkit' });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.listInstalls = async (req, res) => {
    try {
        const installs = await WordpressToolkitService.listInstalls();
        res.json({ success: true, installs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateCore = async (req, res) => {
    try {
        const { domain } = req.body;
        const website = await WebsiteService.findByDomain(domain);
        if (!website) return res.status(404).json({ error: 'Website not found' });
        const result = await WordpressToolkitService.updateCore(website.document_root);
        res.json({ success: true, message: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateAllPlugins = async (req, res) => {
    try {
        const { domain } = req.body;
        const website = await WebsiteService.findByDomain(domain);
        if (!website) return res.status(404).json({ error: 'Website not found' });
        const result = await WordpressToolkitService.updateAllPlugins(website.document_root);
        res.json({ success: true, message: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateAllThemes = async (req, res) => {
    try {
        const { domain } = req.body;
        const website = await WebsiteService.findByDomain(domain);
        if (!website) return res.status(404).json({ error: 'Website not found' });
        const result = await WordpressToolkitService.updateAllThemes(website.document_root);
        res.json({ success: true, message: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.managePlugin = async (req, res) => {
    try {
        const { domain, plugin, action } = req.body;
        const website = await WebsiteService.findByDomain(domain);
        if (!website) return res.status(404).json({ error: 'Website not found' });
        let result;
        if (action === 'activate') result = await WordpressToolkitService.activatePlugin(website.document_root, plugin);
        else if (action === 'deactivate') result = await WordpressToolkitService.deactivatePlugin(website.document_root, plugin);
        else if (action === 'delete') result = await WordpressToolkitService.deletePlugin(website.document_root, plugin);
        else if (action === 'update') result = await WordpressToolkitService.updatePlugin(website.document_root, plugin);
        else return res.status(400).json({ error: 'Invalid action' });
        res.json({ success: true, message: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.manageTheme = async (req, res) => {
    try {
        const { domain, theme, action } = req.body;
        const website = await WebsiteService.findByDomain(domain);
        if (!website) return res.status(404).json({ error: 'Website not found' });
        let result;
        if (action === 'activate') result = await WordpressToolkitService.activateTheme(website.document_root, theme);
        else if (action === 'delete') result = await WordpressToolkitService.deleteTheme(website.document_root, theme);
        else if (action === 'update') result = await WordpressToolkitService.updateTheme(website.document_root, theme);
        else return res.status(400).json({ error: 'Invalid action' });
        res.json({ success: true, message: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.pluginInfo = async (req, res) => {
    try {
        const { domain } = req.query;
        const website = await WebsiteService.findByDomain(domain);
        if (!website) return res.status(404).json({ error: 'Website not found' });
        const plugins = await WordpressToolkitService.pluginInfo(website.document_root);
        res.json({ success: true, plugins });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.themeInfo = async (req, res) => {
    try {
        const { domain } = req.query;
        const website = await WebsiteService.findByDomain(domain);
        if (!website) return res.status(404).json({ error: 'Website not found' });
        const themes = await WordpressToolkitService.themeInfo(website.document_root);
        res.json({ success: true, themes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
