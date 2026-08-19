const Redis = require('ioredis');
const { execSync } = require('child_process');

class RedisManagerService {
  static getClient(config = {}) {
    const host = config.host || '127.0.0.1';
    const port = config.port || 6379;
    const password = config.password || undefined;
    const db = config.db || 0;

    return new Redis({
      host,
      port,
      password,
      db,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true
    });
  }

  static async getStatus(config = {}) {
    let client;
    try {
      client = this.getClient(config);
      await client.connect();
      const info = await client.info('server');
      const memory = await client.info('memory');
      const stats = await client.info('stats');
      const clients = await client.info('clients');
      const keyspace = await client.info('keyspace');

      const parseInfo = (str) => {
        const result = {};
        str.split('\r\n').forEach(line => {
          if (line && !line.startsWith('#')) {
            const [key, ...value] = line.split(':');
            if (key) result[key.trim()] = value.join(':').trim();
          }
        });
        return result;
      };

      const serverInfo = parseInfo(info);
      const memoryInfo = parseInfo(memory);
      const statsInfo = parseInfo(stats);
      const clientsInfo = parseInfo(clients);

      let dbKeys = {};
      keyspace.split('\r\n').forEach(line => {
        if (line.startsWith('db')) {
          const [db, ...parts] = line.split(':');
          const keys = {};
          parts.join(':').split(',').forEach(p => {
            const [k, v] = p.split('=');
            keys[k.trim()] = parseInt(v) || 0;
          });
          dbKeys[db] = keys;
        }
      });

      const totalKeys = Object.values(dbKeys).reduce((sum, db) => sum + (db.keys || 0), 0);

      return {
        connected: true,
        version: serverInfo.redis_version,
        uptime: parseInt(serverInfo.uptime_in_seconds) || 0,
        uptimeFormatted: this.formatUptime(parseInt(serverInfo.uptime_in_seconds) || 0),
        role: serverInfo.role,
        tcp_port: serverInfo.tcp_port,
        memory: {
          used: this.formatBytes(parseInt(memoryInfo.used_memory) || 0),
          usedBytes: parseInt(memoryInfo.used_memory) || 0,
          peak: this.formatBytes(parseInt(memoryInfo.used_memory_peak) || 0),
          peakBytes: parseInt(memoryInfo.used_memory_peak) || 0,
          fragmentation: memoryInfo.mem_fragmentation_ratio,
          rss: this.formatBytes(parseInt(memoryInfo.used_memory_rss) || 0)
        },
        clients: {
          connected: parseInt(clientsInfo.connected_clients) || 0,
          blocked: parseInt(clientsInfo.blocked_clients) || 0,
          tracking: parseInt(clientsInfo.tracking_clients) || 0,
          maxClients: parseInt(clientsInfo.maxclients) || 10000
        },
        stats: {
          totalCommands: parseInt(statsInfo.total_commands_processed) || 0,
          opsPerSec: parseInt(statsInfo.instantaneous_ops_per_sec) || 0,
          hitRate: this.calculateHitRate(statsInfo),
          keyspaceHits: parseInt(statsInfo.keyspace_hits) || 0,
          keyspaceMisses: parseInt(statsInfo.keyspace_misses) || 0,
          expiredKeys: parseInt(statsInfo.expired_keys) || 0,
          evictedKeys: parseInt(statsInfo.evicted_keys) || 0
        },
        keyspace: dbKeys,
        totalKeys
      };
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return { connected: false, error: 'Redis server tidak berjalan atau tidak dapat diakses' };
      }
      throw error;
    } finally {
      if (client) client.disconnect();
    }
  }

  static async getKeys(pattern = '*', config = {}, cursor = 0, count = 100) {
    let client;
    try {
      client = this.getClient(config);
      await client.connect();
      
      const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
      const nextCursor = parseInt(result[0]);
      const keys = result[1];

      const keysWithInfo = [];
      for (const key of keys) {
        const type = await client.type(key);
        const ttl = await client.ttl(key);
        let size = 0;

        try {
          if (type === 'string') {
            size = await client.strlen(key);
          } else if (type === 'list') {
            size = await client.llen(key);
          } else if (type === 'set') {
            size = await client.scard(key);
          } else if (type === 'zset') {
            size = await client.zcard(key);
          } else if (type === 'hash') {
            size = await client.hlen(key);
          }
        } catch (e) { /* ignore */ }

        keysWithInfo.push({
          key,
          type,
          ttl: ttl > 0 ? ttl : null,
          ttlFormatted: ttl > 0 ? this.formatTTL(ttl) : (ttl === -1 ? 'No expiry' : 'Not found'),
          size
        });
      }

      return {
        cursor: nextCursor,
        keys: keysWithInfo,
        hasMore: nextCursor !== 0
      };
    } finally {
      if (client) client.disconnect();
    }
  }

  static async getValue(key, config = {}) {
    let client;
    try {
      client = this.getClient(config);
      await client.connect();

      const type = await client.type(key);
      const ttl = await client.ttl(key);
      let value;

      switch (type) {
        case 'string':
          value = await client.get(key);
          try { value = JSON.parse(value); } catch (e) { /* keep string */ }
          break;
        case 'list':
          value = await client.lrange(key, 0, -1);
          break;
        case 'set':
          value = await client.smembers(key);
          break;
        case 'zset':
          value = await client.zrange(key, 0, -1, 'WITHSCORES');
          break;
        case 'hash':
          value = await client.hgetall(key);
          break;
        default:
          value = null;
      }

      return { key, type, ttl, ttlFormatted: ttl > 0 ? this.formatTTL(ttl) : (ttl === -1 ? 'No expiry' : 'Not found'), value };
    } finally {
      if (client) client.disconnect();
    }
  }

  static async deleteKey(key, config = {}) {
    let client;
    try {
      client = this.getClient(config);
      await client.connect();
      const result = await client.del(key);
      return result > 0;
    } finally {
      if (client) client.disconnect();
    }
  }

  static async deletePattern(pattern, config = {}) {
    let client;
    try {
      client = this.getClient(config);
      await client.connect();
      
      let totalDeleted = 0;
      let cursor = 0;
      
      do {
        const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = parseInt(result[0]);
        const keys = result[1];
        
        if (keys.length > 0) {
          const deleted = await client.del(...keys);
          totalDeleted += deleted;
        }
      } while (cursor !== 0);
      
      return totalDeleted;
    } finally {
      if (client) client.disconnect();
    }
  }

  static async flushAll(config = {}) {
    let client;
    try {
      client = this.getClient(config);
      await client.connect();
      await client.flushall();
      return true;
    } finally {
      if (client) client.disconnect();
    }
  }

  static async flushDb(db = 0, config = {}) {
    let client;
    try {
      client = this.getClient(config);
      await client.connect();
      await client.select(db);
      await client.flushdb();
      return true;
    } finally {
      if (client) client.disconnect();
    }
  }

  static async getConfig(config = {}) {
    let client;
    try {
      client = this.getClient(config);
      await client.connect();
      const configData = await client.config('GET', '*');
      
      const result = {};
      for (let i = 0; i < configData.length; i += 2) {
        result[configData[i]] = configData[i + 1];
      }
      return result;
    } finally {
      if (client) client.disconnect();
    }
  }

  static async getSlowLog(config = {}, count = 10) {
    let client;
    try {
      client = this.getClient(config);
      await client.connect();
      const logs = await client.slowlog('GET', count);
      
      return logs.map(log => ({
        id: log[0],
        timestamp: new Date(log[1] * 1000),
        duration: `${log[2]}μs`,
        durationMs: (log[2] / 1000).toFixed(2) + 'ms',
        command: log[3].join(' '),
        clientIp: log[4],
        dbName: log[5]
      }));
    } finally {
      if (client) client.disconnect();
    }
  }

  static async getDatabases(config = {}) {
    let client;
    try {
      client = this.getClient(config);
      await client.connect();
      
      const databases = [];
      for (let i = 0; i < 16; i++) {
        try {
          await client.select(i);
          const info = await client.info('keyspace');
          const dbLine = info.split('\r\n').find(l => l.startsWith(`db${i}`));
          
          if (dbLine) {
            const parts = dbLine.split(':')[1].split(',');
            const keys = parseInt(parts[0].split('=')[1]) || 0;
            const expires = parseInt(parts[1]?.split('=')[1]) || 0;
            const avgTTL = parseInt(parts[2]?.split('=')[1]) || 0;
            
            databases.push({ id: i, keys, expires, avgTTL, selected: i === 0 });
          } else {
            databases.push({ id: i, keys: 0, expires: 0, avgTTL: 0, selected: false });
          }
        } catch (e) {
          databases.push({ id: i, keys: 0, expires: 0, avgTTL: 0, selected: false, error: e.message });
        }
      }
      
      return databases;
    } finally {
      if (client) client.disconnect();
    }
  }

  static calculateHitRate(statsInfo) {
    const hits = parseInt(statsInfo.keyspace_hits) || 0;
    const misses = parseInt(statsInfo.keyspace_misses) || 0;
    const total = hits + misses;
    return total > 0 ? ((hits / total) * 100).toFixed(2) + '%' : '0%';
  }

  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  static formatTTL(seconds) {
    if (seconds < 0) return 'No expiry';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  static async testConnection(config = {}) {
    let client;
    try {
      client = this.getClient(config);
      await client.connect();
      const pong = await client.ping();
      return { success: true, message: pong };
    } catch (error) {
      return { success: false, message: error.message };
    } finally {
      if (client) client.disconnect();
    }
  }
}

module.exports = RedisManagerService;
