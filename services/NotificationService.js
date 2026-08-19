const { sendMail } = require('./EmailService');
const SettingsService = require('./SettingsService');

class NotificationService {

    static async sendSystemEmail({ to, subject, html }) {
        const settings = await SettingsService.getAll();
        const hostname = settings.mail_hostname || 'mail.localhost';
        const systemEmail = settings.system_email || `noreply@${hostname}`;

        const smtpSession = {
            userEmail: systemEmail,
            smtpHost: hostname,
            smtpPort: 25,
            smtpSecure: false,
            smtpUser: systemEmail,
            smtpPass: ''
        };

        return await sendMail(smtpSession, {
            to,
            subject,
            html
        });
    }

    static async sendInstallSuccess({ to, domain, appType, credentials }) {
        const settings = await SettingsService.getAll();
        const hostname = settings.mail_hostname || 'mrpanel.my.id';

        const subject = `[MR Panel] ${appType} berhasil diinstall di ${domain}`;

        let credentialRows = '';
        if (credentials) {
            for (const [key, val] of Object.entries(credentials)) {
                credentialRows += `<tr><td style="padding:6px 12px;border:1px solid #ddd;font-weight:bold">${key}</td><td style="padding:6px 12px;border:1px solid #ddd;font-family:monospace">${val}</td></tr>`;
            }
        }

        const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#2563eb;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                <h2 style="margin:0">✅ ${appType} Installed</h2>
            </div>
            <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px">
                <p>Hello,</p>
                <p><strong>${appType}</strong> berhasil diinstall di domain <code>${domain}</code>.</p>
                
                <h3 style="margin-top:20px">Detail Installasi:</h3>
                <table style="border-collapse:collapse;width:100%">
                    <tr><td style="padding:6px 12px;border:1px solid #ddd;font-weight:bold">Domain</td><td style="padding:6px 12px;border:1px solid #ddd"><a href="http://${domain}">${domain}</a></td></tr>
                    <tr><td style="padding:6px 12px;border:1px solid #ddd;font-weight:bold">Tipe</td><td style="padding:6px 12px;border:1px solid #ddd">${appType}</td></tr>
                    ${credentialRows}
                </table>

                <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px;margin-top:20px">
                    <strong>⚠️ Simpan informasi ini dengan aman!</strong>
                </div>

                <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0">
                <p style="color:#94a3b8;font-size:12px">Email ini dikirim otomatis oleh MR Panel (${hostname})</p>
            </div>
        </div>`;

        return await this.sendSystemEmail({ to, subject, html });
    }
}

module.exports = NotificationService;
