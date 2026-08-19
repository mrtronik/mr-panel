const DatabaseManagerService = require('../services/DatabaseManagerService');
const ActivityLogService = require('../services/ActivityLogService');

exports.databases = async (req, res) => {
    try {
        const user = req.session.user;
        const databases = await DatabaseManagerService.listDatabases(user);
        let users = [];
        if (user.role === 'admin') {
            users = await DatabaseManagerService.listUsers();
        }
        res.render('db-manager/databases', { title: 'Database Manager', databases, users });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.tables = async (req, res) => {
    try {
        const user = req.session.user;
        const dbName = req.params.db;
        if (!await DatabaseManagerService.canAccess(dbName, user)) return res.status(403).send('Access denied');

        const tables = await DatabaseManagerService.listTables(dbName);
        res.render('db-manager/tables', { title: dbName, dbName, tables, currentTable: null });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.structure = async (req, res) => {
    try {
        const user = req.session.user;
        const { db, table } = req.params;
        if (!await DatabaseManagerService.canAccess(db, user)) return res.status(403).send('Access denied');

        const [tables, structure] = await Promise.all([
            DatabaseManagerService.listTables(db),
            DatabaseManagerService.tableStructure(db, table)
        ]);
        res.render('db-manager/structure', { title: table + ' - Structure', dbName: db, tableName: table, currentTable: table, tables, columns: structure.columns, indexes: structure.indexes, status: structure.status });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.browse = async (req, res) => {
    try {
        const user = req.session.user;
        const { db, table } = req.params;
        const page = parseInt(req.query.page) || 1;
        const search = req.query.search || '';
        const currentSort = req.query.sort || '';
        const currentDir = req.query.dir === 'DESC' ? 'DESC' : 'ASC';
        if (!await DatabaseManagerService.canAccess(db, user)) return res.status(403).send('Access denied');

        const [tables, data] = await Promise.all([
            DatabaseManagerService.listTables(db),
            DatabaseManagerService.browseTable(db, table, page, 25, search)
        ]);
        res.render('db-manager/browse', { title: table + ' - Browse', dbName: db, tableName: table, currentTable: table, tables, data: data.data, columns: data.columns, total: data.total, page: data.page, totalPages: data.totalPages, search, currentSort, currentDir });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.sql = async (req, res) => {
    try {
        const user = req.session.user;
        const dbName = req.params.db;
        if (!await DatabaseManagerService.canAccess(dbName, user)) return res.status(403).send('Access denied');

        const tables = await DatabaseManagerService.listTables(dbName);
        const currentTable = req.query.table || (tables.length > 0 ? tables[0] : null);

        if (req.method === 'POST') {
            const sql = req.body.sql || '';
            const start = Date.now();
            try {
                const results = await DatabaseManagerService.executeQuery(dbName, sql);
                const elapsed = Date.now() - start;
                await ActivityLogService.log(user.id, 'query', 'database', null, { db: dbName, sql: sql.substring(0, 200) }, req.ip);
                res.render('db-manager/sql', { title: 'SQL Editor', dbName, tables, currentTable, query: sql, results, elapsed: elapsed, error: null });
            } catch (err) {
                const elapsed = Date.now() - start;
                res.render('db-manager/sql', { title: 'SQL Editor', dbName, tables, currentTable, query: sql, results: null, elapsed: elapsed, error: err.message });
            }
        } else {
            res.render('db-manager/sql', { title: 'SQL Editor', dbName, tables, currentTable, query: '', results: null, elapsed: null, error: null });
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.runQuery = async (req, res) => {
    try {
        const user = req.session.user;
        const { db, sql } = req.body;
        if (!await DatabaseManagerService.canAccess(db, user)) return res.status(403).json({ error: 'Access denied' });

        const result = await DatabaseManagerService.executeQuery(db, sql);
        await ActivityLogService.log(user.id, 'query', 'database', null, { db, sql: sql.substring(0, 200) }, req.ip);
        res.json({ success: true, result });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.insertRow = async (req, res) => {
    try {
        const user = req.session.user;
        const db = req.params.db;
        const table = req.params.table;
        const { data } = req.body;
        if (!await DatabaseManagerService.canAccess(db, user)) return res.status(403).json({ error: 'Access denied' });

        const result = await DatabaseManagerService.insertRow(db, table, data);
        await ActivityLogService.log(user.id, 'insert', 'database', null, { db, table }, req.ip);
        res.json({ success: true, insertId: result.insertId });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.updateRow = async (req, res) => {
    try {
        const user = req.session.user;
        const db = req.params.db;
        const table = req.params.table;
        const { original, data } = req.body;
        if (!await DatabaseManagerService.canAccess(db, user)) return res.status(403).json({ error: 'Access denied' });

        const result = await DatabaseManagerService.updateRow(db, table, data, null, null, original);
        await ActivityLogService.log(user.id, 'update', 'database', null, { db, table }, req.ip);
        res.json({ success: true, affectedRows: result.affectedRows });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.deleteRow = async (req, res) => {
    try {
        const user = req.session.user;
        const db = req.params.db;
        const table = req.params.table;
        const { data } = req.body;
        if (!await DatabaseManagerService.canAccess(db, user)) return res.status(403).json({ error: 'Access denied' });

        const result = await DatabaseManagerService.deleteRow(db, table, null, null, data);
        await ActivityLogService.log(user.id, 'delete', 'database', null, { db, table }, req.ip);
        res.json({ success: true, affectedRows: result.affectedRows });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.createDatabase = async (req, res) => {
    try {
        const user = req.session.user;
        const { dbName } = req.body;
        const safeName = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        if (!safeName) return res.json({ success: false, error: 'Invalid database name' });

        if (user.role !== 'admin') {
            const prefix = user.username + '_';
            if (!safeName.startsWith(prefix)) return res.json({ success: false, error: 'Database name must start with ' + prefix });
        }

        const created = await DatabaseManagerService.createDatabase(safeName, user);
        await ActivityLogService.log(user.id, 'create', 'database', null, { db: created }, req.ip);
        res.json({ success: true, dbName: created });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.dropDatabase = async (req, res) => {
    try {
        const user = req.session.user;
        const { dbName } = req.body;
        await DatabaseManagerService.dropDatabase(dbName, user);
        await ActivityLogService.log(user.id, 'drop', 'database', null, { db: dbName }, req.ip);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.createTable = async (req, res) => {
    try {
        const user = req.session.user;
        const { db, tableName, columns } = req.body;
        if (!await DatabaseManagerService.canAccess(db, user)) return res.status(403).json({ error: 'Access denied' });

        await DatabaseManagerService.createTable(db, tableName, columns);
        await ActivityLogService.log(user.id, 'create', 'table', null, { db, table: tableName }, req.ip);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.dropTable = async (req, res) => {
    try {
        const user = req.session.user;
        const { db, table } = req.body;
        if (!await DatabaseManagerService.canAccess(db, user)) return res.status(403).json({ error: 'Access denied' });

        await DatabaseManagerService.dropTable(db, table);
        await ActivityLogService.log(user.id, 'drop', 'table', null, { db, table }, req.ip);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.emptyTable = async (req, res) => {
    try {
        const user = req.session.user;
        const { db, table } = req.body;
        if (!await DatabaseManagerService.canAccess(db, user)) return res.status(403).json({ error: 'Access denied' });

        await DatabaseManagerService.emptyTable(db, table);
        await ActivityLogService.log(user.id, 'truncate', 'table', null, { db, table }, req.ip);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.exportDb = async (req, res) => {
    try {
        const user = req.session.user;
        const dbName = req.params.db;
        if (!await DatabaseManagerService.canAccess(dbName, user)) return res.status(403).send('Access denied');

        const sql = await DatabaseManagerService.exportDatabase(dbName);
        res.setHeader('Content-Type', 'text/sql');
        res.setHeader('Content-Disposition', 'attachment; filename="' + dbName + '.sql"');
        res.send(sql);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.exportTable = async (req, res) => {
    try {
        const user = req.session.user;
        const { db, table } = req.params;
        if (!await DatabaseManagerService.canAccess(db, user)) return res.status(403).send('Access denied');

        const sql = await DatabaseManagerService.exportTable(db, table);
        res.setHeader('Content-Type', 'text/sql');
        res.setHeader('Content-Disposition', 'attachment; filename="' + table + '.sql"');
        res.send(sql);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.importSql = async (req, res) => {
    try {
        const user = req.session.user;
        const { db } = req.body;
        if (!await DatabaseManagerService.canAccess(db, user)) return res.status(403).json({ error: 'Access denied' });
        if (!req.file) return res.json({ success: false, error: 'No file uploaded' });

        const sqlContent = req.file.buffer.toString('utf8');
        const result = await DatabaseManagerService.importSQL(db, sqlContent);
        await ActivityLogService.log(user.id, 'import', 'database', null, { db, executed: result.executed }, req.ip);
        res.json({ success: true, ...result });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.listUsers = async (req, res) => {
    try {
        const users = await DatabaseManagerService.listUsers();
        res.json({ success: true, users });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { username, password, host } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
        await DatabaseManagerService.createUser(username, password, host);
        await ActivityLogService.log(req.session.user.id, 'create', 'mysql_user', null, { user: username }, req.ip);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { username, host } = req.body;
        await DatabaseManagerService.deleteUser(username, host);
        await ActivityLogService.log(req.session.user.id, 'delete', 'mysql_user', null, { user: username }, req.ip);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { username, host, password } = req.body;
        if (!password) return res.status(400).json({ error: 'Password required' });
        await DatabaseManagerService.changePassword(username, host, password);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.grantPrivileges = async (req, res) => {
    try {
        const { username, database, host } = req.body;
        await DatabaseManagerService.grantPrivileges(username, database, host);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.revokePrivileges = async (req, res) => {
    try {
        const { username, database, host } = req.body;
        await DatabaseManagerService.revokePrivileges(username, database, host);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.getUserGrants = async (req, res) => {
    try {
        const { username, host } = req.query;
        const grants = await DatabaseManagerService.getUserGrants(username, host);
        res.json({ success: true, grants });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};
