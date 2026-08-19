const UsageService = require('../services/UsageService');

exports.getSummary = async (req, res) => {
    try {
        const user = req.session.user;
        const summary = await UsageService.getSummary(user);
        summary.websites = summary.websites.map(w => ({
            ...w,
            formatted: UsageService.formatBytes(w.disk_bytes)
        }));
        summary.formatted = {
            total_disk: UsageService.formatBytes(summary.total_disk),
            server_disk: UsageService.formatBytes(summary.server_disk),
            server_used: UsageService.formatBytes(summary.server_used)
        };
        res.json({ success: true, ...summary });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getSiteUsage = async (req, res) => {
    try {
        const domain = req.params.domain;
        const diskBytes = await UsageService.getDiskUsage(domain);
        const history = await UsageService.getHistory(domain, 7);
        res.json({
            success: true,
            domain,
            disk_bytes: diskBytes,
            disk_formatted: UsageService.formatBytes(diskBytes),
            history: history.map(h => ({
                bytes: h.disk_bytes,
                formatted: UsageService.formatBytes(h.disk_bytes),
                date: h.snapshot_at
            }))
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.checkQuota = async (req, res) => {
    try {
        const user = req.session.user;
        const quota = await UsageService.checkQuota(user);
        res.json({ success: true, ...quota });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.snapshot = async (req, res) => {
    try {
        const saved = await UsageService.snapshotAll();
        res.json({ success: true, saved });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
