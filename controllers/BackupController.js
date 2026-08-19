const BackupService = require('../services/BackupService');
const WebsiteService = require('../services/WebsiteService');

exports.getPage = async (req, res) => {
    try {
        const websites = await WebsiteService.listFromDB(req.session.user);
        res.render('backup/index', { title: 'Backups', websites });
    } catch (err) {
        res.render('backup/index', { title: 'Backups', websites: [] });
    }
};

exports.listBackups = async (req, res) => {
    try {
        const backups = await BackupService.listBackups(req.session.user);
        res.json({ success: true, backups });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createBackup = async (req, res) => {
    try {
        const { domain, type } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });
        const backupType = type || 'full';
        const result = await BackupService.createBackup(domain, backupType, req.session.user.id);
        res.json({ success: true, backup: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteBackup = async (req, res) => {
    try {
        await BackupService.deleteBackup(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.restoreBackup = async (req, res) => {
    try {
        const result = await BackupService.restoreBackup(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.downloadBackup = async (req, res) => {
    try {
        const filepath = await BackupService.downloadBackup(req.params.id);
        res.download(filepath);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getStats = async (req, res) => {
    try {
        const stats = await BackupService.getStats(req.session.user);
        res.json({ success: true, ...stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
