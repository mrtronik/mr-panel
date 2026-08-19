const WebsiteSettingsService = require('../services/WebsiteSettingsService');
const ActivityLogService = require('../services/ActivityLogService');

// ═══════════════════════════════════════
//  1. Error Pages
// ═══════════════════════════════════════
exports.getErrorPages = async (req, res) => {
    try {
        const domain = req.params.domain;
        const pages = await WebsiteSettingsService.getErrorPages(domain);
        res.json({ success: true, pages });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveErrorPage = async (req, res) => {
    try {
        const { domain, code, file } = req.body;
        if (!domain || !code || !file) return res.status(400).json({ error: 'Required fields missing' });
        await WebsiteSettingsService.saveErrorPage(domain, code, file);
        await WebsiteSettingsService.generateErrorPagesHtaccess(domain);
        await ActivityLogService.log(req.session.user.id, 'error-page-save', 'website', null, { domain, code, file }, req.ip);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.removeErrorPage = async (req, res) => {
    try {
        const { domain, code } = req.body;
        await WebsiteSettingsService.removeErrorPage(domain, code);
        await WebsiteSettingsService.generateErrorPagesHtaccess(domain);
        await ActivityLogService.log(req.session.user.id, 'error-page-remove', 'website', null, { domain, code }, req.ip);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ═══════════════════════════════════════
//  2. Hotlink Protection
// ═══════════════════════════════════════
exports.getHotlink = async (req, res) => {
    try {
        const domain = req.params.domain;
        const settings = await WebsiteSettingsService.getHotlink(domain);
        res.json({ success: true, ...settings });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveHotlink = async (req, res) => {
    try {
        const { domain, enabled, allowed_domains } = req.body;
        await WebsiteSettingsService.saveHotlink(domain, enabled, allowed_domains);
        await ActivityLogService.log(req.session.user.id, 'hotlink-save', 'website', null, { domain, enabled }, req.ip);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ═══════════════════════════════════════
//  3. Directory Privacy
// ═══════════════════════════════════════
exports.getDirectoryPrivacy = async (req, res) => {
    try {
        const domain = req.params.domain;
        const dirs = await WebsiteSettingsService.getDirectoryPrivacy(domain);
        res.json({ success: true, dirs });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.addDirectoryPrivacy = async (req, res) => {
    try {
        const { domain, path: dirPath, username, password } = req.body;
        if (!domain || !dirPath || !username || !password) return res.status(400).json({ error: 'Required fields missing' });
        await WebsiteSettingsService.addDirectoryPrivacy(domain, dirPath, username, password);
        await ActivityLogService.log(req.session.user.id, 'dir-privacy-add', 'website', null, { domain, path: dirPath }, req.ip);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.removeDirectoryPrivacy = async (req, res) => {
    try {
        const { domain, path: dirPath } = req.body;
        await WebsiteSettingsService.removeDirectoryPrivacy(domain, dirPath);
        await ActivityLogService.log(req.session.user.id, 'dir-privacy-remove', 'website', null, { domain, path: dirPath }, req.ip);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ═══════════════════════════════════════
//  4. MIME Types
// ═══════════════════════════════════════
exports.getMimeTypes = async (req, res) => {
    try {
        const domain = req.params.domain;
        const types = await WebsiteSettingsService.getMimeTypes(domain);
        res.json({ success: true, types });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveMimeTypes = async (req, res) => {
    try {
        const { domain, types } = req.body;
        await WebsiteSettingsService.saveMimeTypes(domain, types);
        await ActivityLogService.log(req.session.user.id, 'mime-save', 'website', null, { domain, count: Object.keys(types).length }, req.ip);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
