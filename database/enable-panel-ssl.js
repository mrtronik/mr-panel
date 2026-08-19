const s = require('../services/SystemSettingsService');
(async () => {
    const domain = process.argv[2] || 'live.mrstudio.web.id';
    const fs = require('fs');
    const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
    const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;
    console.log('cert exists:', fs.existsSync(certPath), fs.existsSync(keyPath));
    await s.enablePanelSsl(domain);
    console.log('panel_domain:', await s.getPanelDomain());
    console.log('panel_https_enabled:', await s.getPanelSslEnabled());
    console.log('app_url:', await s.getAppUrl());
    process.exit();
})();