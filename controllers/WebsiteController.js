const WebsiteService = require('../services/WebsiteService');
const SystemInfoService = require('../services/SystemInfoService');
const ActivityLogService = require('../services/ActivityLogService');

exports.index = async (req, res) => {
    try {
        const websites = await WebsiteService.listFromDB(req.session.user);
        const totalSites = websites.length;
        const activeSites = websites.filter(w => w.status === 'active').length;
        const suspendedSites = websites.filter(w => w.status === 'suspended').length;
        res.render('websites/index', { title: 'Websites', websites, totalSites, activeSites, suspendedSites });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.addForm = (req, res) => {
    res.render('websites/add', { title: 'Add Website' });
};

exports.create = async (req, res) => {
    try {
        let { domain, document_root, php_version } = req.body;

        domain = domain.toLowerCase().trim();

        const existing = await WebsiteService.findByDomain(domain);
        if (existing) {
            return res.render('websites/add', {
                title: 'Add Website',
                error: `Domain ${domain} already exists`
            });
        }

        const user = req.session.user;

        if (user.role !== 'admin' && user.package_id) {
            const UserService = require('../services/UserService');
            const pkg = await UserService.findPackage(user.package_id);
            if (pkg && pkg.max_domains) {
                const websiteCount = await WebsiteService.countByUser(user.id);
                if (websiteCount >= pkg.max_domains) {
                    return res.render('websites/add', {
                        title: 'Add Website',
                        error: `Domain limit reached (${pkg.max_domains}). Upgrade your package.`
                    });
                }
            }
        }

        if (!document_root) {
            document_root = `/home/public_html/${domain}`;
        }

        const id = await WebsiteService.save(domain, document_root, php_version, user.id);

        try {
            await WebsiteService.create(domain, document_root);
        } catch (olsErr) {
            console.error('OLS config error (non-fatal):', olsErr.message);
        }

        try {
            const DnsService = require('../services/DnsService');
            await DnsService.createWebsiteRecords(domain, user);
        } catch (dnsErr) {
            console.error('DNS auto-create warning:', dnsErr.message);
        }

        try {
            const EmailAuthService = require('../services/EmailAuthService');
            await EmailAuthService.setupDomain(domain);
        } catch (emailErr) {
            console.error('Email auth setup warning:', emailErr.message);
        }

        await ActivityLogService.log(user.id, 'create', 'website', id, { domain }, req.ip);

        res.redirect('/websites');
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.detail = async (req, res) => {
    try {
        const website = await WebsiteService.findById(req.params.id);
        const data = await SystemInfoService.getAll();
        if (!website) return res.redirect('/websites');

        const db = require('../config/db');
        const user = req.session.user;
        let users = [];

        if (user.role === 'admin') {
            const [rows] = await db.execute("SELECT id, name, username, email, role FROM users WHERE status = 'active' ORDER BY name");
            users = rows;
        } else if (user.role === 'reseller') {
            const [rows] = await db.execute(
                "SELECT id, name, username, email, role FROM users WHERE status = 'active' AND (id = ? OR owner_id = ?) ORDER BY name",
                [user.id, user.id]
            );
            users = rows;
        }

        let phpVersions = [];
        try {
            phpVersions = await WebsiteService.getAvailablePhpVersions();
        } catch (e) {}

        res.render('websites/detail', {
            title: 'Websites',
            domain: String(website.domain),
            website,
            system: data.system,
            users,
            phpVersions
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.suspend = async (req, res) => {
    try {
        const website = await WebsiteService.findById(req.params.id);
        await WebsiteService.updateStatus(req.params.id, 'suspended');
        if (website) {
            await ActivityLogService.log(req.session.user.id, 'suspend', 'website', website.id, { domain: website.domain }, req.ip);
        }
        res.redirect('/websites');
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.activate = async (req, res) => {
    try {
        const website = await WebsiteService.findById(req.params.id);
        await WebsiteService.updateStatus(req.params.id, 'active');
        if (website) {
            await ActivityLogService.log(req.session.user.id, 'activate', 'website', website.id, { domain: website.domain }, req.ip);
        }
        res.redirect('/websites');
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.delete = async (req, res) => {
    try {
        const website = await WebsiteService.findById(req.params.id);
        if (website) {
            try {
                await WebsiteService.delete(website.domain);
            } catch (olsErr) {
                console.error('OLS delete error (non-fatal):', olsErr.message);
            }
            await ActivityLogService.log(req.session.user.id, 'delete', 'website', website.id, { domain: website.domain }, req.ip);
        }
        await WebsiteService.remove(req.params.id);
        res.redirect('/websites?deleted=1');
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.changeOwner = async (req, res) => {
    try {
        const website = await WebsiteService.findById(req.params.id);
        if (!website) return res.redirect('/websites');

        const user = req.session.user;
        const newOwnerId = req.body.owner_id || null;

        if (user.role === 'reseller' && newOwnerId) {
            const db = require('../config/db');
            const [check] = await db.execute(
                'SELECT id FROM users WHERE id = ? AND (id = ? OR owner_id = ?)',
                [newOwnerId, user.id, user.id]
            );
            if (check.length === 0) return res.redirect('/websites/' + website.id);
        }

        await WebsiteService.changeOwner(website.id, newOwnerId);

        await ActivityLogService.log(
            user.id, 'change-owner', 'website', website.id,
            { domain: website.domain, new_owner_id: newOwnerId }, req.ip
        );

        res.redirect('/websites/' + website.id);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.updatePhpVersion = async (req, res) => {
    try {
        const user = req.session.user;
        const website = await WebsiteService.findById(req.params.id);
        if (!website) return res.status(404).json({ error: 'Website not found' });

        const { php_version } = req.body;
        if (!php_version || !/^\d+\.\d+$/.test(php_version)) {
            return res.status(400).json({ error: 'Invalid PHP version' });
        }

        const available = await WebsiteService.getAvailablePhpVersions();
        if (available.length > 0 && !available.includes(php_version)) {
            return res.status(400).json({ error: 'PHP ' + php_version + ' is not installed on this server' });
        }

        await WebsiteService.updatePhpVersion(website.id, php_version);

        await ActivityLogService.log(user.id, 'php-change', 'website', website.id, {
            domain: website.domain, php_version
        }, req.ip);

        res.json({ success: true, php_version });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getPhpSettings = async (req, res) => {
    try {
        const user = req.session.user;
        const website = await WebsiteService.findById(req.params.id);
        if (!website) return res.status(404).json({ error: 'Website not found' });

        const PhpService = require('../services/PhpService');
        const settings = PhpService.getUserIniSettings(website.document_root);
        const serverDefaults = PhpService.getServerPhpIni(website.php_version || '8.2');

        res.json({ success: true, settings, serverDefaults, phpVersion: website.php_version || '8.2' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.savePhpSettings = async (req, res) => {
    try {
        const user = req.session.user;
        const website = await WebsiteService.findById(req.params.id);
        if (!website) return res.status(404).json({ error: 'Website not found' });

        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Invalid settings' });
        }

        const PhpService = require('../services/PhpService');
        PhpService.saveUserIniSettings(website.document_root, settings);

        await ActivityLogService.log(user.id, 'php-settings', 'website', website.id, {
            domain: website.domain, settings
        }, req.ip);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
