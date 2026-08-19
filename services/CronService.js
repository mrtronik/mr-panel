const { execSync } = require('child_process');
const fs = require('fs');

class CronService {

    static _validateUsername(username) {
        if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) {
            throw new Error('Invalid username');
        }
        return username;
    }

    static async listJobs(username) {
        this._validateUsername(username);
        try {
            const output = execSync(`crontab -u ${username} -l 2>/dev/null`, { encoding: 'utf8', timeout: 5000 });
            return this.parseCrontab(output);
        } catch {
            return [];
        }
    }

    static parseCrontab(output) {
        const jobs = [];
        const lines = output.split('\n');
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;

            const match = trimmed.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)/);
            if (match) {
                jobs.push({
                    id: index,
                    schedule: match[1],
                    command: match[2],
                    raw: trimmed
                });
            }
        });
        return jobs;
    }

    static async addJob(username, schedule, command) {
        this._validateUsername(username);
        // Validate schedule format (5 fields, only safe chars)
        if (!/^[0-9*,\/\-]+\s+[0-9*,\/\-]+\s+[0-9*,\/\-]+\s+[0-9*,\/\-]+\s+[0-9*,\/\-]+$/.test(schedule)) {
            throw new Error('Invalid schedule format');
        }
        const current = await this.listJobs(username);
        const newLine = `${schedule} ${command}`;
        const lines = current.map(j => j.raw);
        lines.push(newLine);

        const crontab = lines.join('\n') + '\n';
        const tmpFile = `/tmp/crontab_${username}_${Date.now()}`;
        fs.writeFileSync(tmpFile, crontab);
        try {
            execSync(`crontab -u ${username} ${tmpFile}`, { encoding: 'utf8', timeout: 5000 });
        } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
        }
        return true;
    }

    static async removeJob(username, index) {
        this._validateUsername(username);
        const current = await this.listJobs(username);
        current.splice(index, 1);

        const lines = current.map(j => j.raw);
        const crontab = lines.length > 0 ? lines.join('\n') + '\n' : '';

        const tmpFile = `/tmp/crontab_${username}_${Date.now()}`;
        fs.writeFileSync(tmpFile, crontab);
        try {
            execSync(`crontab -u ${username} ${tmpFile}`, { encoding: 'utf8', timeout: 5000 });
        } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
        }
        return true;
    }

    static parseSchedule(schedule) {
        const parts = schedule.split(/\s+/);
        return {
            minute: parts[0] || '*',
            hour: parts[1] || '*',
            day: parts[2] || '*',
            month: parts[3] || '*',
            weekday: parts[4] || '*'
        };
    }

    static buildSchedule(fields) {
        return `${fields.minute} ${fields.hour} ${fields.day} ${fields.month} ${fields.weekday}`;
    }

    static getCommonSchedules() {
        return [
            { label: 'Every minute', value: '* * * * *' },
            { label: 'Every 5 minutes', value: '*/5 * * * *' },
            { label: 'Every 15 minutes', value: '*/15 * * * *' },
            { label: 'Every 30 minutes', value: '*/30 * * * *' },
            { label: 'Every hour', value: '0 * * * *' },
            { label: 'Every 2 hours', value: '0 */2 * * *' },
            { label: 'Every 6 hours', value: '0 */6 * * *' },
            { label: 'Every 12 hours', value: '0 */12 * * *' },
            { label: 'Daily at midnight', value: '0 0 * * *' },
            { label: 'Daily at 6 AM', value: '0 6 * * *' },
            { label: 'Weekly (Sunday)', value: '0 0 * * 0' },
            { label: 'Monthly (1st)', value: '0 0 1 * *' },
        ];
    }
}

module.exports = CronService;
