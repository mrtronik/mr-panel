const SystemSettingsService = require('../services/SystemSettingsService');

exports.getPage = async (req, res) => {
    try {
        const settings = await SystemSettingsService.getAll();
        res.render('settings/system', {
            title: 'System Settings',
            settings
        });
    } catch (err) {
        console.log(err);
        res.status(500).send(err.message);
    }
};

exports.save = async (req, res) => {
    try {
        const {
            app_name, app_url, server_ip,
            ns1, ns2,
            whmcs_api_key, whmcs_api_secret, whmcs_jwt_secret
        } = req.body;

        await SystemSettingsService.setMultiple({
            'app_name': app_name || 'MR Panel',
            'app_url': app_url || '',
            'server_ip': server_ip || '',
            'ns1': ns1 || '',
            'ns2': ns2 || '',
            'whmcs_api_key': whmcs_api_key || '',
            'whmcs_api_secret': whmcs_api_secret || '',
            'whmcs_jwt_secret': whmcs_jwt_secret || ''
        });

        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
};

exports.detectIp = async (req, res) => {
    try {
        const { execSync } = require('child_process');
        let ip = '';
        try {
            ip = execSync("curl -s --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}'").toString().trim();
        } catch (e) {
            try {
                ip = execSync("hostname -I").toString().trim().split(' ')[0];
            } catch (e2) {
                return res.json({ success: false, error: 'Cannot detect IP' });
            }
        }
        if (ip) {
            res.json({ success: true, ip });
        } else {
            res.json({ success: false, error: 'Cannot detect IP' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.setupPanelSsl = async (req, res) => {
    try {
        const domain = (req.body.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/:\d+$/, '');
        if (!domain) return res.status(400).json({ error: 'Domain is required' });

        const PanelSslService = require('../services/PanelSslService');
        const SystemSettingsService = require('../services/SystemSettingsService');

        const result = await PanelSslService.setupPanelSsl(domain);
        await SystemSettingsService.enablePanelSsl(domain);

        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[PanelSSL] Setup error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.disablePanelSsl = async (req, res) => {
    try {
        const SystemSettingsService = require('../services/SystemSettingsService');
        const domain = await SystemSettingsService.getPanelDomain();
        const PanelSslService = require('../services/PanelSslService');

        await SystemSettingsService.disablePanelSsl();
        if (domain) {
            try { await PanelSslService.removePanelVhost(domain); } catch (e) {}
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.panelSslStatus = async (req, res) => {
    try {
        const SystemSettingsService = require('../services/SystemSettingsService');
        const PanelSslService = require('../services/PanelSslService');
        const domain = await SystemSettingsService.getPanelDomain();
        const enabled = await SystemSettingsService.getPanelSslEnabled();

        if (!domain) return res.json({ success: true, enabled: false, cert: null });

        const cert = await PanelSslService.panelCertStatus(domain);
        res.json({ success: true, enabled, domain, cert });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.apiGetAll = async (req, res) => {
    try {
        const settings = await SystemSettingsService.getAll();
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
