const ClamAVService = require('../services/ClamAVService');
const ActivityLogService = require('../services/ActivityLogService');

class ClamAVController {
  static async getPage(req, res) {
    try {
      const status = await ClamAVService.getStatus();
      const logs = await ClamAVService.getScanLogs(20);
      const quarantined = await ClamAVService.getQuarantinedFiles();
      
      res.render('security/clamav', {
        title: 'Malware Scanner',
        status,
        logs,
        quarantined,
        user: req.session.user
      });
    } catch (error) {
      req.flash('error', `Gagal memuat ClamAV: ${error.message}`);
      res.redirect('/dashboard');
    }
  }

  static async getStatus(req, res) {
    try {
      const status = await ClamAVService.getStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async scanFile(req, res) {
    try {
      const { filePath } = req.body;
      if (!filePath) {
        return res.status(400).json({ success: false, message: 'File path harus diisi' });
      }

      const result = await ClamAVService.scanFile(filePath);
      
      ActivityLogService.log(
        req.session.user.id,
        'clamav_scan_file',
        'security',
        null,
        { file: filePath, result: result.clean ? 'clean' : 'infected', virus: result.virus },
        req.ip
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async scanDirectory(req, res) {
    try {
      const { dirPath, recursive = true } = req.body;
      if (!dirPath) {
        return res.status(400).json({ success: false, message: 'Directory path harus diisi' });
      }

      const result = await ClamAVService.scanDirectory(dirPath, { recursive });
      
      ActivityLogService.log(
        req.session.user.id,
        'clamav_scan_directory',
        'security',
        null,
        { directory: dirPath, totalScanned: result.totalScanned, totalInfected: result.totalInfected },
        req.ip
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateDatabase(req, res) {
    try {
      ActivityLogService.log(
        req.session.user.id,
        'clamav_update_db',
        'security',
        null,
        {},
        req.ip
      );

      const result = await ClamAVService.updateDatabase();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getLogs(req, res) {
    try {
      const { limit = 50 } = req.query;
      const logs = await ClamAVService.getScanLogs(parseInt(limit));
      res.json({ success: true, data: logs });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async clearLogs(req, res) {
    try {
      await ClamAVService.clearLogs();
      
      ActivityLogService.log(
        req.session.user.id,
        'clamav_clear_logs',
        'security',
        null,
        {},
        req.ip
      );

      res.json({ success: true, message: 'Logs berhasil dihapus' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async quarantine(req, res) {
    try {
      const { filePath } = req.body;
      if (!filePath) {
        return res.status(400).json({ success: false, message: 'File path harus diisi' });
      }

      const result = await ClamAVService.quarantineFile(filePath);
      
      ActivityLogService.log(
        req.session.user.id,
        'clamav_quarantine',
        'security',
        null,
        { file: filePath, quarantinePath: result.quarantinePath },
        req.ip
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getQuarantined(req, res) {
    try {
      const files = await ClamAVService.getQuarantinedFiles();
      res.json({ success: true, data: files });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteQuarantined(req, res) {
    try {
      const { fileName } = req.params;
      const deleted = await ClamAVService.deleteQuarantinedFile(fileName);
      
      if (deleted) {
        ActivityLogService.log(
          req.session.user.id,
          'clamav_delete_quarantine',
          'security',
          null,
          { file: fileName },
          req.ip
        );
        res.json({ success: true, message: 'File berhasil dihapus dari quarantine' });
      } else {
        res.status(404).json({ success: false, message: 'File tidak ditemukan' });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async restoreQuarantined(req, res) {
    try {
      const { fileName } = req.body;
      const result = await ClamAVService.restoreFile(fileName);
      
      ActivityLogService.log(
        req.session.user.id,
        'clamav_restore',
        'security',
        null,
        { file: fileName, restoredTo: result.restoredTo },
        req.ip
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = ClamAVController;
