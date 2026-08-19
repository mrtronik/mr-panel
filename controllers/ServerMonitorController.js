const ServerMonitorService = require('../services/ServerMonitorService');

exports.getPage = async (req, res) => {
    try {
        res.render('server-monitor/index', { title: 'Server Monitor' });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.getStats = async (req, res) => {
    try {
        const stats = await ServerMonitorService.getStats();
        res.json({ success: true, ...stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getProcesses = async (req, res) => {
    try {
        const processes = await ServerMonitorService.getProcesses();
        res.json({ success: true, processes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getServices = async (req, res) => {
    try {
        const services = await ServerMonitorService.getServices();
        res.json({ success: true, services });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
