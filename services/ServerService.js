const os = require('os');
const { execFile } = require('child_process');

class ServerService {
static networkPrevious = null;
    static ram() {

        const total = os.totalmem();
        const free = os.freemem();
        const used = total - free;

        return {
            total,
            free,
            used,
            percent: Number(((used / total) * 100).toFixed(1))
        };

    }

    static cpu() {

        const cpus = os.cpus();
        const load = os.loadavg();
        const cores = cpus.length;

        return {
            model: cpus[0].model,
            cores: cores,
            load: load,
            percent: Number(((load[0] / cores) * 100).toFixed(1))
        };

    }

    static uptime() {

        const sec = os.uptime();

        const day = Math.floor(sec / 86400);
        const hour = Math.floor((sec % 86400) / 3600);
        const minute = Math.floor((sec % 3600) / 60);

        return `${day} Days ${hour} Hours ${minute} Minutes`;

    }

    static hostname() {

        return os.hostname();

    }

    static platform() {

        return {
            os: os.platform(),
            release: os.release(),
            arch: os.arch()
        };

    }

    static disk() {

        return new Promise((resolve) => {

            execFile('df', ['-k', '/'], (err, stdout) => {

                if (err)
                    return resolve(null);

                const rows = stdout.trim().split('\n');

                const data = rows[1].split(/\s+/);

                resolve({

                    total: Number(data[1]) * 1024,

                    used: Number(data[2]) * 1024,

                    free: Number(data[3]) * 1024,

                   percent: parseFloat(data[4])

                });

            });

        });

    }
	static jaringan() {

    const fs = require('fs');

    let rx = 0;
    let tx = 0;

    try {

        const data = fs.readFileSync('/proc/net/dev', 'utf8');

        const lines = data.split('\n');

        for (const line of lines) {

            if (!line.includes(':')) continue;

            const [iface, values] = line.trim().split(':');

            if (iface === 'lo') continue;

            const parts = values.trim().split(/\s+/);

            rx += Number(parts[0]) || 0;
            tx += Number(parts[8]) || 0;
        }

    } catch (err) {

        console.error('Network stats error:', err.message);

    }

    // =========================
    // HITUNG SPEED
    // =========================

    if (!this.networkPrevious) {

        this.networkPrevious = {
            rx,
            tx,
            time: Date.now()
        };

        return {
            rx: 0,
            tx: 0,
            unit: 'KB/s'
        };
    }

    const now = Date.now();

    const elapsed = (now - this.networkPrevious.time) / 1000;

    const rxSpeed = (rx - this.networkPrevious.rx) / elapsed / 1024;

    const txSpeed = (tx - this.networkPrevious.tx) / elapsed / 1024;

    this.networkPrevious = {
        rx,
        tx,
        time: now
    };

    return {
        rx: Number(rxSpeed.toFixed(2)),
        tx: Number(txSpeed.toFixed(2)),
        unit: 'KB/s'
    };
}

}

module.exports = ServerService;