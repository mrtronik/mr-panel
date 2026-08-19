const WhmcsService = require('../services/WhmcsService');

exports.createAccount = async (req, res) => {
    try {
        const { username, password, email, firstname, lastname, domain, disk_quota, bandwidth_quota } = req.body;
        if (!username || !password || !domain) {
            return res.json({ success: false, error: 'Missing required fields' });
        }
        const result = await WhmcsService.createAccount({ username, password, email, firstname, lastname, domain, disk_quota, bandwidth_quota });
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.terminateAccount = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.json({ success: false, error: 'Missing domain' });
        const result = await WhmcsService.terminateAccount(domain);
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.suspendAccount = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.json({ success: false, error: 'Missing domain' });
        const result = await WhmcsService.suspendAccount(domain);
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.unsuspendAccount = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.json({ success: false, error: 'Missing domain' });
        const result = await WhmcsService.unsuspendAccount(domain);
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { domain, password } = req.body;
        if (!domain || !password) return res.json({ success: false, error: 'Missing fields' });
        const result = await WhmcsService.changePassword(domain, password);
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.changePackage = async (req, res) => {
    try {
        const { domain, disk_quota, bandwidth_quota } = req.body;
        if (!domain) return res.json({ success: false, error: 'Missing domain' });
        const result = await WhmcsService.changePackage(domain, { disk_quota, bandwidth_quota });
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.getUsage = async (req, res) => {
    try {
        const { websiteId } = req.params;
        const result = await WhmcsService.getUsage(websiteId);
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.sso = async (req, res) => {
    try {
        const { username, role, client_id, email } = req.body;
        const result = await WhmcsService.generateSSO({ username, role, client_id, email });
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.status = async (req, res) => {
    try {
        res.json({ status: 'ok', version: '1.0.0', uptime: process.uptime() });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.systemStatus = async (req, res) => {
    try {
        const { execSync } = require('child_process');
        let cpu = 0, mem = 0, disk = 0, uptime = '';
        try { uptime = execSync('uptime -p 2>/dev/null', { encoding: 'utf8' }).trim(); } catch {}
        try {
            const m = execSync("free -m | awk '/Mem:/{printf \"%.0f\", $3/$2*100}'", { encoding: 'utf8' }).trim();
            mem = parseInt(m) || 0;
        } catch {}
        try {
            const d = execSync("df -h / | awk 'NR==2{print $5}'", { encoding: 'utf8' }).trim().replace('%', '');
            disk = parseInt(d) || 0;
        } catch {}
        res.json({ status: 'ok', uptime, cpu, memory: mem, disk });
    } catch (err) {
        res.json({ status: 'ok', version: '1.0.0' });
    }
};
