const db = require('../config/db');

class SystemCacheService {
  static async get(key, maxAgeSeconds = 300) {
    try {
      const [rows] = await db.execute(
        'SELECT cache_value, cached_at FROM system_cache WHERE cache_key = ?',
        [key]
      );
      
      if (rows.length === 0) return null;
      
      const cached = rows[0];
      const age = (Date.now() - new Date(cached.cached_at).getTime()) / 1000;
      
      if (age > maxAgeSeconds) return null;
      
      try {
        return JSON.parse(cached.cache_value);
      } catch {
        return cached.cache_value;
      }
    } catch {
      return null;
    }
  }

  static async set(key, value) {
    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
    try {
      await db.execute(
        'INSERT INTO system_cache (cache_key, cache_value, cached_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE cache_value = VALUES(cache_value), cached_at = NOW()',
        [key, jsonValue]
      );
    } catch (err) {
      console.error(`[SystemCache] Failed to set ${key}:`, err.message);
    }
  }

  static async remove(key) {
    try {
      await db.execute('DELETE FROM system_cache WHERE cache_key = ?', [key]);
    } catch {}
  }

  static async clear() {
    try {
      await db.execute('DELETE FROM system_cache');
    } catch {}
  }

  static async isStale(key, maxAgeSeconds = 300) {
    try {
      const [rows] = await db.execute(
        'SELECT cached_at FROM system_cache WHERE cache_key = ?',
        [key]
      );
      if (rows.length === 0) return true;
      const age = (Date.now() - new Date(rows[0].cached_at).getTime()) / 1000;
      return age > maxAgeSeconds;
    } catch { return true; }
  }

  static async getAge(key) {
    try {
      const [rows] = await db.execute(
        'SELECT cached_at FROM system_cache WHERE cache_key = ?',
        [key]
      );
      if (rows.length === 0) return null;
      return {
        cachedAt: rows[0].cached_at,
        ageSeconds: Math.floor((Date.now() - new Date(rows[0].cached_at).getTime()) / 1000)
      };
    } catch { return null; }
  }
}

module.exports = SystemCacheService;
