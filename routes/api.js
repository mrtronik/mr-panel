const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { validateToken } = require('../middleware/csrf');

const uploadDir = '/tmp/mrpanel-upload';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
    }),
    limits: { fileSize: 500 * 1024 * 1024 }  // 500MB max
});

const DashboardApiController = require('../controllers/Api/DashboardApiController');
const FileManagerController = require('../controllers/FileManagerController');
const SslController = require('../controllers/SslController');
const DatabaseController = require('../controllers/DatabaseController');
const authApi = require('../middleware/authApi');

// CSRF validation for session-based routes (skip API key auth routes)
const csrfProtected = [authApi, validateToken];

// API Key auth for WHMCS integration
async function authApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const apiSecret = req.headers['x-api-secret'];
    const SystemSettingsService = require('../services/SystemSettingsService');
    const validKey = await SystemSettingsService.getWhmcsApiKey();
    const validSecret = await SystemSettingsService.getWhmcsApiSecret();
    if (!validKey && !validSecret) {
        return res.status(401).json({ success: false, error: 'WHMCS API credentials not configured' });
    }
    if (apiKey === validKey && apiSecret === validSecret) {
        return next();
    }
    return res.status(401).json({ success: false, error: 'Unauthorized' });
}

router.get('/dashboard/stats', authApi, DashboardApiController.stats);

router.get('/file-manager/list', authApi, FileManagerController.list);
router.get('/file-manager/read', authApi, FileManagerController.readFile);
router.post('/file-manager/write', csrfProtected, FileManagerController.writeFile);
router.post('/file-manager/mkdir', csrfProtected, FileManagerController.createDir);
router.post('/file-manager/create-file', csrfProtected, FileManagerController.createFile);
router.post('/file-manager/rename', csrfProtected, FileManagerController.rename);
router.post('/file-manager/delete', csrfProtected, FileManagerController.delete);
router.post('/file-manager/move', csrfProtected, FileManagerController.move);
router.get('/file-manager/info', authApi, FileManagerController.getInfo);
router.post('/file-manager/upload', csrfProtected, upload.single('file'), FileManagerController.upload);
router.post('/file-manager/extract', csrfProtected, FileManagerController.extract);

router.get('/ssl/certs', authApi, SslController.listCerts);
router.post('/ssl/request', csrfProtected, SslController.request);
router.post('/ssl/renew', csrfProtected, SslController.renew);
router.post('/ssl/renew-all', csrfProtected, SslController.renewAll);
router.post('/ssl/delete', csrfProtected, SslController.delete);
router.get('/ssl/status', authApi, SslController.status);
router.post('/ssl/install', csrfProtected, SslController.install);
router.post('/ssl/auto-renew', csrfProtected, SslController.toggleAutoRenew);

router.get('/database/databases', authApi, DatabaseController.listDatabases);
router.get('/database/tables', authApi, DatabaseController.listTables);
router.get('/database/table-info', authApi, DatabaseController.getTableInfo);
router.post('/database/create-db', csrfProtected, DatabaseController.createDatabase);
router.post('/database/delete-db', csrfProtected, DatabaseController.deleteDatabase);
router.post('/database/create-user', csrfProtected, DatabaseController.createUser);
router.post('/database/delete-user', csrfProtected, DatabaseController.deleteUser);
router.post('/database/grant', csrfProtected, DatabaseController.grantPrivileges);
router.post('/database/revoke', csrfProtected, DatabaseController.revokePrivileges);

router.post('/mail/send', csrfProtected, upload.array('attachments', 10), require('../controllers/MailController').send);
router.post('/mail/profile', csrfProtected, require('../controllers/MailController').updateProfile);
router.get('/mail/:uid', authApi, require('../controllers/MailController').getEmail);
router.post('/mail/delete', csrfProtected, require('../controllers/MailController').deleteEmail);
router.post('/mail/seen', csrfProtected, require('../controllers/MailController').markSeen);

const EmailAccountController = require('../controllers/EmailAccountController');
router.get('/email-accounts/list', authApi, EmailAccountController.listAccounts);
router.post('/email-accounts/create', csrfProtected, EmailAccountController.createAccount);
router.post('/email-accounts/delete', csrfProtected, EmailAccountController.deleteAccount);
router.post('/email-accounts/password', csrfProtected, EmailAccountController.changePassword);
router.post('/email-accounts/toggle', csrfProtected, EmailAccountController.toggleAccount);
router.post('/email-accounts/quota', csrfProtected, EmailAccountController.updateQuota);
router.get('/email-accounts/auto-login', authApi, EmailAccountController.autoLogin);

const DnsController = require('../controllers/DnsController');
router.get('/dns/zones', authApi, DnsController.index);
router.post('/dns/create-zone', csrfProtected, DnsController.createZone);
router.post('/dns/delete-zone', csrfProtected, DnsController.deleteZone);
router.post('/dns/add-record', csrfProtected, DnsController.addRecord);
router.post('/dns/delete-record', csrfProtected, DnsController.deleteRecord);

const PhpController = require('../controllers/PhpController');
router.post('/php/restart', csrfProtected, PhpController.restart);
router.get('/php/modules', authApi, PhpController.getModules);
router.get('/php/info', authApi, PhpController.getInfo);
router.get('/php/ioncube/status', authApi, PhpController.ionCubeStatus);
router.post('/php/ioncube/install', csrfProtected, PhpController.installIonCube);
router.post('/php/ioncube/uninstall', csrfProtected, PhpController.uninstallIonCube);
router.get('/php/available', authApi, PhpController.availableVersions);
router.post('/php/install', csrfProtected, PhpController.installVersion);
router.post('/php/uninstall', csrfProtected, PhpController.uninstallVersion);
router.get('/php/ini/:version', authApi, PhpController.getIniForVersion);
router.post('/php/ini/:version', csrfProtected, PhpController.saveIniForVersion);
router.get('/php/extensions/:version', authApi, PhpController.getExtensionsForVersion);
router.post('/php/set-default', csrfProtected, PhpController.setDefault);
router.post('/php/refresh', csrfProtected, PhpController.refresh);
router.get('/php/versions', authApi, async (req, res) => {
    try {
        const PhpService = require('../services/PhpService');
        const versions = PhpService.getInstalledVersions();
        res.json({ success: true, versions });
    } catch (err) {
        res.json({ success: false, versions: [], error: err.message });
    }
});

router.get('/php/extensions/:version', authApi, async (req, res) => {
    try {
        const PhpService = require('../services/PhpService');
        const extensions = PhpService.getExtensions(req.params.version);
        res.json({ success: true, extensions });
    } catch (err) {
        res.json({ success: false, extensions: [], error: err.message });
    }
});

const ServerController = require('../controllers/ServerController');
router.post('/server/restart', csrfProtected, ServerController.restartService);
router.post('/server/stop', csrfProtected, ServerController.stopService);
router.get('/server/stats', authApi, ServerController.getStats);

const InstallerController = require('../controllers/InstallerController');
router.post('/installer/wordpress/install', csrfProtected, InstallerController.wordpressInstall);
router.post('/installer/wordpress/delete', csrfProtected, InstallerController.wordpressDelete);
router.get('/installer/wordpress/info', authApi, InstallerController.wordpressInfo);

router.post('/installer/laravel/install', csrfProtected, InstallerController.laravelInstall);
router.post('/installer/laravel/delete', csrfProtected, InstallerController.laravelDelete);
router.get('/installer/laravel/info', authApi, InstallerController.laravelInfo);
router.post('/installer/laravel/clear-cache', csrfProtected, InstallerController.laravelClearCache);
router.post('/installer/laravel/optimize', csrfProtected, InstallerController.laravelOptimize);

router.post('/installer/phpbb/install', csrfProtected, InstallerController.phpbbInstall);
router.post('/installer/phpbb/delete', csrfProtected, InstallerController.phpbbDelete);

router.post('/installer/joomla/install', csrfProtected, InstallerController.joomlaInstall);
router.post('/installer/joomla/delete', csrfProtected, InstallerController.joomlaDelete);

router.post('/installer/python/install', csrfProtected, InstallerController.pythonInstall);
router.post('/installer/python/delete', csrfProtected, InstallerController.pythonDelete);
router.post('/installer/python/start', csrfProtected, InstallerController.pythonStart);
router.post('/installer/python/stop', csrfProtected, InstallerController.pythonStop);
router.post('/installer/python/restart', csrfProtected, InstallerController.pythonRestart);
router.get('/installer/python/info', authApi, InstallerController.pythonInfo);
router.get('/installer/python/logs', authApi, InstallerController.pythonLogs);

const CronController = require('../controllers/CronController');
router.get('/cron/list', authApi, CronController.index);
router.post('/cron/add', csrfProtected, CronController.add);
router.post('/cron/delete', csrfProtected, CronController.remove);

const PhpMyAdminController = require('../controllers/PhpMyAdminController');
router.post('/phpmyadmin/install', csrfProtected, PhpMyAdminController.install);
router.post('/phpmyadmin/delete', csrfProtected, PhpMyAdminController.delete);

const DatabaseManagerController = require('../controllers/DatabaseManagerController');
const DatabaseManagerService = require('../services/DatabaseManagerService');
router.post('/db-manager/query', csrfProtected, DatabaseManagerController.runQuery);
router.post('/db-manager/insert/:db/:table', csrfProtected, DatabaseManagerController.insertRow);
router.post('/db-manager/update/:db/:table', csrfProtected, DatabaseManagerController.updateRow);
router.post('/db-manager/delete-row/:db/:table', csrfProtected, DatabaseManagerController.deleteRow);
router.post('/db-manager/create-db', csrfProtected, DatabaseManagerController.createDatabase);
router.post('/db-manager/drop-db', csrfProtected, DatabaseManagerController.dropDatabase);
router.post('/db-manager/create-table', csrfProtected, DatabaseManagerController.createTable);
router.post('/db-manager/drop-table', csrfProtected, DatabaseManagerController.dropTable);
router.post('/db-manager/empty-table', csrfProtected, DatabaseManagerController.emptyTable);
router.post('/db-manager/import', csrfProtected, upload.single('file'), DatabaseManagerController.importSql);
router.get('/db-manager/tables/:dbName', authApi, async (req, res) => {
    try {
        const tables = await DatabaseManagerService.listTables(req.params.dbName);
        res.json({ success: true, tables });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});
router.get('/db-manager/users', authApi, DatabaseManagerController.listUsers);
router.post('/db-manager/create-user', csrfProtected, DatabaseManagerController.createUser);
router.post('/db-manager/delete-user', csrfProtected, DatabaseManagerController.deleteUser);
router.post('/db-manager/change-password', csrfProtected, DatabaseManagerController.changePassword);
router.post('/db-manager/grant', csrfProtected, DatabaseManagerController.grantPrivileges);
router.post('/db-manager/revoke', csrfProtected, DatabaseManagerController.revokePrivileges);
router.get('/db-manager/user-grants', authApi, DatabaseManagerController.getUserGrants);

const SettingsController = require('../controllers/SettingsController');
router.post('/settings/mail', csrfProtected, SettingsController.saveMailSettings);

const SystemSettingsController = require('../controllers/SystemSettingsController');
router.get('/system-settings', authApi, SystemSettingsController.apiGetAll);
router.post('/system-settings', csrfProtected, SystemSettingsController.save);
router.get('/system-settings/detect-ip', authApi, SystemSettingsController.detectIp);
router.get('/system-settings/panel-ssl-status', authApi, SystemSettingsController.panelSslStatus);
router.post('/system-settings/panel-ssl', csrfProtected, SystemSettingsController.setupPanelSsl);
router.post('/system-settings/panel-ssl-disable', csrfProtected, SystemSettingsController.disablePanelSsl);

const RedisController = require('../controllers/RedisController');
router.get('/redis/status', authApi, RedisController.getStatus);
router.get('/redis/keys', authApi, RedisController.getKeys);
router.get('/redis/key/:key', authApi, RedisController.getKey);
router.delete('/redis/key/:key', csrfProtected, RedisController.deleteKey);
router.post('/redis/delete-pattern', csrfProtected, RedisController.deletePattern);
router.post('/redis/flush-all', csrfProtected, RedisController.flushAll);
router.post('/redis/flush-db', csrfProtected, RedisController.flushDb);
router.get('/redis/config', authApi, RedisController.getConfig);
router.get('/redis/slow-log', authApi, RedisController.getSlowLog);
router.get('/redis/databases', authApi, RedisController.getDatabases);
router.post('/redis/test', csrfProtected, RedisController.testConnection);

const ClamAVController = require('../controllers/ClamAVController');
router.get('/clamav/status', authApi, ClamAVController.getStatus);
router.post('/clamav/scan', csrfProtected, ClamAVController.scanFile);
router.post('/clamav/scan-dir', csrfProtected, ClamAVController.scanDirectory);
router.post('/clamav/update', csrfProtected, ClamAVController.updateDatabase);
router.get('/clamav/logs', authApi, ClamAVController.getLogs);
router.post('/clamav/logs/clear', csrfProtected, ClamAVController.clearLogs);
router.post('/clamav/quarantine', csrfProtected, ClamAVController.quarantine);
router.get('/clamav/quarantine', authApi, ClamAVController.getQuarantined);
router.delete('/clamav/quarantine/:fileName', csrfProtected, ClamAVController.deleteQuarantined);
router.post('/clamav/quarantine/restore', csrfProtected, ClamAVController.restoreQuarantined);

const ForwardingRuleController = require('../controllers/ForwardingRuleController');
router.get('/forwarding/rules', authApi, ForwardingRuleController.list);
router.post('/forwarding/rules', csrfProtected, ForwardingRuleController.create);
router.post('/forwarding/rules/:id/toggle', csrfProtected, ForwardingRuleController.toggleStatus);
router.put('/forwarding/rules/:id', csrfProtected, ForwardingRuleController.update);
router.delete('/forwarding/rules/:id', csrfProtected, ForwardingRuleController.remove);
router.post('/forwarding/apply', csrfProtected, ForwardingRuleController.applyToPostfix);
router.get('/forwarding/stats', authApi, ForwardingRuleController.getStats);

const CacheController = require('../controllers/CacheController');
const authCache = require('../middleware/authCache');

router.get('/cache/auth', authCache, CacheController.auth);
router.get('/cache/dashboard', authCache, CacheController.dashboard);
router.get('/cache/page', authCache, CacheController.getPageCache);
router.post('/cache/page', authCache, validateToken, CacheController.updatePageCache);
router.get('/cache/browser', authCache, CacheController.getBrowserCache);
router.post('/cache/browser', authCache, validateToken, CacheController.updateBrowserCache);
router.get('/cache/object', authCache, CacheController.getObjectCache);
router.post('/cache/object', authCache, validateToken, CacheController.updateObjectCache);
router.get('/cache/php', authCache, CacheController.getPhpSettings);
router.post('/cache/php', authCache, validateToken, CacheController.updatePhpSettings);
router.get('/cache/minify', authCache, CacheController.getMinify);
router.post('/cache/minify', authCache, validateToken, CacheController.updateMinify);
router.post('/cache/purge', authCache, validateToken, CacheController.purge);

// Server Monitor
const ServerMonitorController = require('../controllers/ServerMonitorController');
router.get('/server-monitor/stats', authApi, ServerMonitorController.getStats);
router.get('/server-monitor/processes', authApi, ServerMonitorController.getProcesses);
router.get('/server-monitor/services', authApi, ServerMonitorController.getServices);

// WordPress Toolkit
const WordpressToolkitController = require('../controllers/WordpressToolkitController');
router.get('/wordpress-toolkit/list', authApi, WordpressToolkitController.listInstalls);
router.post('/wordpress-toolkit/update-core', csrfProtected, WordpressToolkitController.updateCore);
router.post('/wordpress-toolkit/update-plugins', csrfProtected, WordpressToolkitController.updateAllPlugins);
router.post('/wordpress-toolkit/update-themes', csrfProtected, WordpressToolkitController.updateAllThemes);
router.post('/wordpress-toolkit/plugin', csrfProtected, WordpressToolkitController.managePlugin);
router.post('/wordpress-toolkit/theme', csrfProtected, WordpressToolkitController.manageTheme);
router.get('/wordpress-toolkit/plugins', authApi, WordpressToolkitController.pluginInfo);
router.get('/wordpress-toolkit/themes', authApi, WordpressToolkitController.themeInfo);

// Backups
const BackupController = require('../controllers/BackupController');
router.get('/backups/list', authApi, BackupController.listBackups);
router.get('/backups/stats', authApi, BackupController.getStats);
router.post('/backups/create', csrfProtected, BackupController.createBackup);
router.post('/backups/restore/:id', csrfProtected, BackupController.restoreBackup);
router.get('/backups/download/:id', authApi, BackupController.downloadBackup);
router.delete('/backups/delete/:id', csrfProtected, BackupController.deleteBackup);

const BackupGDriveController = require('../controllers/BackupGDriveController');
router.post('/backup/gdrive/connect', csrfProtected, BackupGDriveController.connect);
router.get('/backup/gdrive/callback', BackupGDriveController.callback);
router.post('/backup/gdrive/disconnect', csrfProtected, BackupGDriveController.disconnect);
router.post('/backup/gdrive/create', csrfProtected, BackupGDriveController.createBackup);
router.post('/backup/gdrive/restore/:id', csrfProtected, BackupGDriveController.restoreBackup);
router.get('/backup/gdrive/list', authApi, BackupGDriveController.listBackups);
router.delete('/backup/gdrive/:id', csrfProtected, BackupGDriveController.deleteBackup);
router.get('/backup/gdrive/storage', authApi, BackupGDriveController.getStorageInfo);
router.post('/backup/gdrive/test', csrfProtected, BackupGDriveController.testConnection);
router.post('/backup/gdrive/schedules', csrfProtected, BackupGDriveController.createSchedule);
router.get('/backup/gdrive/schedules', authApi, BackupGDriveController.listSchedules);
router.put('/backup/gdrive/schedules/:id', csrfProtected, BackupGDriveController.updateSchedule);
router.delete('/backup/gdrive/schedules/:id', csrfProtected, BackupGDriveController.deleteSchedule);
router.post('/backup/gdrive/schedules/:id/run', csrfProtected, BackupGDriveController.runSchedule);
router.post('/backup/gdrive/cron-run/:id', BackupGDriveController.runScheduleApi);

// WHMCS Integration (API key auth)
const WhmcsController = require('../controllers/WhmcsController');
router.post('/whmcs/create-account', authApiKey, WhmcsController.createAccount);
router.post('/whmcs/terminate-account', authApiKey, WhmcsController.terminateAccount);
router.post('/whmcs/suspend-account', authApiKey, WhmcsController.suspendAccount);
router.post('/whmcs/unsuspend-account', authApiKey, WhmcsController.unsuspendAccount);
router.post('/whmcs/change-password', authApiKey, WhmcsController.changePassword);
router.post('/whmcs/change-package', authApiKey, WhmcsController.changePackage);
router.get('/whmcs/usage/:websiteId', authApiKey, WhmcsController.getUsage);
router.post('/whmcs/sso', authApiKey, WhmcsController.sso);
router.get('/whmcs/status', authApiKey, WhmcsController.status);
router.get('/system/status', authApiKey, WhmcsController.systemStatus);

// Public server status for WHMCS monitoring (no auth)
router.get('/server-status', (req, res) => {
    const os = require('os');
    const { execSync } = require('child_process');
    try {
        const cpuUsage = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'").toString().trim();
        const memResult = execSync("free -m | grep Mem").toString().trim().split(/\s+/);
        const memTotal = parseInt(memResult[1]) || 0;
        const memUsed = parseInt(memResult[2]) || 0;
        const diskResult = execSync("df -h / | tail -1").toString().trim().split(/\s+/);
        const uptime = execSync("uptime -p").toString().trim();
        res.json({
            status: 'ok',
            uptime: uptime,
            cpu: parseFloat(cpuUsage) || 0,
            memory: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
            disk: parseInt(diskResult[4]) || 0
        });
    } catch (e) {
        res.json({ status: 'ok', uptime: 'unknown', cpu: 0, memory: 0, disk: 0 });
    }
});

// Public packages list for WHMCS ConfigOptions (no auth)
router.get('/whmcs/packages', async (req, res) => {
    const db = require('../config/db');
    try {
        const resellerId = req.query.reseller_id;
        let query = 'SELECT id, name, disk_limit, bandwidth_limit, owner_id FROM packages WHERE status = "active"';
        const params = [];

        if (resellerId) {
            // Filter: packages owned by this reseller + global admin packages (owner_id IS NULL)
            query += ' AND (owner_id = ? OR owner_id IS NULL)';
            params.push(parseInt(resellerId));
        }
        // If no reseller_id, return ALL packages (admin view)

        query += ' ORDER BY name';
        const [rows] = await db.query(query, params);
        const packages = rows.map(r => ({
            id: r.id,
            name: r.name,
            disk_quota: Math.round(r.disk_limit / 1024 / 1024),
            bandwidth_quota: Math.round(r.bandwidth_limit / 1024 / 1024),
            is_global: r.owner_id === null
        }));
        res.json({ success: true, packages });
    } catch (e) {
        res.json({ success: false, packages: [], error: e.message });
    }
});

// WHMCS service mapping
router.post('/whmcs/map-service', authApiKey, (req, res) => {
    const db = require('../config/db');
    const { service_id, website_id } = req.body;
    if (!service_id || !website_id) return res.json({ success: false, error: 'Missing fields' });
    db.execute('REPLACE INTO whmcs_service_map (service_id, website_id) VALUES (?, ?)', [service_id, website_id])
        .then(() => res.json({ success: true }))
        .catch(e => res.json({ success: false, error: e.message }));
});

router.get('/whmcs/map-service/:serviceId', authApiKey, (req, res) => {
    const db = require('../config/db');
    db.execute('SELECT website_id FROM whmcs_service_map WHERE service_id = ?', [req.params.serviceId])
        .then(([rows]) => {
            if (rows.length > 0) {
                res.json({ success: true, website_id: rows[0].website_id });
            } else {
                res.json({ success: false, error: 'Not found' });
            }
        })
        .catch(e => res.json({ success: false, error: e.message }));
});

router.delete('/whmcs/map-service/:serviceId', authApiKey, (req, res) => {
    const db = require('../config/db');
    db.execute('DELETE FROM whmcs_service_map WHERE service_id = ?', [req.params.serviceId])
        .then(() => res.json({ success: true }))
        .catch(e => res.json({ success: false, error: e.message }));
});

module.exports = router;
