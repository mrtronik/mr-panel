const SettingsService = require('../services/SettingsService');

exports.getMailPage = async (req, res) => {
    try {
        const settings = await SettingsService.getAll();
        res.render('settings/mail', {
            title: 'Mail Server Settings',
            settings
        });
    } catch (err) {
        console.log(err);
        res.status(500).send(err.message);
    }
};

exports.saveMailSettings = async (req, res) => {
    try {
        const { hostname, server_ip, cloudflare_email, system_email, smtp_relay_host, smtp_relay_port, smtp_relay_secure, smtp_relay_user, smtp_relay_pass } = req.body;
        await SettingsService.setMultiple({
            'mail_hostname': hostname || '',
            'mail_server_ip': server_ip || '',
            'mail_cloudflare_email': cloudflare_email || '',
            'system_email': system_email || '',
            'smtp_relay_host': smtp_relay_host || '',
            'smtp_relay_port': smtp_relay_port || '',
            'smtp_relay_secure': smtp_relay_secure || '',
            'smtp_relay_user': smtp_relay_user || '',
            'smtp_relay_pass': smtp_relay_pass || ''
        });
        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
};
