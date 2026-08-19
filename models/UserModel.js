const db = require('../config/db');

exports.findByEmail = async (email) => {
    const [rows] = await db.execute(
        "SELECT * FROM users WHERE email = ?",
        [email]
    );
    return rows[0] || null;
};

exports.findByUsername = async (username) => {
    const [rows] = await db.execute(
        "SELECT * FROM users WHERE username = ?",
        [username]
    );
    return rows[0] || null;
};
