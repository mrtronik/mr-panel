const express = require('express');
const router = express.Router();

const HomeController = require('../controllers/HomeController');
const AuthController = require('../controllers/AuthController');
const DashboardController = require('../controllers/DashboardController');
const PageController = require('../controllers/PageController');
const WebsiteController = require('../controllers/WebsiteController');
const FileManagerController = require('../controllers/FileManagerController');
const UserController = require('../controllers/UserController');
const SslController = require('../controllers/SslController');
const DatabaseController = require('../controllers/DatabaseController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const imap = require("../imap");

const MailController = require("../controllers/MailController");
const EmailAccountController = require("../controllers/EmailAccountController");
const DnsController = require("../controllers/DnsController");
const PhpController = require("../controllers/PhpController");
const ServerMonitorController = require("../controllers/ServerMonitorController");
const WordpressToolkitController = require("../controllers/WordpressToolkitController");
const BackupController = require("../controllers/BackupController");
const ServerController = require("../controllers/ServerController");
const ServiceController = require('../controllers/ServiceController');
const CronController = require('../controllers/CronController');
const PhpMyAdminController = require('../controllers/PhpMyAdminController');

router.get("/mail/inbox", auth, MailController.inbox);
router.get("/mail/email/:uid", auth, MailController.detail);
router.get("/mail/latest", auth, MailController.latest);
router.get("/mail/compose", auth, MailController.composeForm);
router.get("/mail/reply/:uid", auth, MailController.replyForm);
router.get("/webmail/login", MailController.webmailLogin);
router.post("/webmail/auth", MailController.webmailAuth);
router.get("/webmail/auto", MailController.webmailAutoLogin);
router.get("/webmail/logout", MailController.webmailLogout);
router.get("/webmail/read/:uid", MailController.readEmail);
router.get("/webmail/thread/:threadId", MailController.readThread);
router.get("/webmail/compose", MailController.composePage);
router.get("/webmail/settings", MailController.settings);
router.get("/webmail", MailController.webmail);

router.get('/', (req, res) => res.redirect('/login'));
router.get('/about', HomeController.about);
router.get('/login', AuthController.loginForm);
router.post('/login', AuthController.login);
router.get('/logout', AuthController.logout);
router.get('/dashboard', auth, DashboardController.index);
router.get('/server/services', auth, ServiceController.index);

// Account Manager
router.get('/websites', auth, role.anyRole, WebsiteController.index);
router.get('/websites/add', auth, role.anyRole, WebsiteController.addForm);
router.post('/websites', auth, role.anyRole, WebsiteController.create);
router.get('/websites/:id', auth, role.anyRole, role.resourceAccess('website'), WebsiteController.detail);
router.post('/websites/:id/suspend', auth, role.adminOnly, role.resourceAccess('website'), WebsiteController.suspend);
router.post('/websites/:id/activate', auth, role.adminOnly, role.resourceAccess('website'), WebsiteController.activate);
router.post('/websites/:id/delete', auth, role.anyRole, role.resourceAccess('website'), WebsiteController.delete);
router.post('/websites/:id/change-owner', auth, role.adminOnly, WebsiteController.changeOwner);
router.post('/websites/:id/php-version', auth, WebsiteController.updatePhpVersion);
router.get('/websites/:id/php-settings', auth, WebsiteController.getPhpSettings);
router.post('/websites/:id/php-settings', auth, WebsiteController.savePhpSettings);
router.get('/users', auth, UserController.listUsers);
router.get('/users/add', auth, UserController.addForm);
router.post('/users', auth, UserController.create);
router.get('/users/:id/edit', auth, UserController.editForm);
router.post('/users/:id/edit', auth, UserController.update);
router.post('/users/:id/suspend', auth, UserController.suspend);
router.post('/users/:id/activate', auth, UserController.activate);
router.post('/users/:id/delete', auth, UserController.delete);
router.get('/databases', auth, DatabaseController.getPage);
router.get('/dns', auth, DnsController.index);
router.get('/ssl', auth, SslController.getPage);
router.get('/email-accounts', auth, EmailAccountController.getPage);

// System Info & File
router.get('/file-manager', auth, FileManagerController.getPage);
router.get('/system-info', auth, PageController.systemInfo);
router.get('/php-settings', auth, PhpController.getPage);
router.get('/terminal', auth, PageController.terminal);

// Extra Feature
router.get('/phpmyadmin', auth, PhpMyAdminController.getPage);

// Database Manager
const DatabaseManagerController = require('../controllers/DatabaseManagerController');
router.get('/db-manager', auth, DatabaseManagerController.databases);
router.get('/db-manager/:db', auth, DatabaseManagerController.tables);
router.get('/db-manager/:db/structure/:table', auth, DatabaseManagerController.structure);
router.get('/db-manager/:db/browse/:table', auth, DatabaseManagerController.browse);
router.get('/db-manager/:db/sql', auth, DatabaseManagerController.sql);
router.post('/db-manager/:db/sql', auth, DatabaseManagerController.sql);
router.get('/db-manager/:db/export', auth, DatabaseManagerController.exportDb);
router.get('/db-manager/:db/export/:table', auth, DatabaseManagerController.exportTable);

// MR Apps Installer
const InstallerController = require('../controllers/InstallerController');
router.get('/installer/wordpress', auth, InstallerController.wordpressPage);
router.get('/installer/laravel', auth, InstallerController.laravelPage);
router.get('/installer/phpbb', auth, InstallerController.phpbbPage);
router.get('/installer/joomla', auth, InstallerController.joomlaPage);
router.get('/installer/python', auth, InstallerController.pythonPage);

// Server Monitor
router.get('/server-monitor', auth, ServerMonitorController.getPage);

// Security - ClamAV
const ClamAVController = require('../controllers/ClamAVController');
router.get('/security/clamav', auth, role.adminOnly, ClamAVController.getPage);

// WordPress Toolkit
router.get('/wordpress-toolkit', auth, WordpressToolkitController.getPage);

// Backups
router.get('/backups', auth, BackupController.getPage);

// Google Drive Backup
const BackupGDriveController = require('../controllers/BackupGDriveController');
router.get('/settings/backup', auth, BackupGDriveController.getPage);

// Settings
const SettingsController = require('../controllers/SettingsController');
const SystemSettingsController = require('../controllers/SystemSettingsController');
const RedisController = require('../controllers/RedisController');
const ForwardingRuleController = require('../controllers/ForwardingRuleController');
router.get('/settings/server', auth, ServerController.getPage);
router.get('/settings/php', auth, PhpController.getPage);
router.get('/settings/mail', auth, SettingsController.getMailPage);
router.get('/settings/system', auth, role.adminOnly, SystemSettingsController.getPage);
router.get('/settings/redis', auth, role.adminOnly, RedisController.getPage);
router.get('/settings/forwarding', auth, ForwardingRuleController.getPage);

// Activity Log
const ActivityLogController = require('../controllers/ActivityLogController');
router.get('/activity', auth, role.anyRole, ActivityLogController.index);

// Cron Jobs
router.get('/cron-jobs', auth, CronController.index);
router.post('/cron-jobs', auth, CronController.add);
router.post('/cron-jobs/remove', auth, CronController.remove);

// Subdomains
const SubdomainController = require('../controllers/SubdomainController');
router.get('/subdomains', auth, SubdomainController.index);
router.get('/subdomains/list/:websiteId', auth, SubdomainController.listByWebsite);
router.post('/subdomains', auth, SubdomainController.create);
router.delete('/subdomains/:id', auth, SubdomainController.remove);

// Parked Domains
const ParkedDomainController = require('../controllers/ParkedDomainController');
router.get('/parked-domains', auth, ParkedDomainController.index);
router.post('/parked-domains', auth, ParkedDomainController.create);
router.delete('/parked-domains/:id', auth, ParkedDomainController.remove);

router.get('/dns/:id', auth, DnsController.zoneDetail);
router.post('/dns', auth, DnsController.createZone);
router.post('/dns/sync', auth, DnsController.syncFromPowerdns);
router.post('/dns/:id/resync', auth, DnsController.resyncZone);
router.delete('/dns/:id', auth, DnsController.deleteZone);
router.post('/dns/record', auth, DnsController.addRecord);
router.post('/dns/record/:id', auth, DnsController.updateRecord);
router.delete('/dns/record/:id', auth, DnsController.deleteRecord);

// Email Forwarders
const ForwarderController = require('../controllers/ForwarderController');
router.get('/email-forwarders', auth, ForwarderController.index);
router.post('/email-forwarders', auth, ForwarderController.create);
router.delete('/email-forwarders/:id', auth, ForwarderController.remove);

// Website Settings (Error Pages, Hotlink, Dir Privacy, MIME)
const WebsiteSettingsController = require('../controllers/WebsiteSettingsController');
router.get('/websites/:domain/settings/error-pages', auth, WebsiteSettingsController.getErrorPages);
router.post('/websites/:domain/settings/error-pages', auth, WebsiteSettingsController.saveErrorPage);
router.delete('/websites/:domain/settings/error-pages', auth, WebsiteSettingsController.removeErrorPage);
router.get('/websites/:domain/settings/hotlink', auth, WebsiteSettingsController.getHotlink);
router.post('/websites/:domain/settings/hotlink', auth, WebsiteSettingsController.saveHotlink);
router.get('/websites/:domain/settings/dir-privacy', auth, WebsiteSettingsController.getDirectoryPrivacy);
router.post('/websites/:domain/settings/dir-privacy', auth, WebsiteSettingsController.addDirectoryPrivacy);
router.delete('/websites/:domain/settings/dir-privacy', auth, WebsiteSettingsController.removeDirectoryPrivacy);
router.get('/websites/:domain/settings/mime', auth, WebsiteSettingsController.getMimeTypes);
router.post('/websites/:domain/settings/mime', auth, WebsiteSettingsController.saveMimeTypes);

// Usage Tracking
const UsageController = require('../controllers/UsageController');
router.get('/api/usage', auth, UsageController.getSummary);
router.get('/api/usage/:domain', auth, UsageController.getSiteUsage);
router.get('/api/usage-check/quota', auth, UsageController.checkQuota);
router.post('/api/usage/snapshot', auth, UsageController.snapshot);

// Packages
router.get('/packages', auth, UserController.packages);
router.post('/packages', auth, UserController.createPackage);
router.post('/packages/:id/delete', auth, UserController.deletePackage);

// WHMCS SSO
const jwt = require('jsonwebtoken');
router.get('/auth/whmcs', async (req, res) => {
    const token = req.query.token;
    if (!token) return res.redirect('/login');

    const jwtSecret = process.env.WHMCS_JWT_SECRET;
    if (!jwtSecret) {
        console.error('[WHMCS] WHMCS_JWT_SECRET not configured');
        return res.redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, jwtSecret);
        const db = require('../config/db');
        
        // Find user by username in MRPanel
        const [rows] = await db.execute('SELECT id, name, username, email, role, status, package_id, home_dir, disk_used FROM users WHERE username = ?', [decoded.username]);
        
        if (rows.length > 0) {
            req.session.user = rows[0];
        } else {
            // Create new user from WHMCS SSO
            const fullName = decoded.username;
            const [result] = await db.execute(
                'INSERT INTO users (username, email, name, role, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [decoded.username, decoded.email || '', decoded.username, decoded.role || 'user', 'active']
            );
            req.session.user = {
                id: result.insertId,
                username: decoded.username,
                email: decoded.email || '',
                name: decoded.username,
                role: decoded.role || 'user',
                status: 'active'
            };
        }
        res.redirect('/dashboard');
    } catch (err) {
        res.redirect('/login');
    }
});

module.exports = router;
