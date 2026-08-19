const UserService = require('../services/UserService');
const ActivityLogService = require('../services/ActivityLogService');
const fs = require('fs').promises;

exports.listUsers = async (req, res) => {
    try {
        const user = req.session.user;
        const users = await UserService.listAll(user);
        res.render('users/index', { title: 'User Management', users, formatSize: UserService.formatSize });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.addForm = async (req, res) => {
    try {
        const user = req.session.user;
        const packages = await UserService.listPackages(user);
        res.render('users/add', { title: 'Add User', packages, formatSize: UserService.formatSize, error: null });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.create = async (req, res) => {
    try {
        const { name, username, email, password, role, package_id, status } = req.body;
        const user = req.session.user;

        const existing = await UserService.findByUsername(username);
        if (existing) {
            const packages = await UserService.listPackages(user);
            return res.render('users/add', { title: 'Add User', packages, error: 'Username already exists' });
        }

        const existingEmail = await UserService.findByEmail(email);
        if (existingEmail) {
            const packages = await UserService.listPackages(user);
            return res.render('users/add', { title: 'Add User', packages, error: 'Email already exists' });
        }

        const userId = await UserService.create({
            name, username, email, password, role, package_id, status,
            owner_id: user.role === 'reseller' ? user.id : null
        });

        const homeDir = `/home/${username}`;
        try {
            await fs.mkdir(homeDir, { recursive: true });
            await fs.mkdir(`${homeDir}/public_html`, { recursive: true });
        } catch {}

        await ActivityLogService.log(user.id, 'create', 'user', userId, { username, email, role }, req.ip);

        res.redirect('/users');
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.editForm = async (req, res) => {
    try {
        const user = await UserService.findById(req.params.id);
        if (!user) return res.redirect('/users');
        const packages = await UserService.listPackages(req.session.user);
        res.render('users/edit', { title: 'Edit User', user, packages, formatSize: UserService.formatSize, error: null });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.update = async (req, res) => {
    try {
        const { name, username, email, password, role, package_id, status } = req.body;
        const updateData = { name, username, email, role, package_id: package_id || null, status: status || 'active' };
        if (password) updateData.password = password;

        await UserService.update(req.params.id, updateData);
        res.redirect('/users');
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.suspend = async (req, res) => {
    try {
        await UserService.update(req.params.id, { status: 'suspended' });
        res.redirect('/users?suspended=1');
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.activate = async (req, res) => {
    try {
        await UserService.update(req.params.id, { status: 'active' });
        res.redirect('/users?activated=1');
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.delete = async (req, res) => {
    try {
        const user = await UserService.findById(req.params.id);
        if (user && user.role === 'admin') {
            return res.redirect('/users');
        }
        await UserService.delete(req.params.id);
        res.redirect('/users?deleted=1');
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.packages = async (req, res) => {
    try {
        const user = req.session.user;
        const packages = await UserService.listPackages(user);
        res.render('users/packages', { title: 'Packages', packages, formatSize: UserService.formatSize, error: null });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.createPackage = async (req, res) => {
    try {
        const { name, disk_limit, bandwidth_limit, max_domains, max_email, max_database, price } = req.body;
        const user = req.session.user;
        await UserService.createPackage({
            name,
            disk_limit: parseInt(disk_limit) * 1073741824,
            bandwidth_limit: parseInt(bandwidth_limit) * 1073741824,
            max_domains: parseInt(max_domains),
            max_email: parseInt(max_email),
            max_database: parseInt(max_database),
            price: parseFloat(price),
            owner_id: user.role === 'reseller' ? user.id : null
        });
        await ActivityLogService.log(user.id, 'create', 'package', null, { name }, req.ip);
        res.redirect('/packages');
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.deletePackage = async (req, res) => {
    try {
        await UserService.deletePackage(req.params.id);
        await ActivityLogService.log(req.session.user.id, 'delete', 'package', req.params.id, null, req.ip);
        res.redirect('/packages');
    } catch (err) {
        const packages = await UserService.listPackages(req.session.user);
        res.render('users/packages', { title: 'Packages', packages, formatSize: UserService.formatSize, error: err.message });
    }
};
