const db = require('../config/db');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class UsageService {

    // ═══════════════════════════════════════
    //  Get disk usage for a single website
    // ═══════════════════════════════════════
    static async getDiskUsage(domain) {
        const docRoot = `/home/public_html/${domain}`;
        try {
            const { stdout } = await execAsync(`du -sb "${docRoot}" 2>/dev/null || echo "0 ${docRoot}"`);
            const bytes = parseInt(stdout.split('\t')[0]) || 0;
            return bytes;
        } catch {
            return 0;
        }
    }

    // ═══════════════════════════════════════
    //  Get disk usage for all websites
    // ═══════════════════════════════════════
    static async getAllDiskUsage() {
        try {
            const { stdout } = await execAsync('du -sb /home/public_html/*/ 2>/dev/null || true');
            const lines = stdout.trim().split('\n').filter(Boolean);
            const usage = {};
            for (const line of lines) {
                const [bytes, dir] = line.split('\t');
                const match = dir && dir.match(/\/home\/public_html\/([^/]+)/);
                if (match) {
                    usage[match[1]] = parseInt(bytes) || 0;
                }
            }
            return usage;
        } catch {
            return {};
        }
    }

    // ═══════════════════════════════════════
    //  Get total disk usage for a user
    // ═══════════════════════════════════════
    static async getUserDiskUsage(userId) {
        const [websites] = await db.execute('SELECT domain FROM websites WHERE user_id = ?', [userId]);
        let total = 0;
        for (const w of websites) {
            total += await this.getDiskUsage(w.domain);
        }
        return total;
    }

    // ═══════════════════════════════════════
    //  Snapshot all websites to database
    // ═══════════════════════════════════════
    static async snapshotAll() {
        const usage = await this.getAllDiskUsage();
        const domains = Object.keys(usage);
        let saved = 0;
        for (const domain of domains) {
            const bytes = usage[domain];
            await db.execute(
                'INSERT INTO website_usage (domain, disk_bytes, snapshot_at) VALUES (?, ?, NOW())',
                [domain, bytes]
            );
            saved++;
        }
        // Also update website_usage_summary
        for (const domain of domains) {
            const [existing] = await db.execute('SELECT id FROM website_usage_summary WHERE domain = ?', [domain]);
            if (existing.length === 0) {
                await db.execute('INSERT INTO website_usage_summary (domain, disk_bytes, updated_at) VALUES (?, ?, NOW())', [domain, usage[domain]]);
            } else {
                await db.execute('UPDATE website_usage_summary SET disk_bytes = ?, updated_at = NOW() WHERE domain = ?', [usage[domain], domain]);
            }
        }
        return saved;
    }

    // ═══════════════════════════════════════
    //  Get usage summary (for dashboard)
    // ═══════════════════════════════════════
    static async getSummary(user) {
        let websites;
        if (!user || user.role === 'admin') {
            [websites] = await db.execute('SELECT id, domain, user_id FROM websites ORDER BY domain');
        } else if (user.role === 'reseller') {
            [websites] = await db.execute(
                'SELECT id, domain, user_id FROM websites WHERE user_id = ? OR user_id IN (SELECT id FROM users WHERE owner_id = ?) ORDER BY domain',
                [user.id, user.id]
            );
        } else {
            [websites] = await db.execute('SELECT id, domain, user_id FROM websites WHERE user_id = ? ORDER BY domain', [user.id]);
        }

        let totalDisk = 0;
        const siteUsage = [];

        // Try summary table first
        let hasSummary = false;
        for (const w of websites) {
            const [rows] = await db.execute('SELECT disk_bytes, updated_at FROM website_usage_summary WHERE domain = ? ORDER BY updated_at DESC LIMIT 1', [w.domain]);
            if (rows[0] && rows[0].disk_bytes > 0) hasSummary = true;
        }

        if (hasSummary) {
            for (const w of websites) {
                const [rows] = await db.execute('SELECT disk_bytes, updated_at FROM website_usage_summary WHERE domain = ? ORDER BY updated_at DESC LIMIT 1', [w.domain]);
                const disk = rows[0] ? rows[0].disk_bytes : 0;
                totalDisk += disk;
                siteUsage.push({ domain: w.domain, disk_bytes: disk, updated_at: rows[0] ? rows[0].updated_at : null });
            }
        } else {
            // Live fallback: run du directly
            for (const w of websites) {
                const disk = await this.getDiskUsage(w.domain);
                totalDisk += disk;
                siteUsage.push({ domain: w.domain, disk_bytes: disk, updated_at: null });
            }
        }

        // Get server total disk
        let serverDisk = 0;
        let serverUsed = 0;
        try {
            const { stdout } = await execAsync("df -B1 / | tail -1");
            const parts = stdout.trim().split(/\s+/);
            serverDisk = parseInt(parts[1]) || 0;
            serverUsed = parseInt(parts[2]) || 0;
        } catch {}

        return {
            websites: siteUsage,
            total_disk: totalDisk,
            website_count: websites.length,
            server_disk: serverDisk,
            server_used: serverUsed
        };
    }

    // ═══════════════════════════════════════
    //  Check if user exceeds package quota
    // ═══════════════════════════════════════
    static async checkQuota(user) {
        if (!user || user.role === 'admin') return { exceeded: false };
        if (!user.package_id) return { exceeded: false };

        const [pkgs] = await db.execute('SELECT * FROM packages WHERE id = ?', [user.package_id]);
        if (pkgs.length === 0) return { exceeded: false };
        const pkg = pkgs[0];

        const usage = await this.getSummary(user);
        const diskMB = Math.round(usage.total_disk / 1024 / 1024);
        const diskLimitMB = pkg.disk_quota || 0;

        if (diskLimitMB > 0 && diskMB >= diskLimitMB) {
            return { exceeded: true, current: diskMB, limit: diskLimitMB, unit: 'MB' };
        }
        return { exceeded: false, current: diskMB, limit: diskLimitMB, unit: 'MB' };
    }

    // ═══════════════════════════════════════
    //  Get disk usage history (for charts)
    // ═══════════════════════════════════════
    static async getHistory(domain, days = 7) {
        const [rows] = await db.execute(
            'SELECT disk_bytes, snapshot_at FROM website_usage WHERE domain = ? AND snapshot_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ORDER BY snapshot_at',
            [domain, days]
        );
        return rows;
    }

    // ═══════════════════════════════════════
    //  Format bytes to human readable
    // ═══════════════════════════════════════
    static formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = UsageService;
