const DatabaseService = require('../services/DatabaseService');
const ActivityLogService = require('../services/ActivityLogService');

exports.getPage = async (req, res) => {
    try {
        const user = req.session.user;
        const databases = await DatabaseService.listDatabases(user);
        const users = user.role === 'admin' ? await DatabaseService.listUsers() : [];
        res.render('databases/index', { title: 'Database Manager', databases, users });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.listDatabases = async (req, res) => {
    try {
        const user = req.session.user;
        const databases = await DatabaseService.listDatabases(user);
        res.json({ databases });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.listTables = async (req, res) => {
    try {
        const { database } = req.query;
        if (!database) return res.status(400).json({ error: 'Database required' });
        const tables = await DatabaseService.listTables(database);
        res.json({ tables });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getTableInfo = async (req, res) => {
    try {
        const { database, table } = req.query;
        if (!database || !table) return res.status(400).json({ error: 'Database and table required' });
        const info = await DatabaseService.getTableInfo(database, table);
        res.json(info);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createDatabase = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const user = req.session.user;
        await DatabaseService.createDatabase(name, user.id);
        await ActivityLogService.log(user.id, 'create', 'database', null, { db_name: name }, req.ip);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.deleteDatabase = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const user = req.session.user;
        const allowed = await DatabaseService.canAccess(name, user);
        if (!allowed) return res.status(403).json({ error: 'Akses ditolak' });
        await DatabaseService.deleteDatabase(name);
        await ActivityLogService.log(user.id, 'delete', 'database', null, { db_name: name }, req.ip);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { username, password, host } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
        await DatabaseService.createUser(username, password, host);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { username, host } = req.body;
        if (!username) return res.status(400).json({ error: 'Username required' });
        await DatabaseService.deleteUser(username, host);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.grantPrivileges = async (req, res) => {
    try {
        const { username, database, host } = req.body;
        if (!username || !database) return res.status(400).json({ error: 'Username and database required' });
        await DatabaseService.grantPrivileges(username, database, host);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.revokePrivileges = async (req, res) => {
    try {
        const { username, database, host } = req.body;
        if (!username || !database) return res.status(400).json({ error: 'Username and database required' });
        await DatabaseService.revokePrivileges(username, database, host);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
