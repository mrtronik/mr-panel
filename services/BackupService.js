const db = require('../config/db');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = '/home/backups';

class BackupService {

    static async listBackups(user) {
        let sql = 'SELECT * FROM backups ORDER BY created_at DESC';
        let params = [];
        if (user && user.role !== 'admin') {
            sql = 'SELECT * FROM backups WHERE user_id = ? ORDER BY created_at DESC';
            params = [user.id];
        }
        const [rows] = await db.execute(sql, params);
        return rows;
    }

    static async createBackup(domain, type, userId) {
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = `${domain}_${type}_${timestamp}.tar.gz`;
        const filepath = path.join(BACKUP_DIR, filename);
        const docRoot = `/home/public_html/${domain}`;

        const [result] = await db.execute(
            'INSERT INTO backups (domain, type, file_path, file_size, status, user_id) VALUES (?, ?, ?, 0, ?, ?)',
            [domain, type, filepath, 'running', userId]
        );
        const backupId = result.insertId;

        try {
            const tmpDir = `/tmp/backup-${Date.now()}`;
            fs.mkdirSync(tmpDir, { recursive: true });

            // Backup files
            if (type === 'full' || type === 'files') {
                if (fs.existsSync(docRoot)) {
                    await execAsync(`tar czf "${tmpDir}/files.tar.gz" -C /home/public_html "${domain}" 2>&1`, { timeout: 300000 });
                }
            }

            // Backup database
            if (type === 'full' || type === 'database') {
                const dbName = domain.replace(/\./g, '_').replace(/-/g, '_');
                try {
                    const dbPass = process.env.DB_PASSWORD || '';
                    const passArg = dbPass ? `-p'${dbPass.replace(/'/g, "'\\''")}'` : '';
                    await execAsync(`mysqldump -u root ${passArg} "${dbName}" 2>/dev/null | gzip > "${tmpDir}/database.sql.gz"`, { timeout: 300000 });
                } catch (e) {
                    // Try with common WP DB name patterns
                    console.log('[Backup] DB dump note:', e.message);
                }
            }

            // Combine into single tar.gz
            const parts = [];
            if (fs.existsSync(`${tmpDir}/files.tar.gz`)) parts.push('-C /tmp');
            if (fs.existsSync(`${tmpDir}/files.tar.gz`)) parts.push(`backup-${Date.now()}/files.tar.gz`);
            if (fs.existsSync(`${tmpDir}/database.sql.gz`)) parts.push(`-C /tmp`);
            if (fs.existsSync(`${tmpDir}/database.sql.gz`)) parts.push(`backup-${Date.now()}/database.sql.gz`);

            // Simple approach: tar everything in tmpDir
            await execAsync(`tar czf "${filepath}" -C "${tmpDir}" . 2>&1`, { timeout: 300000 });

            // Cleanup tmp
            await execAsync(`rm -rf "${tmpDir}"`, { timeout: 10000 });

            const stats = fs.statSync(filepath);
            await db.execute('UPDATE backups SET file_size = ?, status = ? WHERE id = ?', [stats.size, 'completed', backupId]);

            return { id: backupId, filename, filepath, size: stats.size, status: 'completed' };
        } catch (err) {
            await db.execute('UPDATE backups SET status = ? WHERE id = ?', ['failed', backupId]);
            throw new Error('Backup failed: ' + err.message);
        }
    }

    static async deleteBackup(id) {
        const [rows] = await db.execute('SELECT file_path FROM backups WHERE id = ?', [id]);
        if (rows.length === 0) throw new Error('Backup not found');
        const filepath = rows[0].file_path;
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        await db.execute('DELETE FROM backups WHERE id = ?', [id]);
        return true;
    }

    static async getBackupInfo(id) {
        const [rows] = await db.execute('SELECT * FROM backups WHERE id = ?', [id]);
        return rows[0] || null;
    }

    static async restoreBackup(id) {
        const backup = await this.getBackupInfo(id);
        if (!backup) throw new Error('Backup not found');
        if (!fs.existsSync(backup.file_path)) throw new Error('Backup file not found');

        const tmpDir = `/tmp/restore-${Date.now()}`;
        fs.mkdirSync(tmpDir, { recursive: true });

        try {
            // Extract backup
            await execAsync(`tar xzf "${backup.file_path}" -C "${tmpDir}" 2>&1`, { timeout: 300000 });

            const docRoot = `/home/public_html/${backup.domain}`;

            // Restore files
            if (backup.type === 'full' || backup.type === 'files') {
                const filesDir = `${tmpDir}/home/public_html/${backup.domain}`;
                if (fs.existsSync(filesDir)) {
                    fs.mkdirSync(docRoot, { recursive: true });
                    await execAsync(`cp -a "${filesDir}/." "${docRoot}/" 2>&1`, { timeout: 300000 });
                    await execAsync(`chown -R lsadm:nogroup "${docRoot}" 2>/dev/null || true`, { timeout: 30000 });
                }
            }

            // Restore database
            if (backup.type === 'full' || backup.type === 'database') {
                const dbFile = `${tmpDir}/database.sql.gz`;
                if (fs.existsSync(dbFile)) {
                    const dbName = backup.domain.replace(/\./g, '_').replace(/-/g, '_');
                    const dbPass = process.env.DB_PASSWORD || '';
                    const passArg = dbPass ? `-p'${dbPass.replace(/'/g, "'\\''")}'` : '';
                    await execAsync(`gunzip -c "${dbFile}" | mysql -u root ${passArg} "${dbName}" 2>&1`, { timeout: 300000 });
                }
            }

            // Cleanup
            await execAsync(`rm -rf "${tmpDir}"`, { timeout: 10000 });
            return { success: true, message: 'Restore completed' };
        } catch (err) {
            await execAsync(`rm -rf "${tmpDir}"`, { timeout: 10000 });
            throw new Error('Restore failed: ' + err.message);
        }
    }

    static async downloadBackup(id) {
        const backup = await this.getBackupInfo(id);
        if (!backup) throw new Error('Backup not found');
        if (!fs.existsSync(backup.file_path)) throw new Error('File not found');
        return backup.file_path;
    }

    static async getStats(user) {
        const backups = await this.listBackups(user);
        const totalSize = backups.reduce((acc, b) => acc + (b.file_size || 0), 0);
        const completed = backups.filter(b => b.status === 'completed').length;
        return { total: backups.length, completed, totalSize, totalFormatted: this.formatBytes(totalSize) };
    }

    static formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = BackupService;
