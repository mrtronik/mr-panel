const db = require('../config/db');
const bcrypt = require('bcrypt');

async function seed() {
    const password = await bcrypt.hash('11111111', 10);

    try {
        await db.execute(
            `INSERT INTO users (id, name, email, password)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                email = VALUES(email),
                password = VALUES(password)`,
            [1, 'Administrator', 'info@mrtronik.co.id', password]
        );

        console.log('✔ Admin berhasil dibuat');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seed();
