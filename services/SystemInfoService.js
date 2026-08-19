const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');

class SystemInfoService {

    static exec(cmd) {
        try {
            return execSync(cmd, { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }).trim();
        } catch (e) {
            return '';
        }
    }

    static execWin(cmd) {
        try {
            return execSync(cmd, { encoding: 'utf8', timeout: 5000, shell: 'cmd.exe', stdio: 'pipe' }).trim();
        } catch (e) {
            return '';
        }
    }

    static getSystemInfo() {
        var isWin = os.platform() === 'win32';
        return {
            hostname: os.hostname(),
            homeDirectory: isWin ? (process.env.USERPROFILE || 'C:\\Users\\' + (this.exec('whoami') || 'root')) : '/home/' + (this.exec('whoami') || 'root'),
            uptime: this.formatUptime(os.uptime()),
            coresCount: os.cpus().length,
            osType: os.type(),
            osRelease: os.release(),
            platform: os.platform(),
            arch: os.arch()
        };
    }

    static formatUptime(seconds) {
        var days = Math.floor(seconds / 86400);
        var hours = Math.floor((seconds % 86400) / 3600);
        var mins = Math.floor((seconds % 3600) / 60);
        var parts = [];
        if (days > 0) parts.push(days + ' day' + (days > 1 ? 's' : ''));
        if (hours > 0) parts.push(hours + ' hour' + (hours > 1 ? 's' : ''));
        if (mins > 0) parts.push(mins + ' minute' + (mins > 1 ? 's' : ''));
        return parts.join(', ') || '0 minutes';
    }

    static getCpuInfo() {
        var cpus = os.cpus();
        return cpus.map(function(cpu) {
            return {
                brand: cpu.model.indexOf('Intel') > -1 ? 'GenuineIntel' : cpu.model.indexOf('AMD') > -1 ? 'AuthenticAMD' : 'Unknown',
                model: cpu.model,
                bogoMIPS: Math.round(cpu.speed * 2) || 'N/A',
                speed: cpu.speed + ' MHz'
            };
        });
    }

    static getFileSystemInfo() {
        var isWin = os.platform() === 'win32';

        if (isWin) {
            try {
                var output = execSync('wmic logicaldisk where "DriveType=3" get DeviceID,Size,FreeSpace,FileSystem /format:csv', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
                var lines = output.split('\n').filter(function(l) { return l.trim() && l.indexOf('Node') === -1; });
                return lines.map(function(line) {
                    var parts = line.split(',');
                    if (parts.length >= 5) {
                        var totalBytes = parseInt(parts[3]) || 0;
                        var freeBytes = parseInt(parts[2]) || 0;
                        return {
                            device: parts[1],
                            type: parts[4] || 'NTFS',
                            size: (totalBytes / (1024 * 1024 * 1024)).toFixed(1) + 'G',
                            used: ((totalBytes - freeBytes) / (1024 * 1024 * 1024)).toFixed(1) + 'G',
                            reserved: '0B',
                            available: (freeBytes / (1024 * 1024 * 1024)).toFixed(1) + 'G',
                            mountedOn: parts[1]
                        };
                    }
                    return null;
                }).filter(Boolean);
            } catch (e) {
                return [];
            }
        }

        var output = this.exec('df -hT --exclude-type=tmpfs --exclude-type=devtmpfs --exclude-type=squashfs 2>/dev/null || df -h 2>/dev/null');
        var lines = output.split('\n').filter(function(l) { return l.trim() && l.indexOf('Filesystem') === -1; });
        
        return lines.map(function(line) {
            var parts = line.split(/\s+/);
            if (parts.length >= 6) {
                return {
                    device: parts[0],
                    type: parts[1],
                    size: parts[2],
                    used: parts[3],
                    reserved: parts[4] || '0B',
                    available: parts[5],
                    mountedOn: parts[6] || parts[parts.length - 1]
                };
            }
            return null;
        }).filter(Boolean);
    }

    static getDiskUsage() {
        var self = this;
        var fileSystems = this.getFileSystemInfo();
        return fileSystems.map(function(f) {
            return {
                mount: f.mountedOn,
                total: f.size,
                used: f.used,
                reserved: f.reserved,
                available: f.available,
                totalBytes: self.parseSize(f.size),
                usedBytes: self.parseSize(f.used),
                availableBytes: self.parseSize(f.available)
            };
        });
    }

    static parseSize(str) {
        if (!str) return 0;
        var num = parseFloat(str);
        if (isNaN(num)) return 0;
        var unit = str.replace(/[\d.]/g, '').toUpperCase();
        if (unit === 'T' || unit === 'TB') return num * 1024 * 1024 * 1024 * 1024;
        if (unit === 'G' || unit === 'GB') return num * 1024 * 1024 * 1024;
        if (unit === 'M' || unit === 'MB') return num * 1024 * 1024;
        if (unit === 'K' || unit === 'KB') return num * 1024;
        return num;
    }

    static getMemoryInfo() {
        var totalMem = os.totalmem();
        var freeMem = os.freemem();
        var usedMem = totalMem - freeMem;

        var cached = 0;
        var swapTotal = 0;
        var swapUsed = 0;

        try {
            var meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
            var cachedMatch = meminfo.match(/Cached:\s+(\d+)/);
            var swapTotalMatch = meminfo.match(/SwapTotal:\s+(\d+)/);
            var swapFreeMatch = meminfo.match(/SwapFree:\s+(\d+)/);

            if (cachedMatch) cached = parseInt(cachedMatch[1]) * 1024;
            if (swapTotalMatch) swapTotal = parseInt(swapTotalMatch[1]) * 1024;
            if (swapFreeMatch) swapUsed = swapTotal - parseInt(swapFreeMatch[1]) * 1024;
        } catch (e) {}

        return {
            ram: {
                total: this.formatBytes(totalMem),
                used: this.formatBytes(usedMem),
                free: this.formatBytes(freeMem),
                cached: this.formatBytes(cached),
                totalBytes: totalMem,
                usedBytes: usedMem,
                freeBytes: freeMem,
                cachedBytes: cached
            },
            swap: {
                total: this.formatBytes(swapTotal),
                used: this.formatBytes(swapUsed),
                free: this.formatBytes(swapTotal - swapUsed),
                totalBytes: swapTotal,
                usedBytes: swapUsed,
                freeBytes: swapTotal - swapUsed
            }
        };
    }

    static formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        var k = 1024;
        var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static isRunning(cmd) {
        try {
            var result = execSync(cmd, { encoding: 'utf8', timeout: 3000, stdio: 'pipe' }).trim();
            return result.length > 0;
        } catch (e) {
            return false;
        }
    }

    static getServices() {
        var self = this;
        var isWin = os.platform() === 'win32';

        if (isWin) {
            var winServices = [
                { name: 'MySQL/MariaDB', checkCmd: 'sc query mysql 2>nul | findstr STATE', versionCmd: 'mysql --version' },
                { name: 'SSH Daemon', checkCmd: 'sc query sshd 2>nul | findstr STATE', versionCmd: '' },
                { name: 'Nginx', checkCmd: 'tasklist /FI "IMAGENAME eq nginx.exe" 2>nul | findstr /I nginx', versionCmd: 'nginx -v' },
                { name: 'PHP-FPM', checkCmd: 'tasklist /FI "IMAGENAME eq php-cgi.exe" 2>nul | findstr /I php', versionCmd: 'php -v' },
                { name: 'Cron Daemon', checkCmd: 'sc query cron 2>nul | findstr STATE', versionCmd: '' }
            ];

            return winServices.map(function(s) {
                var running = self.isRunning(s.checkCmd);
                var version = s.versionCmd ? self.execWin(s.versionCmd) : '';
                return {
                    name: s.name,
                    version: version || '-',
                    status: running ? 'running' : 'stopped'
                };
            });
        }

        var services = [
            { name: 'OpenLiteSpeed', checkCmd: 'pgrep -f lshttpd', versionCmd: '/usr/local/lsws/bin/lshttpd -v 2>&1 | head -1' },
            { name: 'MySQL/MariaDB', checkCmd: 'systemctl is-active mysql 2>/dev/null || systemctl is-active mariadb 2>/dev/null || pgrep mysqld', versionCmd: 'mysql --version 2>&1 | head -1' },
            { name: 'SSH Daemon', checkCmd: 'systemctl is-active sshd 2>/dev/null || systemctl is-active ssh 2>/dev/null || pgrep sshd', versionCmd: '' },
            { name: 'Nginx', checkCmd: 'systemctl is-active nginx 2>/dev/null || pgrep nginx', versionCmd: 'nginx -v 2>&1' },
            { name: 'PHP-FPM', checkCmd: 'pgrep -f php-fpm', versionCmd: 'php -v 2>/dev/null | head -1' },
            { name: 'DNS (BIND)', checkCmd: 'systemctl is-active named 2>/dev/null || systemctl is-active bind9 2>/dev/null || pgrep named', versionCmd: '' },
            { name: 'Exim Mail', checkCmd: 'systemctl is-active exim4 2>/dev/null || systemctl is-active exim 2>/dev/null || pgrep exim', versionCmd: '' },
            { name: 'Dovecot', checkCmd: 'systemctl is-active dovecot 2>/dev/null || pgrep dovecot', versionCmd: '' },
            { name: 'Pure-FTPd', checkCmd: 'systemctl is-active pure-ftpd 2>/dev/null || pgrep pure-ftpd || pgrep ftpd', versionCmd: '' },
            { name: 'Cron Daemon', checkCmd: 'systemctl is-active cron 2>/dev/null || systemctl is-active crond 2>/dev/null || pgrep cron || pgrep crond', versionCmd: '' }
        ];

        return services.map(function(s) {
            var running = self.isRunning(s.checkCmd);
            var version = s.versionCmd ? self.exec(s.versionCmd) : '';
            return {
                name: s.name,
                version: version || '-',
                status: running ? 'running' : 'stopped'
            };
        });
    }

    static getLoadAverage() {
        var isWin = os.platform() === 'win32';
        if (isWin) {
            return { one: 'N/A', five: 'N/A', fifteen: 'N/A' };
        }
        var loadAvg = os.loadavg();
        return {
            one: loadAvg[0].toFixed(2),
            five: loadAvg[1].toFixed(2),
            fifteen: loadAvg[2].toFixed(2)
        };
    }

    static getAll() {
        return {
            system: this.getSystemInfo(),
            cpu: this.getCpuInfo(),
            fileSystem: this.getFileSystemInfo(),
            diskUsage: this.getDiskUsage(),
            memory: this.getMemoryInfo(),
            services: this.getServices(),
            loadAverage: this.getLoadAverage()
        };
    }
}

module.exports = SystemInfoService;
