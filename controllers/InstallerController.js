const WordpressService = require('../services/WordpressService');
const LaravelService = require('../services/LaravelService');
const PhpbbService = require('../services/PhpbbService');
const JoomlaService = require('../services/JoomlaService');
const PythonService = require('../services/PythonService');
const NotificationService = require('../services/NotificationService');
const db = require('../config/db');
const mysql = require('mysql2/promise');
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function resolveDocRoot(domain) {
    const [webs] = await db.execute('SELECT document_root FROM websites WHERE domain = ?', [domain]);
    if (webs.length && webs[0].document_root) return webs[0].document_root;
    const [subs] = await db.execute('SELECT document_root FROM subdomains WHERE subdomain = ?', [domain]);
    if (subs.length && subs[0].document_root) return subs[0].document_root;
    return `/home/public_html/${domain}`;
}

async function getAllSites(user) {
    const [websites] = await db.query('SELECT *, "website" as site_type FROM websites ORDER BY domain');
    const [subdomains] = await db.query(`
        SELECT s.*, w.domain as parent_domain, 'subdomain' as site_type
        FROM subdomains s JOIN websites w ON s.website_id = w.id
        WHERE s.status = 'active' ORDER BY s.subdomain
    `);
    const all = [];
    for (const site of websites) {
        site.label = site.domain;
        all.push(site);
    }
    for (const sub of subdomains) {
        sub.label = sub.subdomain;
        all.push(sub);
    }
    return all;
}

exports.wordpressPage = async (req, res) => {
    try {
        const websites = await getAllSites();

        for (const site of websites) {
            const docRoot = await resolveDocRoot(site.label);
            site.wpInstalled = WordpressService.isInstalled(docRoot);
            site.wpVersion = site.wpInstalled ? WordpressService.getInstalledVersion(docRoot) : null;
        }

        res.render('installer/wordpress', {
            title: 'WordPress Installer',
            websites
        });
    } catch (err) {
        console.error(err);
        res.render('installer/wordpress', { title: 'WordPress Installer', websites: [] });
    }
};

exports.wordpressInstall = async (req, res) => {
    try {
        const { domain, siteName, adminUser, adminPassword, adminEmail, dbName, dbUser, dbPassword } = req.body;

        // ← installCache REMOVED dari destructuring, ga dipakai lagi

        console.log('=== WordPress Install === domain:', domain);

        if (!domain || !siteName || !adminUser || !adminPassword || !adminEmail) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const docRoot = await resolveDocRoot(domain);
        const siteUrl = `http://${domain}`;

        let finalDbName = dbName || `wp_${domain.replace(/\./g, '_')}`;
        finalDbName = finalDbName.replace(/[^a-zA-Z0-9_]/g, '');
        let finalDbUser = dbUser || finalDbName;
        finalDbUser = finalDbUser.replace(/[^a-zA-Z0-9_]/g, '');
        let finalDbPassword = dbPassword || crypto.randomBytes(16).toString('hex');

        // Drop old database and user for clean install
        try {
            await db.query('DROP DATABASE IF EXISTS `' + finalDbName + '`');
            await db.query('DROP USER IF EXISTS ?@localhost', [finalDbUser]);
            await db.query('FLUSH PRIVILEGES');
        } catch (e) {}

        // Create database
        const dbErrors = [];
        try {
            await db.query('CREATE DATABASE `' + finalDbName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        } catch (e) {
            dbErrors.push('CREATE DB: ' + e.message);
        }

        try {
            await db.query('DROP USER IF EXISTS ?@localhost', [finalDbUser]);
            await db.query('CREATE USER ?@localhost IDENTIFIED BY ?', [finalDbUser, finalDbPassword]);
            await db.query('ALTER USER ?@localhost IDENTIFIED WITH mysql_native_password BY ?', [finalDbUser, finalDbPassword]);
        } catch (e) {
            dbErrors.push('CREATE USER: ' + e.message);
        }

        try {
            await db.query('GRANT ALL PRIVILEGES ON `' + finalDbName + '`.* TO ?@localhost', [finalDbUser]);
            await db.query('FLUSH PRIVILEGES');
        } catch (e) {
            dbErrors.push('GRANT: ' + e.message);
        }

        // Verify user can connect
        const testConn = await mysql.createConnection({
            host: 'localhost',
            user: finalDbUser,
            password: finalDbPassword,
            database: finalDbName
        });
        try {
            await testConn.query('SELECT 1');
        } catch (e) {
            await testConn.end();
            return res.status(500).json({ error: 'DB user cannot connect: ' + e.message, details: dbErrors });
        }
        await testConn.end();

        // ✅ Install WordPress
        const result = await WordpressService.installWordPress(docRoot, siteUrl, {
            siteName,
            adminUser,
            adminPassword,
            adminEmail,
            dbName: finalDbName,
            dbUser: finalDbUser,
            dbPassword: finalDbPassword,
            dbHost: 'localhost'
        });

        console.log('[WP] WordPress core installed');

        // Fix OLS rewrite rules
        const WebsiteService = require('../services/WebsiteService');
        await WebsiteService.fixExistingVhost(domain);
        WebsiteService.reloadOLS();

        // ✅ ALWAYS install cache plugin — no checkbox needed
        const cacheApiKey = crypto.randomBytes(32).toString('hex');
        let cacheInstalled = false;
        let cacheError = null;

        try {
            const pluginSource = '/opt/mrpanel/plugins/mr-panel-cache';
            const pluginDest = `${docRoot}/wp-content/plugins/mr-panel-cache`;

            if (!fs.existsSync(pluginSource)) {
                cacheError = 'Plugin source not found at ' + pluginSource;
                console.error('MR Panel Cache:', cacheError);
            } else {
                const wpCliGlobal = '/usr/local/bin/wp';
                if (!fs.existsSync(wpCliGlobal)) {
                    cacheError = 'WP-CLI not found';
                    console.error('MR Panel Cache:', cacheError);
                } else {
                    execSync(`cp -r "${pluginSource}" "${pluginDest}"`, { timeout: 15000 });
                    execSync(`chown -R lsadm:nogroup "${pluginDest}"`, { timeout: 10000 });

                    const panelDomain = req.headers.host || 'localhost:3000';
                    const protocol = req.headers['x-forwarded-proto'] || 'http';
                    const apiUrl = `${protocol}://${panelDomain}/api/cache`;

                    execSync(`${wpCliGlobal} option update mrp_api_url "${apiUrl}" --path="${docRoot}" --allow-root`, { encoding: 'utf8', timeout: 15000 });
                    execSync(`${wpCliGlobal} option update mrp_api_key "${cacheApiKey}" --path="${docRoot}" --allow-root`, { encoding: 'utf8', timeout: 15000 });
                    execSync(`${wpCliGlobal} option update mrp_domain "${domain}" --path="${docRoot}" --allow-root`, { encoding: 'utf8', timeout: 15000 });
                    execSync(`${wpCliGlobal} plugin activate mr-panel-cache --path="${docRoot}" --allow-root`, { encoding: 'utf8', timeout: 15000 });

                    cacheInstalled = true;
                    console.log('[WP] MR Panel Cache plugin installed');
                }
            }
        } catch (e) {
            cacheError = e.message;
            console.error('MR Panel Cache plugin install failed:', e.message);
        }

        // Save cache API key
        try {
            await db.query('UPDATE websites SET cache_api_key = ? WHERE domain = ?', [cacheApiKey, domain]);
        } catch (e) {
            console.log('Cache API key save note:', e.message);
        }

        // Send notification email
        if (adminEmail) {
            try {
                await NotificationService.sendInstallSuccess({
                    to: adminEmail,
                    domain,
                    appType: 'WordPress',
                    credentials: {
                        'URL': `http://${domain}`,
                        'Admin URL': `http://${domain}/wp-admin`,
                        'Username': adminUser,
                        'Password': adminPassword,
                        'Database': finalDbName,
                        'DB User': finalDbUser,
                        'DB Password': finalDbPassword
                    }
                });
                console.log('[WP] Notification email sent to', adminEmail);
            } catch (e) {
                console.log('[WP] Email notification failed:', e.message);
            }
        }

        res.json({
            ...result,
            db: { name: finalDbName, user: finalDbUser, password: finalDbPassword },
            cache: { installed: cacheInstalled, api_key: cacheApiKey, error: cacheError }
        });
    } catch (err) {
        console.error('[WP] INSTALL ERROR:', err.message, err.stack);
        res.status(500).json({ error: err.message });
    }
};

exports.wordpressDelete = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });

        const docRoot = await resolveDocRoot(domain);

        // Try to find and drop the database
        const dbName = `wp_${domain.replace(/\./g, '_')}`;
        try {
            await db.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
            await db.query(`DROP USER IF EXISTS '${dbName}'@'localhost'`);
            await db.query('FLUSH PRIVILEGES');
        } catch (e) {
            console.log('DB cleanup note:', e.message);
        }

        // Also try to read wp-config.php for actual DB name before dropping
        try {
            const wpConfig = require('fs').readFileSync(`${docRoot}/wp-config.php`, 'utf8');
            const dbNameMatch = wpConfig.match(/define\s*\(\s*'DB_NAME'\s*,\s*'([^']+)'/);
            const dbUserMatch = wpConfig.match(/define\s*\(\s*'DB_USER'\s*,\s*'([^']+)'/);
            if (dbNameMatch && dbNameMatch[1] !== dbName) {
                await db.query(`DROP DATABASE IF EXISTS \`${dbNameMatch[1]}\``);
            }
            if (dbUserMatch && dbUserMatch[1] !== dbName) {
                await db.query(`DROP USER IF EXISTS '${dbUserMatch[1]}'@'localhost'`);
                await db.query('FLUSH PRIVILEGES');
            }
        } catch (e) {}

        const result = WordpressService.removeWp(docRoot);

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.wordpressInfo = async (req, res) => {
    try {
        const { domain } = req.query;
        const docRoot = await resolveDocRoot(domain);

        res.json({
            installed: WordpressService.isInstalled(docRoot),
            version: WordpressService.getInstalledVersion(docRoot),
            plugins: WordpressService.listPlugins(docRoot),
            themes: WordpressService.listThemes(docRoot)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Laravel Installer
exports.laravelPage = async (req, res) => {
    try {
        const websites = await getAllSites();

        for (const site of websites) {
            const docRoot = await resolveDocRoot(site.label);
            site.laravelInstalled = LaravelService.isInstalled(docRoot);
            site.laravelVersion = site.laravelInstalled ? LaravelService.getVersion(docRoot) : null;
        }

        res.render('installer/laravel', {
            title: 'Laravel Installer',
            websites
        });
    } catch (err) {
        console.error(err);
        res.render('installer/laravel', { title: 'Laravel Installer', websites: [] });
    }
};
exports.laravelInstall = async (req, res) => {
    try {
        const { domain, appName, dbName, dbUser, dbPassword, repoUrl } = req.body;

        console.log('=== Laravel Install === domain:', domain);

        if (!domain) {
            return res.status(400).json({ error: 'Domain is required' });
        }

        const docRoot = await resolveDocRoot(domain);

        let finalDbName = dbName || `laravel_${domain.replace(/\./g, '_')}`;
        finalDbName = finalDbName.replace(/[^a-zA-Z0-9_]/g, '');
        let finalDbUser = dbUser || finalDbName;
        finalDbUser = finalDbUser.replace(/[^a-zA-Z0-9_]/g, '');
        let finalDbPassword = dbPassword || crypto.randomBytes(16).toString('hex');

        try {
            await db.query('DROP DATABASE IF EXISTS `' + finalDbName + '`');
            await db.query('DROP USER IF EXISTS ?@localhost', [finalDbUser]);
            await db.query('FLUSH PRIVILEGES');
        } catch (e) {}

        const dbErrors = [];
        try {
            await db.query('CREATE DATABASE `' + finalDbName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        } catch (e) {
            dbErrors.push('CREATE DB: ' + e.message);
        }

        try {
            await db.query('CREATE USER ?@localhost IDENTIFIED BY ?', [finalDbUser, finalDbPassword]);
            await db.query('ALTER USER ?@localhost IDENTIFIED WITH mysql_native_password BY ?', [finalDbUser, finalDbPassword]);
        } catch (e) {
            dbErrors.push('CREATE USER: ' + e.message);
        }

        try {
            await db.query('GRANT ALL PRIVILEGES ON `' + finalDbName + '`.* TO ?@localhost', [finalDbUser]);
            await db.query('FLUSH PRIVILEGES');
        } catch (e) {
            dbErrors.push('GRANT: ' + e.message);
        }

        // ✅ FIX: verify DB connection
        const testConn = await mysql.createConnection({
            host: 'localhost',
            user: finalDbUser,
            password: finalDbPassword,
            database: finalDbName
        });
        try {
            await testConn.query('SELECT 1');
        } catch (e) {
            await testConn.end();
            return res.status(500).json({ error: 'DB user cannot connect: ' + e.message, details: dbErrors });
        }
        await testConn.end();

        // Install Laravel
        const result = await LaravelService.installLaravel(docRoot, {
            appName: appName || 'Laravel',
            domain,
            dbName: finalDbName,
            dbUser: finalDbUser,
            dbPassword: finalDbPassword,
            repoUrl
        });

        // ✅ FIX: Update document_root to /public + fix OLS vhost
        try {
            await db.query('UPDATE websites SET document_root = ? WHERE domain = ?', [`${docRoot}/public`, domain]);
        } catch (e) {}
        try {
            await db.query('UPDATE subdomains SET document_root = ? WHERE subdomain = ?', [`${docRoot}/public`, domain]);
        } catch (e) {}

        const WebsiteService = require('../services/WebsiteService');
        await WebsiteService.fixExistingVhost(domain);
        WebsiteService.reloadOLS();

        res.json({
            ...result,
            db: { name: finalDbName, user: finalDbUser, password: finalDbPassword }
        });
    } catch (err) {
        console.error('[LARAVEL] INSTALL ERROR:', err.message, err.stack);
        res.status(500).json({ error: err.message });
    }
};
exports.laravelDelete = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });

        const docRoot = await resolveDocRoot(domain);
        const result = LaravelService.removeLaravel(docRoot);

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.laravelInfo = async (req, res) => {
    try {
        const { domain } = req.query;
        const docRoot = await resolveDocRoot(domain);

        res.json({
            installed: LaravelService.isInstalled(docRoot),
            version: LaravelService.getVersion(docRoot)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.laravelClearCache = async (req, res) => {
    try {
        const { domain } = req.body;
        const docRoot = await resolveDocRoot(domain);
        const result = LaravelService.clearCache(docRoot);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.laravelOptimize = async (req, res) => {
    try {
        const { domain } = req.body;
        const docRoot = await resolveDocRoot(domain);
        const result = LaravelService.optimize(docRoot);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// phpBB Installer
exports.phpbbPage = async (req, res) => {
    try {
        const websites = await getAllSites();
        for (const site of websites) {
            const docRoot = await resolveDocRoot(site.label);
            site.phpbbInstalled = PhpbbService.isInstalled(docRoot);
            site.phpbbVersion = site.phpbbInstalled ? PhpbbService.getVersion(docRoot) : null;
        }
        res.render('installer/phpbb', { title: 'phpBB Installer', websites });
    } catch (err) {
        res.render('installer/phpbb', { title: 'phpBB Installer', websites: [] });
    }
};

exports.phpbbInstall = async (req, res) => {
    try {
        const { domain, siteName, dbName, dbUser, dbPassword } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain is required' });

        const docRoot = await resolveDocRoot(domain);
        let finalDbName = dbName || `phpbb_${domain.replace(/\./g, '_')}`;
        finalDbName = finalDbName.replace(/[^a-zA-Z0-9_]/g, '');
        let finalDbUser = dbUser || finalDbName;
        finalDbUser = finalDbUser.replace(/[^a-zA-Z0-9_]/g, '');
        let finalDbPassword = dbPassword || require('crypto').randomBytes(16).toString('hex');

        try {
            await db.query('CREATE DATABASE IF NOT EXISTS `' + finalDbName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            await db.query('CREATE USER IF NOT EXISTS ?@localhost IDENTIFIED BY ?', [finalDbUser, finalDbPassword]);
            await db.query('GRANT ALL PRIVILEGES ON `' + finalDbName + '`.* TO ?@localhost', [finalDbUser]);
            await db.query('FLUSH PRIVILEGES');
        } catch (dbErr) {
            console.log('DB creation note:', dbErr.message);
        }

        await PhpbbService.downloadAndExtract(docRoot);
        PhpbbService.createConfig(docRoot, {
            dbName: finalDbName,
            dbUser: finalDbUser,
            dbPassword: finalDbPassword,
            dbHost: 'localhost'
        });

        try {
            execSync(`chown -R lsadm:nogroup "${docRoot}" 2>/dev/null || true`, { stdio: 'ignore' });
        } catch {}

        res.json({
            success: true,
            method: 'browser',
            message: 'phpBB files installed. Complete installation by visiting the install page.',
            installUrl: `http://${domain}/install/`,
            db: { name: finalDbName, user: finalDbUser, password: finalDbPassword }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.phpbbDelete = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });
        const docRoot = await resolveDocRoot(domain);
        res.json(PhpbbService.removePhpbb(docRoot));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Joomla Installer
exports.joomlaPage = async (req, res) => {
    try {
        const websites = await getAllSites();
        for (const site of websites) {
            const docRoot = await resolveDocRoot(site.label);
            site.joomlaInstalled = JoomlaService.isInstalled(docRoot);
            site.joomlaVersion = site.joomlaInstalled ? JoomlaService.getVersion(docRoot) : null;
        }
        res.render('installer/joomla', { title: 'Joomla Installer', websites });
    } catch (err) {
        res.render('installer/joomla', { title: 'Joomla Installer', websites: [] });
    }
};

exports.joomlaInstall = async (req, res) => {
    try {
        const { domain, siteName, dbName, dbUser, dbPassword } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain is required' });

        const docRoot = await resolveDocRoot(domain);
        let finalDbName = dbName || `joomla_${domain.replace(/\./g, '_')}`;
        finalDbName = finalDbName.replace(/[^a-zA-Z0-9_]/g, '');
        let finalDbUser = dbUser || finalDbName;
        finalDbUser = finalDbUser.replace(/[^a-zA-Z0-9_]/g, '');
        let finalDbPassword = dbPassword || require('crypto').randomBytes(16).toString('hex');

        try {
            await db.query('CREATE DATABASE IF NOT EXISTS `' + finalDbName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            await db.query('CREATE USER IF NOT EXISTS ?@localhost IDENTIFIED BY ?', [finalDbUser, finalDbPassword]);
            await db.query('GRANT ALL PRIVILEGES ON `' + finalDbName + '`.* TO ?@localhost', [finalDbUser]);
            await db.query('FLUSH PRIVILEGES');
        } catch (dbErr) {
            console.log('DB creation note:', dbErr.message);
        }

        await JoomlaService.downloadAndExtract(docRoot);
        JoomlaService.createConfiguration(docRoot, {
            siteName: siteName || 'Joomla Site',
            dbName: finalDbName,
            dbUser: finalDbUser,
            dbPassword: finalDbPassword,
            dbHost: 'localhost'
        });

        try {
            execSync(`chown -R lsadm:nogroup "${docRoot}" 2>/dev/null || true`, { stdio: 'ignore' });
            execSync(`chmod -R 755 "${docRoot}/tmp" "${docRoot}/administrator/logs" 2>/dev/null || true`, { stdio: 'ignore' });
        } catch {}

        res.json({
            success: true,
            method: 'browser',
            message: 'Joomla files installed. Complete installation by visiting the site.',
            installUrl: `http://${domain}/installation/`,
            db: { name: finalDbName, user: finalDbUser, password: finalDbPassword }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.joomlaDelete = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });
        const docRoot = await resolveDocRoot(domain);
        res.json(JoomlaService.removeJoomla(docRoot));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Python Application Installer
exports.pythonPage = async (req, res) => {
    try {
        const websites = await getAllSites();
        const pythonVersions = PythonService.detectPythonVersion();

        for (const site of websites) {
            const docRoot = await resolveDocRoot(site.label);
            site.pythonInstalled = PythonService.isInstalled(docRoot);
            site.pythonInfo = site.pythonInstalled ? PythonService.getInfo(docRoot) : null;
            // Always check real systemd status, don't trust .mrpanel.json
            if (site.pythonInstalled) {
                try {
                    const realStatus = PythonService.getStatus(site.label);
                    site.pythonStatus = realStatus;
                    // Update .mrpanel.json if status differs
                    if (site.pythonInfo && site.pythonInfo.status !== realStatus) {
                        site.pythonInfo.status = realStatus === 'active' ? 'running' : 'stopped';
                        PythonService.writeConfig(docRoot, site.pythonInfo);
                    }
                } catch {
                    site.pythonStatus = 'unknown';
                }
            }
        }

        res.render('installer/python', {
            title: 'Python Application',
            websites,
            pythonVersions
        });
    } catch (err) {
        console.error(err);
        res.render('installer/python', { title: 'Python Application', websites: [], pythonVersions: ['11'] });
    }
};

exports.pythonInstall = async (req, res) => {
    try {
        const { domain, pythonVersion, entryPoint, port, requirements, framework } = req.body;

        console.log('=== Python Install === domain:', domain);

        if (!domain) {
            return res.status(400).json({ error: 'Domain is required' });
        }

        const docRoot = await resolveDocRoot(domain);

        let result;
        try {
            result = await PythonService.installPython(docRoot, {
                domain,
                pythonVersion: pythonVersion || '11',
                entryPoint,
                port: port ? parseInt(port) : undefined,
                requirements,
                framework
            });
        } catch (installErr) {
            console.error('[PYTHON] Install failed:', installErr.message);
            // Provide helpful error message
            let msg = installErr.message;
            if (msg.includes('No working Python')) {
                msg += '\n\nRun on VPS: sudo apt install python3-venv python3-pip';
            } else if (msg.includes('Failed to create venv')) {
                msg += '\n\nRun on VPS: sudo apt install python3-venv';
            } else if (msg.includes('Failed to install dependencies')) {
                msg += '\n\nCheck requirements.txt syntax';
            }
            return res.status(500).json({ error: msg });
        }

        const WebsiteService = require('../services/WebsiteService');
        await WebsiteService.fixExistingVhost(domain);
        WebsiteService.reloadOLS();

        res.json(result);
    } catch (err) {
        console.error('[PYTHON] INSTALL ERROR:', err.message, err.stack);
        res.status(500).json({ error: err.message });
    }
};

exports.pythonDelete = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });

        const docRoot = await resolveDocRoot(domain);
        const result = await PythonService.removePython(docRoot, domain);

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.pythonStart = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });

        const docRoot = await resolveDocRoot(domain);
        const result = await PythonService.startApp(domain, docRoot);

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.pythonStop = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });

        const docRoot = await resolveDocRoot(domain);
        const result = await PythonService.stopApp(domain, docRoot);

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.pythonRestart = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });

        const docRoot = await resolveDocRoot(domain);
        const result = await PythonService.restartApp(domain, docRoot);

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.pythonLogs = async (req, res) => {
    try {
        const domain = req.query.domain || req.body.domain;
        if (!domain) return res.status(400).json({ error: 'Domain required' });

        const lines = parseInt(req.query.lines) || 50;
        const logs = PythonService.getLogs(domain, lines);

        res.json({ success: true, logs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.pythonInfo = async (req, res) => {
    try {
        const { domain } = req.query;
        if (!domain) return res.status(400).json({ error: 'Domain required' });

        const docRoot = await resolveDocRoot(domain);
        const info = PythonService.getInfo(docRoot);
        const installed = PythonService.isInstalled(docRoot);
        const status = installed ? PythonService.getStatus(domain) : null;

        res.json({ installed, info, status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
