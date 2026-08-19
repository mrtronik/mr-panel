const PhpMyAdminService = require('../services/PhpMyAdminService');
const { execSync } = require('child_process');

const PMA_DIR = '/home/public_html/phpmyadmin';

exports.getPage = async (req, res) => {
    try {
        const installed = PhpMyAdminService.isInstalled(PMA_DIR);
        const version = installed ? PhpMyAdminService.getVersion(PMA_DIR) : null;

        res.render('phpmyadmin/index', {
            title: 'phpMyAdmin',
            installed,
            version,
            pmaUrl: 'http://' + req.hostname + ':8080/phpmyadmin/'
        });
    } catch (err) {
        res.render('phpmyadmin/index', {
            title: 'phpMyAdmin',
            installed: false,
            version: null,
            pmaUrl: ''
        });
    }
};

exports.install = async (req, res) => {
    try {
        const result = await PhpMyAdminService.installPhpMyAdmin(PMA_DIR);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const result = PhpMyAdminService.removePhpMyAdmin(PMA_DIR);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
