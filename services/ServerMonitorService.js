const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const os = require('os');
const fs = require('fs');

class ServerMonitorService {

    static async getStats() {
        const [cpu, ram, disk, network, load, uptime] = await Promise.all([
            this.getCpuUsage(),
            this.getRamUsage(),
            this.getDiskUsage(),
            this.getNetworkUsage(),
            this.getLoadAverage(),
            this.getUptime()
        ]);
        return { cpu, ram, disk, network, load, uptime, timestamp: Date.now() };
    }

    static async getCpuUsage() {
        try {
            const { stdout } = await execAsync("top -bn1 | grep '%Cpu' | head -1", { timeout: 5000 });
            const idle = parseFloat(stdout.match(/(\d+\.\d+)\s*id/)?.[1] || 0);
            const used = 100 - idle;
            return { percent: Math.round(used * 10) / 10, cores: os.cpus().length, model: os.cpus()[0]?.model || 'Unknown' };
        } catch {
            const cpus = os.cpus();
            const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
            const totalTick = cpus.reduce((acc, cpu) => acc + Object.values(cpu.times).reduce((a, b) => a + b, 0), 0);
            const idle = totalIdle / totalTick;
            return { percent: Math.round((1 - idle) * 1000) / 10, cores: cpus.length, model: cpus[0]?.model || 'Unknown' };
        }
    }

    static async getRamUsage() {
        try {
            const { stdout } = await execAsync("free -b | grep Mem", { timeout: 5000 });
            const parts = stdout.trim().split(/\s+/);
            const total = parseInt(parts[1]) || 0;
            const used = parseInt(parts[2]) || 0;
            const free = parseInt(parts[3]) || 0;
            const available = parseInt(parts[6]) || free;
            return {
                total, used, free, available,
                percent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
                totalFormatted: this.formatBytes(total),
                usedFormatted: this.formatBytes(used)
            };
        } catch {
            const total = os.totalmem();
            const free = os.freemem();
            const used = total - free;
            return {
                total, used, free, available: free,
                percent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
                totalFormatted: this.formatBytes(total),
                usedFormatted: this.formatBytes(used)
            };
        }
    }

    static async getDiskUsage() {
        try {
            const { stdout } = await execAsync("df -B1 / | tail -1", { timeout: 5000 });
            const parts = stdout.trim().split(/\s+/);
            const total = parseInt(parts[1]) || 0;
            const used = parseInt(parts[2]) || 0;
            return {
                total, used,
                percent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
                totalFormatted: this.formatBytes(total),
                usedFormatted: this.formatBytes(used)
            };
        } catch {
            return { total: 0, used: 0, percent: 0, totalFormatted: 'N/A', usedFormatted: 'N/A' };
        }
    }

    static async getNetworkUsage() {
        try {
            const { stdout } = await execAsync("cat /proc/net/dev | grep eth0 || cat /proc/net/dev | grep -E 'ens|enp' | head -1", { timeout: 5000 });
            const parts = stdout.trim().split(/\s+/);
            const iface = parts[0]?.replace(':', '') || 'eth0';
            const rxBytes = parseInt(parts[1]) || 0;
            const txBytes = parseInt(parts[9]) || 0;
            return { interface: iface, rxBytes, txBytes, rxFormatted: this.formatBytes(rxBytes), txFormatted: this.formatBytes(txBytes) };
        } catch {
            return { interface: 'N/A', rxBytes: 0, txBytes: 0, rxFormatted: '0 B', txFormatted: '0 B' };
        }
    }

    static async getLoadAverage() {
        const loads = os.loadavg();
        return {
            '1m': Math.round(loads[0] * 100) / 100,
            '5m': Math.round(loads[1] * 100) / 100,
            '15m': Math.round(loads[2] * 100) / 100
        };
    }

    static async getUptime() {
        const secs = os.uptime();
        const days = Math.floor(secs / 86400);
        const hours = Math.floor((secs % 86400) / 3600);
        const mins = Math.floor((secs % 3600) / 60);
        return { seconds: secs, formatted: `${days}d ${hours}h ${mins}m` };
    }

    static async getProcesses() {
        try {
            const { stdout } = await execAsync("ps aux --sort=-%cpu | head -11", { timeout: 5000 });
            const lines = stdout.trim().split('\n').slice(1);
            return lines.map(line => {
                const parts = line.trim().split(/\s+/);
                return { user: parts[0], pid: parts[1], cpu: parseFloat(parts[2]) || 0, mem: parseFloat(parts[3]) || 0, command: parts.slice(10).join(' ').substring(0, 80) };
            });
        } catch { return []; }
    }

    static async getServices() {
        const services = [
            { name: 'OpenLiteSpeed', service: 'lsws' },
            { name: 'MySQL/MariaDB', service: 'mysql' },
            { name: 'Postfix', service: 'postfix' },
            { name: 'Dovecot', service: 'dovecot' },
            { name: 'PowerDNS', service: 'pdns' },
            { name: 'OpenDKIM', service: 'opendkim' },
            { name: 'Fail2ban', service: 'fail2ban' },
            { name: 'SSH', service: 'sshd' }
        ];
        const results = [];
        for (const s of services) {
            try {
                const { stdout } = await execAsync(`systemctl is-active ${s.service} 2>/dev/null || echo inactive`, { timeout: 3000 });
                results.push({ ...s, status: stdout.trim() === 'active' ? 'running' : 'stopped' });
            } catch {
                results.push({ ...s, status: 'unknown' });
            }
        }
        return results;
    }

    static formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = ServerMonitorService;
