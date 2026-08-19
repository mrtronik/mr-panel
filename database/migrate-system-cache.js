const db = require('../config/db');

async function migrateSystemCache() {
  console.log('Creating system_cache table...');

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS system_cache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cache_key VARCHAR(100) UNIQUE NOT NULL,
        cache_value LONGTEXT,
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cache_key (cache_key),
        INDEX idx_cached_at (cached_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ system_cache table created');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('  ℹ system_cache table already exists');
    } else {
      console.error('  ✗ Error creating system_cache:', error.message);
    }
  }

  console.log('System cache migration completed!');
}

if (require.main === module) {
  migrateSystemCache().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrateSystemCache;
