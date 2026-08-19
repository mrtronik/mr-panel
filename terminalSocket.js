const TerminalService = require('./services/TerminalService');

let pty = null;
try {
    pty = require('node-pty');
} catch (e) {
    console.warn('node-pty not available, terminal will not work');
}

function initTerminalSocket(io) {
    if (!pty) {
        console.warn('Terminal disabled: node-pty not installed');
        return;
    }

    io.on('connection', (socket) => {
        console.log('Terminal client connected');

        let term = null;
        let currentUser = null;

        socket.on('terminal:create', (data) => {
            if (term) {
                term.kill();
            }

            currentUser = data && data.user ? data.user : null;
            const shell = TerminalService.getDefaultShell();
            const cwd = TerminalService.getCwd(currentUser);
            const env = TerminalService.getEnv(currentUser);

            let spawnCmd, spawnArgs;
            if (currentUser && currentUser.role !== 'admin' && currentUser.username) {
                spawnCmd = 'su';
                spawnArgs = ['-', currentUser.username, '-s', '/bin/bash'];
            } else {
                spawnCmd = shell;
                spawnArgs = [];
            }

            term = pty.spawn(spawnCmd, spawnArgs, {
                name: 'xterm-256color',
                cols: 80,
                rows: 24,
                cwd: cwd,
                env: env
            });

            console.log('Terminal spawned:', spawnCmd, spawnArgs.join(' '), 'PID:', term.pid, 'User:', currentUser ? currentUser.username : 'root');

            term.onData((data) => {
                socket.emit('terminal:data', data);
            });

            term.onExit(({ exitCode }) => {
                console.log('Terminal exited:', exitCode);
                socket.emit('terminal:exit', { exitCode });
                term = null;
            });

            socket.emit('terminal:created', { pid: term.pid, shell: spawnCmd, user: currentUser ? currentUser.username : 'root' });
        });

        socket.on('terminal:data', (data) => {
            if (term) {
                term.write(data);
            }
        });

        socket.on('terminal:resize', ({ cols, rows }) => {
            if (term) {
                try {
                    term.resize(cols, rows);
                } catch (e) {}
            }
        });

        socket.on('terminal:kill', () => {
            if (term) {
                term.kill();
                term = null;
            }
        });

        socket.on('disconnect', () => {
            console.log('Terminal client disconnected');
            if (term) {
                term.kill();
                term = null;
            }
        });
    });
}

module.exports = { initTerminalSocket };
