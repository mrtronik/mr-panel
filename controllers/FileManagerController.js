const FileManagerService = require('../services/FileManagerService');

function getUserBaseDir(user) {
    if (!user) return '/';
    if (user.role === 'admin') return '/';
    return `/home/${user.username}`;
}

exports.list = async (req, res) => {
    try {
        const user = req.session.user;
        const baseDir = getUserBaseDir(user);
        let dirPath = req.query.path || baseDir;

        if (user.role !== 'admin') {
            const resolved = require('path').resolve(dirPath);
            if (!resolved.startsWith(baseDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await FileManagerService.list(dirPath);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.readFile = async (req, res) => {
    try {
        const user = req.session.user;
        const baseDir = getUserBaseDir(user);
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'Path required' });

        if (user.role !== 'admin') {
            const resolved = require('path').resolve(filePath);
            if (!resolved.startsWith(baseDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await FileManagerService.readFile(filePath);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.writeFile = async (req, res) => {
    try {
        const user = req.session.user;
        const baseDir = getUserBaseDir(user);
        const { path: filePath, content } = req.body;
        if (!filePath) return res.status(400).json({ error: 'Path required' });

        if (user.role !== 'admin') {
            const resolved = require('path').resolve(filePath);
            if (!resolved.startsWith(baseDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await FileManagerService.writeFile(filePath, content || '');
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.createDir = async (req, res) => {
    try {
        const user = req.session.user;
        const baseDir = getUserBaseDir(user);
        const { path: dirPath } = req.body;
        if (!dirPath) return res.status(400).json({ error: 'Path required' });

        if (user.role !== 'admin') {
            const resolved = require('path').resolve(dirPath);
            if (!resolved.startsWith(baseDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await FileManagerService.createDir(dirPath);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.createFile = async (req, res) => {
    try {
        const user = req.session.user;
        const baseDir = getUserBaseDir(user);
        const { path: filePath } = req.body;
        if (!filePath) return res.status(400).json({ error: 'Path required' });

        if (user.role !== 'admin') {
            const resolved = require('path').resolve(filePath);
            if (!resolved.startsWith(baseDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await FileManagerService.createFile(filePath);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.rename = async (req, res) => {
    try {
        const user = req.session.user;
        const baseDir = getUserBaseDir(user);
        const { oldPath, newPath } = req.body;
        if (!oldPath || !newPath) return res.status(400).json({ error: 'Both paths required' });

        if (user.role !== 'admin') {
            const resolvedOld = require('path').resolve(oldPath);
            const resolvedNew = require('path').resolve(newPath);
            if (!resolvedOld.startsWith(baseDir) || !resolvedNew.startsWith(baseDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await FileManagerService.rename(oldPath, newPath);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const user = req.session.user;
        const baseDir = getUserBaseDir(user);
        const { path: targetPath } = req.body;
        if (!targetPath) return res.status(400).json({ error: 'Path required' });

        if (user.role !== 'admin') {
            const resolved = require('path').resolve(targetPath);
            if (!resolved.startsWith(baseDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await FileManagerService.delete(targetPath);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.move = async (req, res) => {
    try {
        const user = req.session.user;
        const baseDir = getUserBaseDir(user);
        const { source, dest } = req.body;
        if (!source || !dest) return res.status(400).json({ error: 'Source and destination required' });

        if (user.role !== 'admin') {
            const resolvedSource = require('path').resolve(source);
            const resolvedDest = require('path').resolve(dest);
            if (!resolvedSource.startsWith(baseDir) || !resolvedDest.startsWith(baseDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await FileManagerService.move(source, dest);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getInfo = async (req, res) => {
    try {
        const user = req.session.user;
        const baseDir = getUserBaseDir(user);
        const targetPath = req.query.path;
        if (!targetPath) return res.status(400).json({ error: 'Path required' });

        if (user.role !== 'admin') {
            const resolved = require('path').resolve(targetPath);
            if (!resolved.startsWith(baseDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await FileManagerService.getInfo(targetPath);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getPage = (req, res) => {
    const user = req.session.user;
    const baseDir = getUserBaseDir(user);
    res.render('pages/file-manager', { title: 'File Manager', baseDir });
};

exports.upload = async (req, res) => {
    try {
        const user = req.session.user;
        const baseDir = getUserBaseDir(user);
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const dirPath = req.body.dir || baseDir;

        if (user.role !== 'admin') {
            const resolved = require('path').resolve(dirPath);
            if (!resolved.startsWith(baseDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await FileManagerService.upload(dirPath, req.file);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.extract = async (req, res) => {
    try {
        const user = req.session.user;
        const baseDir = getUserBaseDir(user);
        const { path: filePath } = req.body;
        if (!filePath) return res.status(400).json({ error: 'Path required' });

        if (user.role !== 'admin') {
            const resolved = require('path').resolve(filePath);
            if (!resolved.startsWith(baseDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await FileManagerService.extract(filePath);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
