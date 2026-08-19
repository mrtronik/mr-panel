const SystemService = require('../services/SystemService');

exports.index = async (req, res) => {

    const services = [

        {
            name: 'OpenLiteSpeed',
            service: 'lsws'
        },

        {
            name: 'MariaDB',
            service: 'mariadb'
        },

        {
            name: 'Redis',
            service: 'redis-server'
        }

    ];

    for (const item of services) {

        const result = await SystemService.status(item.service);

        item.status = result.status;

    }

    res.render('server/services', {
		title : 'Services',
        services
    });

};