const ServerService = require('./ServerService');
const ServiceManager = require('./ServiceManager');
const db = require('../config/db');

class DashboardService {

    static async get(user = null) {
        const stats = await this.getStats(user);
        const base = { stats };

        if (!user || user.role === 'admin') {
            base.server = {
                hostname: ServerService.hostname(),
                platform: ServerService.platform(),
                cpu: ServerService.cpu(),
                ram: ServerService.ram(),
                disk: await ServerService.disk(),
                uptime: ServerService.uptime(),
                network: ServerService.jaringan()
            };
            base.services = {
                ols: await ServiceManager.status('lsws'),
                mariadb: await ServiceManager.status('mariadb'),
                redis: await ServiceManager.status('redis-server'),
                docker: await ServiceManager.status('docker')
            };
            base.serverInfo = await this.getServerInfo();
        }

        return base;
    }

    static async getServerInfo() {
        const p = ServerService.platform() || {};
        const info = {
            hostname: ServerService.hostname() || 'N/A',
            platform: (p.os || 'N/A') + ' ' + (p.release || '') + ' (' + (p.arch || '') + ')',
            webServer: 'LiteSpeed',
            mysql: 'N/A',
            php: 'N/A'
        };
        try {
            const { execSync } = require('child_process');
            try { info.mysql = execSync('mysql --version 2>/dev/null', { encoding: 'utf8' }).match(/(\d+\.\d+\.\d+)/)?.[0] || 'N/A'; } catch(e) {}
            try { info.php = execSync('php -r "echo PHP_VERSION;" 2>/dev/null', { encoding: 'utf8' }).trim() || 'N/A'; } catch(e) {}
            try { execSync('ls /usr/local/lsws 2>/dev/null'); info.webServer = 'LiteSpeed'; } catch(e) {
                try { execSync('which nginx 2>/dev/null'); info.webServer = 'Nginx'; } catch(e2) { info.webServer = 'Apache'; }
            }
        } catch (e) {}
        return info;
    }

    static async getStats(user = null) {
        if (!user || user.role === 'admin') {
            const [users] = await db.execute('SELECT COUNT(*) as cnt FROM users WHERE role = "user"');
            const [resellers] = await db.execute('SELECT COUNT(*) as cnt FROM users WHERE role = "reseller"');
            const [websites] = await db.execute('SELECT COUNT(*) as cnt FROM websites');
            const [emails] = await db.execute('SELECT COUNT(*) as cnt FROM email_accounts WHERE status != "deleted"');
            const [databases] = await db.execute('SELECT COUNT(*) as cnt FROM user_databases');

            const disk = await ServerService.disk();
            const bandwidth = { used: 0, total: 'N/A', percent: 0 };

            return {
                type: 'admin',
                totalUsers: users[0].cnt,
                totalResellers: resellers[0].cnt,
                totalWebsites: websites[0].cnt,
                totalEmails: emails[0].cnt,
                totalDatabases: databases[0].cnt,
                disk,
                bandwidth
            };
        }

        if (user.role === 'reseller') {
            const [users] = await db.execute('SELECT COUNT(*) as cnt FROM users WHERE owner_id = ?', [user.id]);
            const [websites] = await db.execute(
                'SELECT COUNT(*) as cnt FROM websites WHERE user_id IN (SELECT id FROM users WHERE owner_id = ?) OR user_id = ? OR user_id IS NULL',
                [user.id, user.id]
            );
            const [emails] = await db.execute(
                'SELECT COUNT(*) as cnt FROM email_accounts WHERE status != "deleted" AND (user_id IN (SELECT id FROM users WHERE owner_id = ?) OR user_id = ? OR user_id IS NULL)',
                [user.id, user.id]
            );
            const [databases] = await db.execute(
                'SELECT COUNT(*) as cnt FROM user_databases WHERE user_id IN (SELECT id FROM users WHERE owner_id = ?) OR user_id = ?',
                [user.id, user.id]
            );

            const pkg = user.package_id ? await this._getPackage(user.package_id) : null;
            const quota = pkg ? {
                diskLimit: pkg.disk_limit,
                bandwidthLimit: pkg.bandwidth_limit,
                maxDomains: pkg.max_domains,
                maxEmail: pkg.max_email,
                maxDatabase: pkg.max_database
            } : null;

            return {
                type: 'reseller',
                package: pkg ? pkg.name : 'Unlimited',
                status: user.status || 'active',
                totalUsers: users[0].cnt,
                totalWebsites: websites[0].cnt,
                totalEmails: emails[0].cnt,
                totalDatabases: databases[0].cnt,
                quota
            };
        }

        const [websites] = await db.execute('SELECT COUNT(*) as cnt FROM websites WHERE user_id = ?', [user.id]);
        const [emails] = await db.execute('SELECT COUNT(*) as cnt FROM email_accounts WHERE status != "deleted" AND user_id = ?', [user.id]);
        const [databases] = await db.execute('SELECT COUNT(*) as cnt FROM user_databases WHERE user_id = ?', [user.id]);
        const [domains] = await db.execute('SELECT domain FROM websites WHERE user_id = ?', [user.id]);

        const pkg = user.package_id ? await this._getPackage(user.package_id) : null;
        const quota = pkg ? {
            diskLimit: pkg.disk_limit,
            bandwidthLimit: pkg.bandwidth_limit,
            maxDomains: pkg.max_domains,
            maxEmail: pkg.max_email,
            maxDatabase: pkg.max_database
        } : null;

        return {
            type: 'user',
            username: user.username,
            packageName: pkg ? pkg.name : 'Unlimited',
            domain: domains.length > 0 ? domains[0].domain : 'No domain',
            status: user.status || 'active',
            totalWebsites: websites[0].cnt,
            totalEmails: emails[0].cnt,
            totalDatabases: databases[0].cnt,
            quota
        };
    }

    static async _getPackage(packageId) {
        const [rows] = await db.execute('SELECT * FROM packages WHERE id = ?', [packageId]);
        return rows[0] || null;
    }

}

module.exports = DashboardService;
