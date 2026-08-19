const SystemSettingsService = require('../services/SystemSettingsService');

module.exports = async function loadSettings(req, res, next) {
    try {
        const settings = await SystemSettingsService.getAll();
        res.locals.appName = settings.app_name || 'MR Panel';
        res.locals.appUrl = settings.app_url || process.env.APP_URL || 'http://103.191.63.147:1708';
        res.locals.serverIp = settings.server_ip || '103.191.63.147';
        res.locals.ns1 = settings.ns1 || '';
        res.locals.ns2 = settings.ns2 || '';
        res.locals.panelDomain = settings.panel_domain || '';
        res.locals.panelHttpsEnabled = (settings.panel_https_enabled === 'true' || settings.panel_https_enabled === '1');
    } catch (e) {
        res.locals.appName = 'MR Panel';
        res.locals.appUrl = process.env.APP_URL || 'http://103.191.63.147:1708';
        res.locals.serverIp = '103.191.63.147';
        res.locals.ns1 = '';
        res.locals.ns2 = '';
        res.locals.panelDomain = '';
        res.locals.panelHttpsEnabled = false;
    }
    next();
};
