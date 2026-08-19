const PhpService = require('../services/PhpService');

exports.getPage = async (req, res) => {
    try {
        const data = await PhpService.getCachedPageData();
        const cacheAge = await PhpService.getCacheAge();

        res.render('php/index', {
            title: 'PHP Manager',
            ...data,
            cacheAge
        });
    } catch (err) {
        console.log(err);
        res.status(500).send(err.message);
    }
};

exports.refresh = async (req, res) => {
    try {
        const data = await PhpService.getCachedPageData(true);
        const cacheAge = await PhpService.getCacheAge();
        res.json({ success: true, data, cacheAge });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.restart = async (req, res) => {
    try {
        const result = PhpService.restartFpm();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getModules = async (req, res) => {
    try {
        const modules = PhpService.getModules();
        res.json({ success: true, modules });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getInfo = async (req, res) => {
    try {
        const info = PhpService.getInfo();
        res.json({ success: true, info });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.installIonCube = async (req, res) => {
    try {
        const result = PhpService.installIonCube();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.uninstallIonCube = async (req, res) => {
    try {
        const result = PhpService.uninstallIonCube();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.ionCubeStatus = async (req, res) => {
    try {
        const status = PhpService.getIonCubeStatus();
        res.json({ success: true, ...status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.availableVersions = async (req, res) => {
    try {
        const versions = PhpService.getAvailableVersions();
        res.json({ success: true, versions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.installVersion = async (req, res) => {
    try {
        const { version } = req.body;
        if (!version) return res.status(400).json({ error: 'Version required' });
        const result = await PhpService.installPhpVersion(version);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.uninstallVersion = async (req, res) => {
    try {
        const { version } = req.body;
        if (!version) return res.status(400).json({ error: 'Version required' });
        const result = await PhpService.uninstallPhpVersion(version);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getIniForVersion = async (req, res) => {
    try {
        const { version } = req.params;
        const settings = PhpService.getServerPhpIniForVersion(version);
        const iniPath = PhpService.getLsphpIniPath(version);
        res.json({ success: true, settings, iniPath });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveIniForVersion = async (req, res) => {
    try {
        const { version } = req.params;
        const { settings } = req.body;
        if (!settings) return res.status(400).json({ error: 'Settings required' });
        const result = PhpService.saveServerPhpIniForVersion(version, settings);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getExtensionsForVersion = async (req, res) => {
    try {
        const { version } = req.params;
        const extensions = await PhpService.getExtensionsForVersion(version);
        res.json({ success: true, extensions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.setDefault = async (req, res) => {
    try {
        const { version } = req.body;
        if (!version) return res.status(400).json({ error: 'Version required' });
        const result = await PhpService.setDefaultPhp(version);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
