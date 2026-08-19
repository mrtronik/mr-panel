const { execFile } = require('child_process');

const ALLOWED_SERVICES = [
    'lsws',
    'mariadb',
    'redis-server',
    'docker',
    'ssh',
    'cron'
];

class SystemService {

    static status(service) {

        return new Promise((resolve) => {

            if (!ALLOWED_SERVICES.includes(service)) {
                return resolve({
                    success: false,
                    status: 'unknown'
                });
            }

            execFile(
                'systemctl',
                ['is-active', service],
                (err, stdout) => {

                    resolve({
                        success: true,
                        status: stdout.trim()
                    });

                }
            );

        });

    }

}

module.exports = SystemService;