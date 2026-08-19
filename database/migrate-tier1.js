const db = require('../config/db');

async function migrate() {
    console.log('Creating Tier 1 feature tables...');

    // Subdomains
    await db.execute(`
        CREATE TABLE IF NOT EXISTS subdomains (
            id INT AUTO_INCREMENT PRIMARY KEY,
            website_id INT NOT NULL,
            subdomain VARCHAR(255) NOT NULL,
            target_folder VARCHAR(255) NOT NULL,
            document_root VARCHAR(500),
            status ENUM('active','suspended') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
        )
    `);
    console.log('  ✓ subdomains');

    // Parked Domains
    await db.execute(`
        CREATE TABLE IF NOT EXISTS parked_domains (
            id INT AUTO_INCREMENT PRIMARY KEY,
            website_id INT NOT NULL,
            parked_domain VARCHAR(255) NOT NULL,
            status ENUM('active','suspended') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
        )
    `);
    console.log('  ✓ parked_domains');

    // Email Forwarders
    await db.execute(`
        CREATE TABLE IF NOT EXISTS forwarders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email_account_id INT NOT NULL,
            destination VARCHAR(255) NOT NULL,
            status ENUM('active','suspended') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (email_account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
        )
    `);
    console.log('  ✓ forwarders');

    console.log('Migration complete!');
}

migrate().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
