const { execFile } = require('child_process');

const SERVICES = [
    'lsws',
    'mariadb',
    'redis-server',
    'docker',
    'sshd'
];

class ServiceManager {

    static status(service) {

        return new Promise((resolve) => {

            if (!SERVICES.includes(service)) {

                return resolve({
                    status: 'unknown'
                });

            }

            execFile(

                'systemctl',

                ['is-active', service],

                (err, stdout) => {

                    resolve({

                        status: stdout.trim()

                    });

                }

            );

        });

    }

}

module.exports = ServiceManager;