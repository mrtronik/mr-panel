const EmailAccountService = require('../services/EmailAccountService');
const ActivityLogService = require('../services/ActivityLogService');

// =========================
// Email Accounts Page
// =========================
exports.getPage = async (req, res) => {
    try {
        const domain = req.query.domain || '';
        const user = req.session.user;
        const domains = await EmailAccountService.listDomains(user);
        const accounts = await EmailAccountService.listAccounts(user, domain);

        let totalUsedBytes = 0;
        let forwarderCount = 0;

        // Attach quota info
        for (const acc of accounts) {
            const quota = EmailAccountService.getQuota(acc.email);
            acc.usedFormatted = quota.usedFormatted;
            acc.usedBytes = quota.used;
            acc.quotaFormatted = acc.quota ? EmailAccountService._formatQuota(acc.quota) : 'Unlimited';
            acc.quotaPercent = acc.quota > 0 ? ((quota.used / acc.quota) * 100).toFixed(1) : 0;
            totalUsedBytes += quota.used || 0;
        }

        // Count forwarders
        try {
            const ForwardingRuleService = require('../services/ForwardingRuleService');
            const fwdStats = await ForwardingRuleService.getStats(user);
            forwarderCount = fwdStats.total || 0;
        } catch {}

        const formatBytes = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        res.render('mail/accounts', {
            title: 'Email Accounts',
            domains,
            accounts,
            selectedDomain: domain,
            stats: {
                accountCount: accounts.length,
                forwarderCount: forwarderCount,
                usedStorage: formatBytes(totalUsedBytes)
            }
        });
    } catch (err) {
        console.log(err);
        res.status(500).send(err.message);
    }
};

// =========================
// API: List Accounts
// =========================
exports.listAccounts = async (req, res) => {
    try {
        const domain = req.query.domain || '';
        const user = req.session.user;
        const accounts = await EmailAccountService.listAccounts(user, domain);
        for (const acc of accounts) {
            const quota = EmailAccountService.getQuota(acc.email);
            acc.usedFormatted = quota.usedFormatted;
            acc.quotaFormatted = acc.quota ? EmailAccountService._formatQuota(acc.quota) : 'Unlimited';
        }
        res.json({ success: true, accounts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// =========================
// API: Create Account
// =========================
exports.createAccount = async (req, res) => {
    try {
        const { email, password, domain, quota } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const user = req.session.user;
        const result = await EmailAccountService.createAccount(email, password, domain, quota, user.id);
        await ActivityLogService.log(user.id, 'create', 'email', null, { email }, req.ip);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// =========================
// API: Delete Account
// =========================
exports.deleteAccount = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });
        const allowed = await EmailAccountService.canAccess(email, req.session.user);
        if (!allowed) return res.status(403).json({ error: 'Akses ditolak' });
        const result = await EmailAccountService.deleteAccount(email);
        await ActivityLogService.log(req.session.user.id, 'delete', 'email', null, { email }, req.ip);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// =========================
// API: Change Password
// =========================
exports.changePassword = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const allowed = await EmailAccountService.canAccess(email, req.session.user);
        if (!allowed) return res.status(403).json({ error: 'Akses ditolak' });
        const result = await EmailAccountService.changePassword(email, password);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// =========================
// API: Toggle Account
// =========================
exports.toggleAccount = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });
        const allowed = await EmailAccountService.canAccess(email, req.session.user);
        if (!allowed) return res.status(403).json({ error: 'Akses ditolak' });
        const result = await EmailAccountService.toggleAccount(email);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// =========================
// API: Update Quota
// =========================
exports.updateQuota = async (req, res) => {
    try {
        const { email, quota } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });
        const allowed = await EmailAccountService.canAccess(email, req.session.user);
        if (!allowed) return res.status(403).json({ error: 'Akses ditolak' });
        const result = await EmailAccountService.updateQuota(email, parseInt(quota) || 0);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// =========================
// API: Auto-login to Webmail (token-based, no password in URL)
// =========================
exports.autoLogin = async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const creds = await EmailAccountService.getAccountCredentials(email);
        if (!creds) return res.status(404).json({ error: 'Account not found or inactive' });

        const token = await EmailAccountService.generateAutoLoginToken(email);
        const autoLoginUrl = `/webmail/auto?token=${token}`;
        res.json({ success: true, url: autoLoginUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
