const db = require('../config/db');

async function migratePackagesOwner() {
    try {
        // Add owner_id column if not exists
        const [cols] = await db.query("SHOW COLUMNS FROM packages LIKE 'owner_id'");
        if (cols.length === 0) {
            await db.query('ALTER TABLE packages ADD COLUMN owner_id INT DEFAULT NULL AFTER price');
            console.log('[MIGRATE] Added owner_id column to packages');
        } else {
            console.log('[MIGRATE] owner_id column already exists');
        }

        // Add status column if not exists
        const [statusCols] = await db.query("SHOW COLUMNS FROM packages LIKE 'status'");
        if (statusCols.length === 0) {
            await db.query("ALTER TABLE packages ADD COLUMN status ENUM('active','inactive') DEFAULT 'active' AFTER owner_id");
            console.log('[MIGRATE] Added status column to packages');
        }

        // Add created_at if not exists
        const [dateCols] = await db.query("SHOW COLUMNS FROM packages LIKE 'created_at'");
        if (dateCols.length === 0) {
            await db.query('ALTER TABLE packages ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER status');
            console.log('[MIGRATE] Added created_at column to packages');
        }

        console.log('[MIGRATE] Packages migration done');
    } catch (err) {
        console.error('[MIGRATE] Packages error:', err.message);
    } finally {
        process.exit();
    }
}

migratePackagesOwner();
