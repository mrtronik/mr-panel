const ServerService = require('../services/ServerInfoService');

exports.getPage = async (req, res) => {
    try {
        const system = ServerService.getSystemInfo();
        const memory = ServerService.getMemoryInfo();
        const disk = ServerService.getDiskInfo();
        const services = ServerService.getServices();
        const network = ServerService.getNetworkInfo();
        const processes = ServerService.getProcesses();

        res.render('server/index', {
            title: 'Server Manager',
            system,
            memory,
            disk,
            services,
            network,
            processes
        });
    } catch (err) {
        console.log(err);
        res.status(500).send(err.message);
    }
};

exports.restartService = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Service name required' });
        const result = ServerService.restartService(name);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.stopService = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Service name required' });
        const result = ServerService.stopService(name);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getStats = async (req, res) => {
    try {
        const system = ServerService.getSystemInfo();
        const memory = ServerService.getMemoryInfo();
        const disk = ServerService.getDiskInfo();
        const services = ServerService.getServices();
        res.json({ success: true, system, memory, disk, services });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
