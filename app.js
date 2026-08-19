require('dotenv').config();
const express = require('express');
const app = express();
const session = require('express-session');
const web = require('./routes/web');
const api = require('./routes/api'); 
const expressLayouts = require('express-ejs-layouts');
 
app.disable('x-powered-by');

app.use((req, res, next) => {
    res.setHeader('X-MR-Platform', 'MR Projects');
    next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionConfig = require('./config/session');

app.use(session({
    store: sessionConfig.store,
    secret: process.env.APP_KEY,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: sessionConfig.secure,
        maxAge: sessionConfig.lifetime * 60 * 1000
    }
}));
// expose session ke semua EJS
app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

// CSRF protection
const { generateToken } = require('./middleware/csrf');
app.use(generateToken);

// Load global settings
const loadSettings = require('./middleware/loadSettings');
app.use(loadSettings);

// Security headers (HSTS only when panel is HTTPS-enabled)
app.use(async (req, res, next) => {
    if (req.secure) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        try {
            const SystemSettingsService = require('./services/SystemSettingsService');
            const enabled = await SystemSettingsService.getPanelSslEnabled();
            if (enabled) {
                res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
            }
        } catch (e) {}
    }
    next();
});

app.use(expressLayouts);
app.set('layout', 'layouts/app');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);
app.set('view engine', 'ejs');
app.use(express.static('public'));
const path = require('path');

app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));
app.use('/', web);
app.use('/api', api);

 
const http = require("http");
const https = require("https");
const fs = require("fs");

async function createPanelServer() {
    let panelServer;
    try {
        const SystemSettingsService = require('./services/SystemSettingsService');
        const enabled = await SystemSettingsService.getPanelSslEnabled();
        const domain = await SystemSettingsService.getPanelDomain();

        if (enabled && domain) {
            const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
            const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;
            if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
                const credentials = {
                    key: fs.readFileSync(keyPath),
                    cert: fs.readFileSync(certPath)
                };
                panelServer = https.createServer(credentials, app);
                console.log(`Panel HTTPS enabled on port 1708 for ${domain}`);
            } else {
                console.log('Panel SSL enabled but cert not found, falling back to HTTP');
                panelServer = http.createServer(app);
            }
        } else {
            panelServer = http.createServer(app);
        }
    } catch (e) {
        console.log('Panel HTTPS setup failed, using HTTP:', e.message);
        panelServer = http.createServer(app);
    }
    return panelServer;
}

(async () => {
    const panelServer = await createPanelServer();

    const { Server } = require("socket.io");

    const io = new Server(panelServer);
    const socket = require("./socket");

    socket.setIO(io);

    const { initTerminalSocket } = require("./terminalSocket");
    initTerminalSocket(io);

    const { initMonitorSocket } = require("./monitorSocket");
    initMonitorSocket(io);

    process.on('unhandledRejection', (err) => {
        console.error('Unhandled rejection:', err.message);
    });

    process.on('uncaughtException', (err) => {
        console.error('Uncaught exception:', err.message);
    });

    panelServer.listen(1708, () => {
        console.log("Server jalan...");
    });
})();