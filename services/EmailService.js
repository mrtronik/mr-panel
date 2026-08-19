const nodemailer = require('nodemailer');
const SettingsService = require('./SettingsService');

async function createTransporter(session) {
    const settings = await SettingsService.getAll();

    const relayHost = settings.smtp_relay_host;
    const relayPort = settings.smtp_relay_port;

    let host, port, secure, auth;

    if (relayHost && relayPort) {
        host = relayHost;
        port = parseInt(relayPort);
        secure = settings.smtp_relay_secure === 'true';
        if (settings.smtp_relay_user && settings.smtp_relay_pass) {
            auth = { user: settings.smtp_relay_user, pass: settings.smtp_relay_pass };
        }
    } else {
        host = session.smtpHost || settings.mail_hostname || 'localhost';
        port = parseInt(session.smtpPort) || 25;
        secure = session.smtpSecure !== undefined ? session.smtpSecure : false;
        if (session.smtpUser && session.smtpPass) {
            auth = { user: session.smtpUser, pass: session.smtpPass };
        }
    }

    const config = {
        host,
        port,
        secure,
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000
    };

    if (auth) config.auth = auth;

    console.log("SMTP CONFIG:", config);

    return nodemailer.createTransport(config);
}

async function sendMail(session, { from, to, subject, text, html, cc, bcc, attachments }) {
    const transport = await createTransporter(session);
    const info = await transport.sendMail({
        from: from || session.userEmail || 'noreply@localhost',
        to,
        subject,
        text,
        html,
        cc,
        bcc,
        attachments
    });
    return info;
}

async function verifyConnection(session) {
    const transport = await createTransporter(session);
    await transport.verify();
}

module.exports = { sendMail, verifyConnection };
