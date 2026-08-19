const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class FileManagerService {

    static BASE_DIR = '/';
    static ALLOWED_DIRS = ['/home'];

    static sanitizePath(targetPath) {
        if (!targetPath) return this.BASE_DIR;
        const resolved = path.resolve(this.BASE_DIR, targetPath);
        if (!resolved.startsWith(this.BASE_DIR)) {
            throw new Error('Access denied: path outside base directory');
        }
        return resolved;
    }

    static isAllowedDir(dirPath) {
        return this.ALLOWED_DIRS.some(function(allowed) {
            return dirPath === allowed || dirPath.startsWith(allowed + '/');
        });
    }

    static async list(dirPath) {
        const resolved = this.sanitizePath(dirPath);

        if (resolved === '/' && dirPath !== '/') {
            return {
                currentDir: '/',
                parentDir: '/',
                items: this.ALLOWED_DIRS.map(function(d) {
                    return { name: d.substring(1), path: d, isDirectory: true, isFile: false, size: 0, modified: null, permissions: 'drwxr-xr-x' };
                })
            };
        }

        const entries = await fs.readdir(resolved, { withFileTypes: true });
        
        const items = [];
        for (const entry of entries) {
            const fullPath = path.join(resolved, entry.name);

            if (resolved === '/' && !this.isAllowedDir(fullPath)) {
                continue;
            }

            const item = {
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                isFile: entry.isFile(),
                isSymlink: entry.isSymbolicLink(),
                isEditable: entry.isFile() ? this.isEditable(entry.name) : false,
                isArchive: entry.isFile() ? this.isArchive(entry.name) : false
            };

            try {
                const stats = await fs.stat(fullPath);
                item.size = stats.size;
                item.modified = stats.mtime;
                item.created = stats.birthtime;
                item.permissions = this.formatPermissions(stats.mode);
                item.owner = stats.uid;
                item.group = stats.gid;
            } catch (e) {
                item.size = 0;
                item.modified = null;
                item.permissions = '---------';
            }

            items.push(item);
        }

        items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        return {
            currentDir: resolved,
            parentDir: path.dirname(resolved),
            items: items
        };
    }

    static async readFile(filePath) {
        const resolved = this.sanitizePath(filePath);
        const content = await fs.readFile(resolved, 'utf8');
        const stats = await fs.stat(resolved);
        return {
            path: resolved,
            content: content,
            size: stats.size,
            modified: stats.mtime
        };
    }

    static async writeFile(filePath, content) {
        const resolved = this.sanitizePath(filePath);
        await fs.writeFile(resolved, content, 'utf8');
        return { success: true, path: resolved };
    }

    static async createDir(dirPath) {
        const resolved = this.sanitizePath(dirPath);
        await fs.mkdir(resolved, { recursive: true });
        return { success: true, path: resolved };
    }

    static async createFile(filePath) {
        const resolved = this.sanitizePath(filePath);
        await fs.writeFile(resolved, '', 'utf8');
        return { success: true, path: resolved };
    }

    static async rename(oldPath, newPath) {
        const resolvedOld = this.sanitizePath(oldPath);
        const resolvedNew = this.sanitizePath(newPath);
        await fs.rename(resolvedOld, resolvedNew);
        return { success: true, from: resolvedOld, to: resolvedNew };
    }

    static async move(sourcePath, destDir) {
        const resolvedSource = this.sanitizePath(sourcePath);
        const resolvedDest = this.sanitizePath(destDir);
        const fileName = path.basename(resolvedSource);
        const destPath = path.join(resolvedDest, fileName);
        this.sanitizePath(destPath);
        await fs.rename(resolvedSource, destPath);
        return { success: true, from: resolvedSource, to: destPath };
    }

    static async delete(targetPath) {
        const resolved = this.sanitizePath(targetPath);
        const stats = await fs.stat(resolved);
        
        if (stats.isDirectory()) {
            await fs.rm(resolved, { recursive: true, force: true });
        } else {
            await fs.unlink(resolved);
        }
        
        return { success: true, path: resolved };
    }

    static async getInfo(targetPath) {
        const resolved = this.sanitizePath(targetPath);
        const stats = await fs.stat(resolved);
        return {
            path: resolved,
            name: path.basename(resolved),
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            size: stats.size,
            modified: stats.mtime,
            created: stats.birthtime,
            permissions: this.formatPermissions(stats.mode),
            owner: stats.uid,
            group: stats.gid
        };
    }

    static formatPermissions(mode) {
        const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
        const type = (mode >> 12) & 0o17;
        let prefix = '-';
        if (type === 0o04) prefix = 'd';
        if (type === 0o12) prefix = 'l';

        const owner = perms[(mode >> 6) & 0o7];
        const group = perms[(mode >> 3) & 0o7];
        const other = perms[mode & 0o7];

        return prefix + owner + group + other;
    }

    static formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static getFileIcon(name, isDirectory) {
        if (isDirectory) return 'ri-folder-2-fill text-warning';
        
        const ext = path.extname(name).toLowerCase();
        const icons = {
            '.js': 'ri-file-code-fill text-warning',
            '.ts': 'ri-file-code-fill text-info',
            '.py': 'ri-file-code-fill text-success',
            '.php': 'ri-file-code-fill text-primary',
            '.html': 'ri-html5-fill text-danger',
            '.css': 'ri-css3-fill text-info',
            '.json': 'ri-braces-fill text-warning',
            '.xml': 'ri-code-fill text-muted',
            '.md': 'ri-markdown-fill text-muted',
            '.txt': 'ri-file-text-fill text-muted',
            '.jpg': 'ri-image-fill text-success',
            '.jpeg': 'ri-image-fill text-success',
            '.png': 'ri-image-fill text-info',
            '.gif': 'ri-image-fill text-primary',
            '.svg': 'ri-image-fill text-purple',
            '.pdf': 'ri-file-pdf-fill text-danger',
            '.zip': 'ri-file-zip-fill text-warning',
            '.tar': 'ri-file-zip-fill text-warning',
            '.gz': 'ri-file-zip-fill text-warning',
            '.rar': 'ri-file-zip-fill text-warning',
            '.sql': 'ri-database-2-fill text-info',
            '.sh': 'ri-terminal-fill text-success',
            '.conf': 'ri-settings-3-fill text-muted',
            '.log': 'ri-file-list-3-fill text-muted'
        };
        return icons[ext] || 'ri-file-fill text-muted';
    }

    static EDITABLE_EXTS = [
        '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.less',
        '.html', '.htm', '.xml', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
        '.php', '.py', '.rb', '.go', '.java', '.c', '.cpp', '.h', '.cs', '.rs',
        '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
        '.sql', '.env', '.gitignore', '.dockerignore', '.editorconfig',
        '.htaccess', '.nginxconf', '.csv', '.log', '.vue', '.svelte'
    ];

    static ARCHIVE_EXTS = ['.zip', '.tar', '.gz', '.tgz', '.tar.gz', '.rar', '.7z', '.bz2', '.xz'];

    static isEditable(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const base = path.basename(filePath);
        if (this.EDITABLE_EXTS.includes(ext)) return true;
        const noExtFiles = ['.env', '.gitignore', '.dockerignore', '.editorconfig', '.htaccess', 'Makefile', 'Dockerfile', 'Procfile'];
        if (noExtFiles.includes(base)) return true;
        return false;
    }

    static isArchive(filePath) {
        const name = path.basename(filePath).toLowerCase();
        if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) return true;
        const ext = path.extname(filePath).toLowerCase();
        return this.ARCHIVE_EXTS.includes(ext);
    }

    static async upload(dirPath, file) {
        const resolved = this.sanitizePath(dirPath);
        const fileName = path.basename(file.originalname);
        const destPath = path.join(resolved, fileName);
        this.sanitizePath(destPath);
        await fs.copyFile(file.path, destPath);
        await fs.unlink(file.path).catch(() => {});
        return { success: true, path: destPath, name: fileName, size: file.size };
    }

    static async extract(filePath) {
        const resolved = this.sanitizePath(filePath);
        const dir = path.dirname(resolved);
        const base = path.basename(resolved).toLowerCase();
        let cmd = '';

        if (base.endsWith('.tar.gz') || base.endsWith('.tgz')) {
            cmd = `tar -xzf "${resolved}" -C "${dir}"`;
        } else if (base.endsWith('.tar')) {
            cmd = `tar -xf "${resolved}" -C "${dir}"`;
        } else if (base.endsWith('.gz')) {
            cmd = `gunzip -k "${resolved}"`;
        } else if (base.endsWith('.zip')) {
            cmd = `unzip -o "${resolved}" -d "${dir}"`;
        } else if (base.endsWith('.rar')) {
            cmd = `unrar x -o+ "${resolved}" "${dir}/"`;
        } else if (base.endsWith('.7z')) {
            cmd = `7z x -o"${dir}" "${resolved}" -y`;
        } else if (base.endsWith('.bz2')) {
            cmd = `bunzip2 -k "${resolved}"`;
        } else if (base.endsWith('.xz')) {
            cmd = `unxz -k "${resolved}"`;
        } else {
            throw new Error('Unsupported archive format');
        }

        try {
            const { stdout, stderr } = await execAsync(cmd, { timeout: 60000 });
            return { success: true, path: resolved, message: 'Extracted successfully' };
        } catch (err) {
            throw new Error('Extract failed: ' + err.message);
        }
    }
}

module.exports = FileManagerService;
