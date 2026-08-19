const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('../config/db');

class GoogleDriveService {
  static SCOPES = ['https://www.googleapis.com/auth/drive'];
  static BACKUP_FOLDER = 'MR Panel Backups';

  static getOAuth2Client() {
    const clientId = process.env.GDRIVE_CLIENT_ID;
    const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
    const redirectUri = `${process.env.APP_URL || 'https://live.mrstudio.web.id:1708'}/api/backup/gdrive/callback`;

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  static getAuthUrl() {
    const oauth2Client = this.getOAuth2Client();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.SCOPES,
      prompt: 'consent'
    });
  }

  static async exchangeCode(code) {
    const oauth2Client = this.getOAuth2Client();
    
    console.log('[GDrive] Exchanging code...');
    
    try {
      const { tokens } = await oauth2Client.getToken(code);
      console.log('[GDrive] Token received:', !!tokens.access_token, !!tokens.refresh_token);

      let email = 'unknown';
      try {
        if (tokens.id_token) {
          const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString());
          email = payload.email || 'unknown';
        }
      } catch {}

      if (email === 'unknown') {
        try {
          oauth2Client.setCredentials(tokens);
          const oauth2 = google.oauth2({ version: 'v1', auth: oauth2Client });
          const { data } = await oauth2.userinfo.get();
          email = data.email || 'unknown';
        } catch (e) {
          console.error('[GDrive] userinfo fallback error:', e.message);
        }
      }

      console.log('[GDrive] User email:', email);

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiry: tokens.expiry_date,
        email
      };
    } catch (err) {
      console.error('[GDrive] exchangeCode error:', err.message);
      throw err;
    }
  }

  static async getAuthenticatedClient(accountId) {
    const [rows] = await db.execute('SELECT * FROM gdrive_accounts WHERE id = ?', [accountId]);
    if (rows.length === 0) throw new Error('Google Drive account not found');

    const account = rows[0];
    const oauth2Client = this.getOAuth2Client();

    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      expiry_date: new Date(account.token_expiry).getTime()
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await db.execute(
          'UPDATE gdrive_accounts SET access_token = ?, token_expiry = FROM_UNIXTIME(?) WHERE id = ?',
          [tokens.access_token, Math.floor(tokens.expiry_date / 1000), accountId]
        );
      }
    });

    return oauth2Client;
  }

  static async ensureFolder(accountId, folderName = null) {
    const folder = folderName || this.BACKUP_FOLDER;
    const oauth2Client = await this.getAuthenticatedClient(accountId);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const [account] = await db.execute('SELECT folder_id FROM gdrive_accounts WHERE id = ?', [accountId]);
    if (account[0]?.folder_id) {
      try {
        await drive.files.get({ fileId: account[0].folder_id });
        return account[0].folder_id;
      } catch {}
    }

    const res = await drive.files.create({
      resource: {
        name: folder,
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id'
    });

    await db.execute('UPDATE gdrive_accounts SET folder_id = ? WHERE id = ?', [res.data.id, accountId]);
    return res.data.id;
  }

  static async uploadBackup(accountId, filePath, filename, metadata = {}) {
    const oauth2Client = await this.getAuthenticatedClient(accountId);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folderId = await this.ensureFolder(accountId);

    const fileStats = fs.statSync(filePath);

    const res = await drive.files.create({
      resource: {
        name: filename,
        parents: [folderId],
        description: JSON.stringify({
          type: metadata.type || 'backup',
          components: metadata.components || {},
          server: process.env.SERVER_IP || 'unknown',
          created: new Date().toISOString()
        })
      },
      media: {
        mimeType: 'application/gzip',
        body: fs.createReadStream(filePath)
      },
      fields: 'id,webViewLink,size'
    });

    await drive.permissions.create({
      fileId: res.data.id,
      resource: { role: 'reader', type: 'anyone' }
    });

    let link;
    try {
      const file = await drive.files.get({
        fileId: res.data.id,
        fields: 'webViewLink'
      });
      link = file.data.webViewLink;
    } catch { link = null; }

    return {
      fileId: res.data.id,
      link,
      size: fileStats.size
    };
  }

  static async listBackups(accountId, limit = 50) {
    const oauth2Client = await this.getAuthenticatedClient(accountId);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folderId = await this.ensureFolder(accountId);

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      orderBy: 'createdTime desc',
      pageSize: limit,
      fields: 'files(id,name,size,createdTime,webViewLink,description)'
    });

    return (res.data.files || []).map(f => {
      let description = {};
      try { description = JSON.parse(f.description || '{}'); } catch {}
      return {
        id: f.id,
        name: f.name,
        size: parseInt(f.size || 0),
        sizeFormatted: this.formatBytes(parseInt(f.size || 0)),
        createdAt: f.createdTime,
        link: f.webViewLink,
        type: description.type || 'backup',
        components: description.components || {}
      };
    });
  }

  static async deleteFile(accountId, gdriveFileId) {
    const oauth2Client = await this.getAuthenticatedClient(accountId);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    await drive.files.delete({ fileId: gdriveFileId });
    return true;
  }

  static async downloadFile(accountId, gdriveFileId, destPath) {
    const oauth2Client = await this.getAuthenticatedClient(accountId);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const res = await drive.files.get({
      fileId: gdriveFileId,
      alt: 'media'
    });

    const dest = fs.createWriteStream(destPath);
    return new Promise((resolve, reject) => {
      res.data.pipe(dest);
      dest.on('finish', () => resolve(destPath));
      dest.on('error', reject);
    });
  }

  static async getStorageInfo(accountId) {
    const oauth2Client = await this.getAuthenticatedClient(accountId);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const res = await drive.about.get({
      fields: 'storageQuota'
    });

    const quota = res.data.storageQuota;
    return {
      used: parseInt(quota.usage || 0),
      usedFormatted: this.formatBytes(parseInt(quota.usage || 0)),
      limit: parseInt(quota.limit || 0),
      limitFormatted: quota.limit === '-1' ? 'Unlimited' : this.formatBytes(parseInt(quota.limit || 0)),
      percent: quota.limit === '-1' ? 0 : Math.round((parseInt(quota.usage || 0) / parseInt(quota.limit || 1)) * 100)
    };
  }

  static async testConnection(accountId) {
    try {
      const oauth2Client = await this.getAuthenticatedClient(accountId);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      await drive.about.get({ fields: 'user' });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ========== BACKUP OPERATIONS ==========

  static async createBackup(userId, options = {}) {
    const { type = 'all', components = {} } = options;

    const [accounts] = await db.execute(
      'SELECT * FROM gdrive_accounts WHERE user_id = ? AND status = ?',
      [userId, 'active']
    );
    if (accounts.length === 0) throw new Error('Google Drive account not connected');

    const account = accounts[0];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = '/tmp/mrpanel-backup';
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const [backupResult] = await db.execute(
      'INSERT INTO gdrive_backups (account_id, user_id, backup_type, filename, status, components) VALUES (?, ?, ?, ?, ?, ?)',
      [account.id, userId, type, '', 'uploading', JSON.stringify(components)]
    );
    const backupId = backupResult.insertId;

    try {
      let filename, filePath;

      switch (type) {
        case 'files':
          filename = `files-${timestamp}.tar.gz`;
          filePath = path.join(backupDir, filename);
          const homes = await this.getUserHomes(userId);
          if (homes.length === 0) throw new Error('No websites to backup');
          const tarPaths = homes.map(h => `"${h}"`).join(' ');
          execSync(`tar -czf "${filePath}" -C / ${tarPaths.replace(/"/g, '')} 2>/dev/null || true`, { timeout: 300000 });
          break;

        case 'database':
          filename = `database-${timestamp}.sql.gz`;
          filePath = path.join(backupDir, filename);
          const databases = await this.getUserDatabases(userId);
          if (databases.length === 0) throw new Error('No databases to backup');
          const dbList = databases.join(' ');
          const dbPass = process.env.DB_PASSWORD || '';
          const passArg = dbPass ? `-p'${dbPass.replace(/'/g, "'\\''")}'` : '';
          execSync(`mysqldump -u root ${passArg} --databases ${dbList} 2>/dev/null | gzip > "${filePath}"`, { timeout: 300000 });
          break;

        case 'email':
          filename = `email-${timestamp}.tar.gz`;
          filePath = path.join(backupDir, filename);
          const emailDomains = await this.getEmailDomains(userId);
          if (emailDomains.length === 0) throw new Error('No email accounts to backup');
          const emailPaths = emailDomains.map(d => `"/var/mail/${d}"`).join(' ');
          execSync(`tar -czf "${filePath}" ${emailPaths} 2>/dev/null || true`, { timeout: 300000 });
          break;

        case 'all':
        default:
          filename = `full-${timestamp}.tar.gz`;
          filePath = path.join(backupDir, filename);
          const allPaths = [];
          const userHomes = await this.getUserHomes(userId);
          userHomes.forEach(h => allPaths.push(h));
          allPaths.push('/var/mail');
          
          const sysConfigDir = path.join(backupDir, `config-${timestamp}`);
          if (!fs.existsSync(sysConfigDir)) fs.mkdirSync(sysConfigDir, { recursive: true });
          
          try {
            execSync(`cp /etc/postfix/main.cf "${sysConfigDir}/" 2>/dev/null || true`);
            execSync(`cp /etc/dovecot/dovecot.conf "${sysConfigDir}/" 2>/dev/null || true`);
            const panelPass = process.env.DB_PASSWORD || '';
            const panelPassArg = panelPass ? `-p'${panelPass.replace(/'/g, "'\\''")}'` : '';
            execSync(`mysqldump -u root ${panelPassArg} mrpanel 2>/dev/null | gzip > "${sysConfigDir}/panel-db.sql.gz" || true`);
          } catch {}

          allPaths.push(sysConfigDir.replace(backupDir, ''));
          execSync(`tar -czf "${filePath}" -C "${backupDir}" ${allPaths.map(p => p.startsWith('/') ? p.slice(1) : p).join(' ')} 2>/dev/null || true`, { timeout: 300000 });
          
          try { fs.rmSync(sysConfigDir, { recursive: true }); } catch {}
          break;
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
        throw new Error('Backup file is empty or was not created');
      }

      const fileSize = fs.statSync(filePath).size;
      const uploadResult = await this.uploadBackup(account.id, filePath, filename, {
        type, components
      });

      await db.execute(
        `UPDATE gdrive_backups SET filename = ?, gdrive_file_id = ?, gdrive_link = ?, 
         file_size = ?, file_size_formatted = ?, status = 'completed', completed_at = NOW() WHERE id = ?`,
        [filename, uploadResult.fileId, uploadResult.link, fileSize, this.formatBytes(fileSize), backupId]
      );

      try { fs.unlinkSync(filePath); } catch {}

      return {
        id: backupId,
        filename,
        fileId: uploadResult.fileId,
        link: uploadResult.link,
        size: fileSize,
        sizeFormatted: this.formatBytes(fileSize)
      };
    } catch (err) {
      await db.execute(
        'UPDATE gdrive_backups SET status = ?, error_message = ? WHERE id = ?',
        ['failed', err.message, backupId]
      );
      throw err;
    }
  }

  static async restoreBackup(backupId, userId) {
    const [backups] = await db.execute(
      'SELECT * FROM gdrive_backups WHERE id = ? AND user_id = ?',
      [backupId, userId]
    );
    if (backups.length === 0) throw new Error('Backup not found');

    const backup = backups[0];
    if (backup.status !== 'completed') throw new Error('Backup is not completed');

    const restoreDir = '/tmp/mrpanel-restore';
    if (!fs.existsSync(restoreDir)) fs.mkdirSync(restoreDir, { recursive: true });

    const filePath = path.join(restoreDir, backup.filename);

    await this.downloadFile(backup.account_id, backup.gdrive_file_id, filePath);

    await db.execute('UPDATE gdrive_backups SET status = ? WHERE id = ?', ['restoring', backupId]);

    try {
      switch (backup.backup_type) {
        case 'files':
          execSync(`tar -xzf "${filePath}" -C / 2>/dev/null`, { timeout: 300000 });
          break;

        case 'database':
          const restorePass = process.env.DB_PASSWORD || '';
          const restorePassArg = restorePass ? `-p'${restorePass.replace(/'/g, "'\\''")}'` : '';
          execSync(`gunzip -c "${filePath}" | mysql -u root ${restorePassArg} 2>/dev/null`, { timeout: 300000 });
          break;

        case 'email':
          execSync(`tar -xzf "${filePath}" -C / 2>/dev/null`, { timeout: 300000 });
          break;

        case 'all':
        default:
          execSync(`tar -xzf "${filePath}" -C / 2>/dev/null`, { timeout: 300000 });
          break;
      }

      await db.execute('UPDATE gdrive_backups SET status = ? WHERE id = ?', ['completed', backupId]);

      try { fs.unlinkSync(filePath); } catch {}

      return { success: true, message: `Restore completed: ${backup.filename}` };
    } catch (err) {
      await db.execute('UPDATE gdrive_backups SET status = ? WHERE id = ?', ['completed', backupId]);
      throw new Error(`Restore failed: ${err.message}`);
    }
  }

  static async getUserHomes(userId) {
    const [rows] = await db.execute(
      'SELECT document_root FROM websites WHERE user_id = ? AND status = ?',
      [userId, 'active']
    );
    return rows.map(r => r.document_root).filter(d => d && fs.existsSync(d));
  }

  static async getUserDatabases(userId) {
    const [rows] = await db.execute(
      'SELECT db_name FROM user_databases WHERE user_id = ?',
      [userId]
    );
    if (rows.length === 0) return ['mrpanel'];
    return rows.map(r => r.db_name);
  }

  static async getEmailDomains(userId) {
    const [rows] = await db.execute(
      'SELECT DISTINCT domain FROM email_accounts WHERE user_id = ? AND status = ?',
      [userId, 'active']
    );
    return rows.map(r => r.domain);
  }

  // ========== SCHEDULED BACKUPS ==========

  static parseCronExpression(cron) {
    const parts = cron.split(' ');
    if (parts.length !== 5) return null;
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    return { minute, hour, dayOfMonth, month, dayOfWeek };
  }

  static cronToString(cron) {
    const p = this.parseCronExpression(cron);
    if (!p) return cron;
    if (p.dayOfMonth === '*' && p.month === '*' && p.dayOfWeek === '*') {
      if (p.hour === '*' && p.minute === '*') return 'Setiap menit';
      if (p.hour === '*') return `Setiap jam ke-${p.minute} tiap jam`;
      if (p.minute === '0') return `Tiap jam ${p.hour}:00`;
      return `Tiap jam ${p.hour}:${p.minute.padStart(2, '0')}`;
    }
    if (p.dayOfWeek !== '*') {
      const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      return `${days[parseInt(p.dayOfWeek)] || p.dayOfWeek} ${p.hour}:${p.minute.padStart(2, '0')}`;
    }
    if (p.dayOfMonth !== '*') {
      return `${p.dayOfMonth}/${p.month || '*'} ${p.hour}:${p.minute.padStart(2, '0')}`;
    }
    return cron;
  }

  static getNextRunFromCron(cron) {
    const p = this.parseCronExpression(cron);
    if (!p) return null;
    const now = new Date();
    const next = new Date(now);
    next.setSeconds(0);
    next.setMilliseconds(0);

    if (p.minute !== '*') next.setMinutes(parseInt(p.minute));
    else next.setMinutes(now.getMinutes() + 1);
    if (p.hour !== '*') next.setHours(parseInt(p.hour));
    else if (p.minute === '*') next.setHours(now.getHours());

    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  static async createScheduledBackup(userId, data) {
    const [accounts] = await db.execute(
      'SELECT id FROM gdrive_accounts WHERE user_id = ? AND status = ?',
      [userId, 'active']
    );
    if (accounts.length === 0) throw new Error('Google Drive account not connected');

    const cronParts = this.parseCronExpression(data.cron);
    if (!cronParts) throw new Error('Invalid cron expression');

    const nextRun = this.getNextRunFromCron(data.cron);

    const [result] = await db.execute(
      `INSERT INTO scheduled_backups (user_id, account_id, name, backup_type, cron_expression, status, next_run)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [userId, accounts[0].id, data.name || `Backup ${data.type}`, data.type || 'all', data.cron, nextRun]
    );

    return { id: result.insertId, ...data, nextRun };
  }

  static async listScheduledBackups(userId) {
    const [rows] = await db.execute(
      'SELECT * FROM scheduled_backups WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(r => ({
      ...r,
      cronHuman: this.cronToString(r.cron_expression),
      nextRunFormatted: r.next_run ? new Date(r.next_run).toLocaleString() : '-'
    }));
  }

  static async updateScheduledBackup(scheduleId, userId, data) {
    const [rows] = await db.execute(
      'SELECT * FROM scheduled_backups WHERE id = ? AND user_id = ?',
      [scheduleId, userId]
    );
    if (rows.length === 0) throw new Error('Schedule not found');

    const updates = [];
    const params = [];
    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.type !== undefined) { updates.push('backup_type = ?'); params.push(data.type); }
    if (data.status !== undefined) { updates.push('status = ?'); params.push(data.status); }
    if (data.cron !== undefined) {
      const cronParts = this.parseCronExpression(data.cron);
      if (!cronParts) throw new Error('Invalid cron expression');
      updates.push('cron_expression = ?');
      params.push(data.cron);
      updates.push('next_run = ?');
      params.push(this.getNextRunFromCron(data.cron));
    }

    if (updates.length === 0) throw new Error('No fields to update');
    params.push(scheduleId, userId);
    await db.execute(`UPDATE scheduled_backups SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, params);

    return { success: true };
  }

  static async deleteScheduledBackup(scheduleId, userId) {
    const [rows] = await db.execute(
      'SELECT id FROM scheduled_backups WHERE id = ? AND user_id = ?',
      [scheduleId, userId]
    );
    if (rows.length === 0) throw new Error('Schedule not found');
    await db.execute('DELETE FROM scheduled_backups WHERE id = ? AND user_id = ?', [scheduleId, userId]);
    return { success: true };
  }

  static async runScheduledBackup(scheduleId) {
    const [rows] = await db.execute(
      'SELECT * FROM scheduled_backups WHERE id = ? AND status = ?',
      [scheduleId, 'active']
    );
    if (rows.length === 0) throw new Error('Schedule not found or not active');

    const schedule = rows[0];
    const nextRun = this.getNextRunFromCron(schedule.cron_expression);

    try {
      const result = await this.createBackup(schedule.user_id, { type: schedule.backup_type });
      await db.execute(
        `UPDATE scheduled_backups SET last_run = NOW(), last_status = 'success', last_error = NULL, next_run = ? WHERE id = ?`,
        [nextRun, scheduleId]
      );
      return result;
    } catch (err) {
      await db.execute(
        `UPDATE scheduled_backups SET last_run = NOW(), last_status = 'failed', last_error = ?, next_run = ? WHERE id = ?`,
        [err.message, nextRun, scheduleId]
      );
      throw err;
    }
  }

  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = GoogleDriveService;
