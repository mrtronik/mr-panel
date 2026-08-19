const RedisManagerService = require('../services/RedisManagerService');
const ActivityLogService = require('../services/ActivityLogService');

class RedisController {
  static async getPage(req, res) {
    try {
      const status = await RedisManagerService.getStatus();
      res.render('settings/redis', {
        title: 'Redis Manager',
        status,
        user: req.session.user
      });
    } catch (error) {
      req.flash('error', `Gagal memuat info Redis: ${error.message}`);
      res.redirect('/dashboard');
    }
  }

  static async getStatus(req, res) {
    try {
      const status = await RedisManagerService.getStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getKeys(req, res) {
    try {
      const { pattern = '*', cursor = 0, count = 100 } = req.query;
      const result = await RedisManagerService.getKeys(pattern, {}, parseInt(cursor), parseInt(count));
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getKey(req, res) {
    try {
      const { key } = req.params;
      const result = await RedisManagerService.getValue(decodeURIComponent(key));
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteKey(req, res) {
    try {
      const { key } = req.params;
      const deleted = await RedisManagerService.deleteKey(decodeURIComponent(key));
      
      if (deleted) {
        ActivityLogService.log(
          req.session.user.id,
          'redis_key_delete',
          'redis',
          null,
          { key: decodeURIComponent(key) },
          req.ip
        );
        res.json({ success: true, message: 'Key berhasil dihapus' });
      } else {
        res.status(404).json({ success: false, message: 'Key tidak ditemukan' });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deletePattern(req, res) {
    try {
      const { pattern } = req.body;
      if (!pattern) {
        return res.status(400).json({ success: false, message: 'Pattern harus diisi' });
      }

      const deleted = await RedisManagerService.deletePattern(pattern);
      
      ActivityLogService.log(
        req.session.user.id,
        'redis_pattern_delete',
        'redis',
        null,
        { pattern, count: deleted },
        req.ip
      );

      res.json({ success: true, message: `${deleted} key berhasil dihapus`, count: deleted });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async flushAll(req, res) {
    try {
      await RedisManagerService.flushAll();
      
      ActivityLogService.log(
        req.session.user.id,
        'redis_flush_all',
        'redis',
        null,
        {},
        req.ip
      );

      res.json({ success: true, message: 'Semua data Redis berhasil dihapus' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async flushDb(req, res) {
    try {
      const { db = 0 } = req.body;
      await RedisManagerService.flushDb(parseInt(db));
      
      ActivityLogService.log(
        req.session.user.id,
        'redis_flush_db',
        'redis',
        null,
        { db },
        req.ip
      );

      res.json({ success: true, message: `Database ${db} berhasil dihapus` });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getConfig(req, res) {
    try {
      const config = await RedisManagerService.getConfig();
      res.json({ success: true, data: config });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getSlowLog(req, res) {
    try {
      const { count = 10 } = req.query;
      const logs = await RedisManagerService.getSlowLog({}, parseInt(count));
      res.json({ success: true, data: logs });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getDatabases(req, res) {
    try {
      const databases = await RedisManagerService.getDatabases();
      res.json({ success: true, data: databases });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async testConnection(req, res) {
    try {
      const result = await RedisManagerService.testConnection();
      res.json({ success: result.success, message: result.message });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = RedisController;
