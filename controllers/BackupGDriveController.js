const GoogleDriveService = require('../services/GoogleDriveService');
const ActivityLogService = require('../services/ActivityLogService');
const db = require('../config/db');

class BackupGDriveController {
  static async getPage(req, res) {
    try {
      const [accounts] = await db.execute(
        'SELECT * FROM gdrive_accounts WHERE user_id = ?',
        [req.session.user.id]
      );

      const [backups] = await db.execute(
        'SELECT * FROM gdrive_backups WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
        [req.session.user.id]
      );

      let scheduledBackups = [];
      try {
        scheduledBackups = await GoogleDriveService.listScheduledBackups(req.session.user.id);
      } catch {}

      let storageInfo = null;
      if (accounts.length > 0 && accounts[0].status === 'active') {
        try {
          storageInfo = await GoogleDriveService.getStorageInfo(accounts[0].id);
        } catch {}
      }

      const success = req.query.success === 'connected' ? 'Berhasil connect ke Google Drive!' : null;
      const error = req.query.error || null;

      res.render('backup/gdrive', {
        title: 'Google Drive Backup',
        account: accounts[0] || null,
        backups,
        scheduledBackups,
        storageInfo,
        success,
        error,
        user: req.session.user
      });
    } catch (error) {
      req.flash('error', `Gagal memuat backup page: ${error.message}`);
      res.redirect('/dashboard');
    }
  }

  static async connect(req, res) {
    try {
      const url = GoogleDriveService.getAuthUrl();
      res.json({ success: true, url });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async callback(req, res) {
    try {
      const { code, error: googleError } = req.query;
      
      if (googleError) {
        return res.redirect('/settings/backup?error=' + encodeURIComponent(googleError));
      }
      
      if (!code) {
        return res.redirect('/settings/backup?error=no_code');
      }

      if (!req.session || !req.session.user) {
        return res.redirect('/login');
      }

      console.log('[GDrive] Exchanging code, session user:', req.session.user?.id);
      const tokenData = await GoogleDriveService.exchangeCode(code);
      console.log('[GDrive] Token exchanged for:', tokenData.email);

      const [existing] = await db.execute(
        'SELECT id FROM gdrive_accounts WHERE user_id = ?',
        [req.session.user.id]
      );

      if (existing.length > 0) {
        await db.execute(
          `UPDATE gdrive_accounts SET email = ?, access_token = ?, refresh_token = ?, 
           token_expiry = ?, status = 'active', updated_at = NOW() WHERE user_id = ?`,
          [tokenData.email, tokenData.accessToken, tokenData.refreshToken,
           new Date(tokenData.expiry), req.session.user.id]
        );
      } else {
        await db.execute(
          `INSERT INTO gdrive_accounts (user_id, email, access_token, refresh_token, token_expiry, status) 
           VALUES (?, ?, ?, ?, ?, 'active')`,
          [req.session.user.id, tokenData.email, tokenData.accessToken,
           tokenData.refreshToken, new Date(tokenData.expiry)]
        );
      }

      const [accounts] = await db.execute(
        'SELECT id FROM gdrive_accounts WHERE user_id = ?',
        [req.session.user.id]
      );
      
      if (accounts.length > 0) {
        try {
          await GoogleDriveService.ensureFolder(accounts[0].id);
        } catch (folderErr) {
          console.error('[GDrive] ensureFolder error:', folderErr.message);
        }
      }

      ActivityLogService.log(
        req.session.user.id,
        'gdrive_connect',
        'backup',
        null,
        { email: tokenData.email },
        req.ip
      );

      res.redirect('/settings/backup?success=connected');
    } catch (error) {
      console.error('[GDrive] Callback error:', error.message);
      res.redirect('/settings/backup?error=' + encodeURIComponent(error.message));
    }
  }

  static async disconnect(req, res) {
    try {
      await db.execute(
        "UPDATE gdrive_accounts SET status = 'disconnected' WHERE user_id = ?",
        [req.session.user.id]
      );

      ActivityLogService.log(
        req.session.user.id,
        'gdrive_disconnect',
        'backup',
        null,
        {},
        req.ip
      );

      res.json({ success: true, message: 'Google Drive disconnected' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async createBackup(req, res) {
    try {
      const { type = 'all' } = req.body;

      const result = await GoogleDriveService.createBackup(req.session.user.id, { type });

      ActivityLogService.log(
        req.session.user.id,
        'gdrive_backup_create',
        'backup',
        result.id,
        { filename: result.filename, size: result.size, type },
        req.ip
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async restoreBackup(req, res) {
    try {
      const { id } = req.params;

      const result = await GoogleDriveService.restoreBackup(parseInt(id), req.session.user.id);

      ActivityLogService.log(
        req.session.user.id,
        'gdrive_backup_restore',
        'backup',
        parseInt(id),
        { message: result.message },
        req.ip
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async listBackups(req, res) {
    try {
      const [accounts] = await db.execute(
        'SELECT id FROM gdrive_accounts WHERE user_id = ? AND status = ?',
        [req.session.user.id, 'active']
      );

      if (accounts.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const backups = await GoogleDriveService.listBackups(accounts[0].id);
      res.json({ success: true, data: backups });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteBackup(req, res) {
    try {
      const { id } = req.params;

      const [backups] = await db.execute(
        'SELECT * FROM gdrive_backups WHERE id = ? AND user_id = ?',
        [parseInt(id), req.session.user.id]
      );

      if (backups.length === 0) {
        return res.status(404).json({ success: false, message: 'Backup not found' });
      }

      const backup = backups[0];

      if (backup.gdrive_file_id) {
        try {
          await GoogleDriveService.deleteFile(backup.account_id, backup.gdrive_file_id);
        } catch {}
      }

      await db.execute('DELETE FROM gdrive_backups WHERE id = ?', [parseInt(id)]);

      ActivityLogService.log(
        req.session.user.id,
        'gdrive_backup_delete',
        'backup',
        parseInt(id),
        { filename: backup.filename },
        req.ip
      );

      res.json({ success: true, message: 'Backup deleted' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getStorageInfo(req, res) {
    try {
      const [accounts] = await db.execute(
        'SELECT id FROM gdrive_accounts WHERE user_id = ? AND status = ?',
        [req.session.user.id, 'active']
      );

      if (accounts.length === 0) {
        return res.json({ success: false, message: 'Not connected' });
      }

      const info = await GoogleDriveService.getStorageInfo(accounts[0].id);
      res.json({ success: true, data: info });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async testConnection(req, res) {
    try {
      const [accounts] = await db.execute(
        'SELECT id FROM gdrive_accounts WHERE user_id = ? AND status = ?',
        [req.session.user.id, 'active']
      );

      if (accounts.length === 0) {
        return res.json({ success: false, message: 'Not connected' });
      }

      const result = await GoogleDriveService.testConnection(accounts[0].id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ========== SCHEDULED BACKUPS ==========

  static async createSchedule(req, res) {
    try {
      const { name, type = 'all', cron } = req.body;
      if (!cron) return res.status(400).json({ success: false, message: 'Cron expression required' });

      const result = await GoogleDriveService.createScheduledBackup(req.session.user.id, { name, type, cron });

      ActivityLogService.log(req.session.user.id, 'gdrive_schedule_create', 'backup', result.id, { name, type, cron }, req.ip);

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async listSchedules(req, res) {
    try {
      const schedules = await GoogleDriveService.listScheduledBackups(req.session.user.id);
      res.json({ success: true, data: schedules });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateSchedule(req, res) {
    try {
      const { id } = req.params;
      const { name, type, status, cron } = req.body;

      await GoogleDriveService.updateScheduledBackup(parseInt(id), req.session.user.id, { name, type, status, cron });

      ActivityLogService.log(req.session.user.id, 'gdrive_schedule_update', 'backup', parseInt(id), { name, type, status, cron }, req.ip);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteSchedule(req, res) {
    try {
      const { id } = req.params;
      await GoogleDriveService.deleteScheduledBackup(parseInt(id), req.session.user.id);

      ActivityLogService.log(req.session.user.id, 'gdrive_schedule_delete', 'backup', parseInt(id), {}, req.ip);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async runSchedule(req, res) {
    try {
      const { id } = req.params;
      const result = await GoogleDriveService.runScheduledBackup(parseInt(id));

      ActivityLogService.log(req.session.user.id, 'gdrive_schedule_run', 'backup', parseInt(id), { filename: result.filename }, req.ip);

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async runScheduleApi(req, res) {
    try {
      const { id } = req.params;
      const apiKey = req.headers['x-api-key'];
      const apiSecret = req.headers['x-api-secret'];
      const SystemSettingsService = require('../services/SystemSettingsService');
      const validKey = await SystemSettingsService.getWhmcsApiKey();
      const validSecret = await SystemSettingsService.getWhmcsApiSecret();

      if (!apiKey || !apiSecret || apiKey !== validKey || apiSecret !== validSecret) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const result = await GoogleDriveService.runScheduledBackup(parseInt(id));
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = BackupGDriveController;
