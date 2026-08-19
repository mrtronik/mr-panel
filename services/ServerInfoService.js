const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

class ServerService {

    static getSystemInfo() {
        const hostname = os.hostname();
        const platform = os.platform();
        const arch = os.arch();
        const release = os.release();
        const uptime = os.uptime();
        const loadAvg = os.loadavg();

        let cpuModel = 'Unknown';
        let cpuCores = os.cpus().length;
        try {
            const cpuinfo = execSync("cat /proc/cpuinfo 2>/dev/null | grep 'model name' | head -1", { encoding: 'utf8' });
            cpuModel = cpuinfo.split(':')[1]?.trim() || 'Unknown';
        } catch {}

        return {
            hostname,
            platform,
            arch,
            release,
            uptime: this.formatUptime(uptime),
            uptimeSeconds: uptime,
            cpuModel,
            cpuCores,
            loadAvg: {
                '1min': loadAvg[0].toFixed(2),
                '5min': loadAvg[1].toFixed(2),
                '15min': loadAvg[2].toFixed(2)
            }
        };
    }

    static getMemoryInfo() {
        const total = os.totalmem();
        const free = os.freemem();
        const used = total - free;
        return {
            total: this.formatBytes(total),
            used: this.formatBytes(used),
            free: this.formatBytes(free),
            percent: ((used / total) * 100).toFixed(1)
        };
    }

    static getDiskInfo() {
        try {
            const output = execSync("df -h / 2>/dev/null | tail -1", { encoding: 'utf8' });
            const parts = output.trim().split(/\s+/);
            return {
                filesystem: parts[0],
                size: parts[1],
                used: parts[2],
                available: parts[3],
                percent: parseFloat(parts[4])
            };
        } catch {
            return { filesystem: 'Unknown', size: '0', used: '0', available: '0', percent: '0%' };
        }
    }

    static getServices() {
        const services = [
            { name: 'OpenLiteSpeed', checkCmd: 'systemctl is-active openlitespeed 2>/dev/null || pgrep lshttpd', stopCmd: 'systemctl stop openlitespeed', startCmd: 'systemctl start openlitespeed' },
            { name: 'MySQL', checkCmd: 'systemctl is-active mysql 2>/dev/null || systemctl is-active mysqld 2>/dev/null || pgrep mysqld', stopCmd: 'systemctl stop mysql', startCmd: 'systemctl start mysql' },
            { name: 'BIND9 (DNS)', checkCmd: 'systemctl is-active bind9 2>/dev/null || systemctl is-active named 2>/dev/null || pgrep named', stopCmd: 'systemctl stop bind9', startCmd: 'systemctl start bind9' },
            { name: 'PHP-FPM', checkCmd: `systemctl is-active php${this._getPhpFpmVersion()}-fpm 2>/dev/null`, stopCmd: `systemctl stop php${this._getPhpFpmVersion()}-fpm`, startCmd: `systemctl start php${this._getPhpFpmVersion()}-fpm` },
            { name: 'Dovecot (IMAP)', checkCmd: 'systemctl is-active dovecot 2>/dev/null || pgrep dovecot', stopCmd: 'systemctl stop dovecot', startCmd: 'systemctl start dovecot' },
            { name: 'Postfix (SMTP)', checkCmd: 'systemctl is-active postfix 2>/dev/null || pgrep master', stopCmd: 'systemctl stop postfix', startCmd: 'systemctl start postfix' },
            { name: 'SSH', checkCmd: 'systemctl is-active sshd 2>/dev/null || systemctl is-active ssh 2>/dev/null', stopCmd: '', startCmd: '' },
            { name: 'Fail2ban', checkCmd: 'systemctl is-active fail2ban 2>/dev/null || pgrep fail2ban', stopCmd: 'systemctl stop fail2ban', startCmd: 'systemctl start fail2ban' }
        ];

        return services.map(s => {
            let running = false;
            try { running = execSync(s.checkCmd, { encoding: 'utf8' }).trim().length > 0; } catch {}
            return { ...s, running };
        });
    }

    static _getPhpFpmVersion() {
        try {
            const versions = execSync('ls /etc/php/ 2>/dev/null', { encoding: 'utf8' }).trim().split('\n').filter(v => v.trim());
            return versions.length > 0 ? versions[versions.length - 1] : '';
        } catch { return ''; }
    }

    static restartService(name) {
        const services = this.getServices();
        const svc = services.find(s => s.name === name);
        if (!svc) throw new Error('Service not found');
        if (!svc.startCmd) throw new Error('Service cannot be restarted');

        try {
            execSync(svc.startCmd, { encoding: 'utf8' });
            return { success: true };
        } catch (err) {
            throw new Error('Failed to restart: ' + err.message);
        }
    }

    static stopService(name) {
        const services = this.getServices();
        const svc = services.find(s => s.name === name);
        if (!svc) throw new Error('Service not found');
        if (!svc.stopCmd) throw new Error('Service cannot be stopped');

        try {
            execSync(svc.stopCmd, { encoding: 'utf8' });
            return { success: true };
        } catch (err) {
            throw new Error('Failed to stop: ' + err.message);
        }
    }

    static getNetworkInfo() {
        try {
            const interfaces = os.networkInterfaces();
            const result = [];
            for (const [name, addrs] of Object.entries(interfaces)) {
                for (const addr of addrs) {
                    if (!addr.internal && addr.family === 'IPv4') {
                        result.push({ interface: name, address: addr.address, netmask: addr.netmask });
                    }
                }
            }
            return result;
        } catch {
            return [];
        }
    }

    static getProcesses() {
        try {
            const output = execSync('ps aux --sort=-%cpu 2>/dev/null | head -15', { encoding: 'utf8' });
            const lines = output.split('\n');
            const header = lines[0];
            const procs = [];
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].trim().split(/\s+/);
                if (parts.length >= 11) {
                    procs.push({
                        user: parts[0],
                        pid: parts[1],
                        cpu: parts[2],
                        mem: parts[3],
                        command: parts.slice(10).join(' ')
                    });
                }
            }
            return procs;
        } catch {
            return [];
        }
    }

    static formatUptime(seconds) {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${d}d ${h}h ${m}m`;
    }

    static formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
	static jaringan() {

        const interfaces = "kopet";

         
        return interfaces;
    }
}

module.exports = ServerService;
