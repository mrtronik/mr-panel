const { execSync } = require('child_process');
const os = require('os');

class TerminalService {

    static getDefaultShell() {
        if (process.platform === 'win32') {
            return 'powershell.exe';
        }
        return process.env.SHELL || '/bin/bash';
    }

    static getCwd(user) {
        if (user && user.role !== 'admin' && user.username) {
            return `/home/${user.username}`;
        }
        return process.env.HOME || os.homedir() || '/root';
    }

    static getEnv(user) {
        const env = {
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            LANG: 'en_US.UTF-8',
            PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
        };
        if (user && user.role !== 'admin' && user.username) {
            env.USER = user.username;
            env.LOGNAME = user.username;
            env.HOME = `/home/${user.username}`;
        }
        return env;
    }

    static getSpawnCommand(user) {
        if (user && user.role !== 'admin' && user.username) {
            return { cmd: 'su', args: ['-', user.username, '-s', '/bin/bash'] };
        }
        return { cmd: this.getDefaultShell(), args: [] };
    }
}

module.exports = TerminalService;
