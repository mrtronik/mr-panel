const os = require('os');
const SystemInfoService = require('../services/SystemInfoService');

const pages = {
    websites: { title: 'Website', icon: 'ri-global-line', breadcrumb: 'Account Manager > Websites' },
    users: { title: 'User Management', icon: 'ri-user-line', breadcrumb: 'Account Manager > Users' },
    databases: { title: 'Database Management', icon: 'ri-database-2-line', breadcrumb: 'Account Manager > Databases' },
    dns: { title: 'DNS Manager', icon: 'ri-earth-line', breadcrumb: 'Account Manager > DNS Manager' },
    ssl: { title: 'SSL Certificates', icon: 'ri-lock-line', breadcrumb: 'Account Manager > SSL Certificates' },
    emailAccounts: { title: 'Email Accounts', icon: 'ri-mail-line', breadcrumb: 'Account Manager > Email Accounts' },
    fileManager: { title: 'File Manager', icon: 'ri-folder-4-line', breadcrumb: 'System Info & File > File Manager' },
    phpSettings: { title: 'PHP Settings', icon: 'ri-code-s-slash-line', breadcrumb: 'System Info & File > PHP Settings' },
    webmail: { title: 'Webmail', icon: 'ri-mail-open-line', breadcrumb: 'Extra Feature > Webmail' },
    phpmyadmin: { title: 'phpMyAdmin', icon: 'ri-database-line', breadcrumb: 'Extra Feature > phpMyAdmin' },
    installerWordpress: { title: 'Install Wordpress', icon: 'ri-wordpress-fill', breadcrumb: 'MR Apps Installer > Wordpress' },
    installerLaravel: { title: 'Install Laravel', icon: 'ri-code-line', breadcrumb: 'MR Apps Installer > Laravel' },
    installerPhpbb: { title: 'Install phpBB', icon: 'ri-discuss-line', breadcrumb: 'MR Apps Installer > phpBB' },
    installerJoomla: { title: 'Install Joomla', icon: 'ri-layout-line', breadcrumb: 'MR Apps Installer > Joomla' },
    settingsServer: { title: 'Server Manager', icon: 'ri-server-line', breadcrumb: 'Settings > Server Manager' },
    settingsPhp: { title: 'PHP Manager', icon: 'ri-code-s-slash-line', breadcrumb: 'Settings > PHP Manager' },
};

function render(pageKey) {
    return (req, res) => {
        const page = pages[pageKey];
        res.render('pages/placeholder', {
            title: page.title,
            icon: page.icon,
            breadcrumb: page.breadcrumb
        });
    };
}

exports.websites = render('websites');
exports.users = render('users');
exports.databases = render('databases');
exports.dns = render('dns');
exports.ssl = render('ssl');
exports.emailAccounts = render('emailAccounts');
exports.fileManager = render('fileManager');
exports.phpSettings = render('phpSettings');
exports.webmail = render('webmail');
exports.phpmyadmin = render('phpmyadmin');
exports.installerWordpress = render('installerWordpress');
exports.installerLaravel = render('installerLaravel');
exports.installerPhpbb = render('installerPhpbb');
exports.installerJoomla = render('installerJoomla');
exports.settingsServer = render('settingsServer');
exports.settingsPhp = render('settingsPhp');

exports.systemInfo = (req, res) => {
    try {
        const data = SystemInfoService.getAll();
        res.render('pages/system-info', {
            title: 'System Information',
            system: data.system,
            cpu: data.cpu,
            fileSystem: data.fileSystem,
            diskUsage: data.diskUsage,
            memory: data.memory,
            services: data.services,
            loadAverage: data.loadAverage
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.terminal = (req, res) => {
    res.render('pages/terminal', { title: 'Web Terminal', user: req.session.user });
};
