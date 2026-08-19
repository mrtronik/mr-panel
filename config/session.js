const MySQLStore = require('express-mysql-session')(require('express-session'));
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2');

const connection = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});

const sessionStore = new MySQLStore({}, connection);

module.exports = {
    store: sessionStore,
    lifetime: Number(process.env.SESSION_LIFETIME || 1440),
    secure: process.env.APP_ENV === 'production'
};
