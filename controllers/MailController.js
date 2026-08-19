const WebmailImap = require("../services/WebmailImap");
const { sendMail, verifyConnection } = require("../services/EmailService");
const db = require("../config/db");

// =========================
// Inbox (legacy → redirect to webmail)
// =========================
exports.inbox = async (req, res) => {
    res.redirect("/webmail");
};

// =========================
// Webmail - Login Page
// =========================
exports.webmailLogin = (req, res) => {
    res.render("mail/webmail-login", {
        title: 'Webmail Login',
        error: req.query.error || '',
        email: req.query.email || ''
    });
};

// =========================
// Webmail - Auth (POST)
// =========================
exports.webmailAuth = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.render("mail/webmail-login", {
            title: 'Webmail Login',
            error: 'Email and password are required',
            email: email || ''
        });
    }

    // Validate domain must exist in websites table
    const domain = email.split('@')[1];
    if (!domain) {
        return res.render("mail/webmail-login", {
            title: 'Webmail Login',
            error: 'Invalid email format',
            email: email
        });
    }

    try {
        const [rows] = await db.query('SELECT domain FROM websites WHERE domain = ?', [domain]);
        if (rows.length === 0) {
            return res.render("mail/webmail-login", {
                title: 'Webmail Login',
                error: 'Domain "' + domain + '" is not registered on this server',
                email: email
            });
        }
    } catch (err) {
        return res.render("mail/webmail-login", {
            title: 'Webmail Login',
            error: 'Database error: ' + err.message,
            email: email
        });
    }

    const session = {
        userEmail: email,
        userPassword: password,
        imapHost: domain,
        imapPort: 993,
        imapSecure: true
    };

    const test = await WebmailImap.testConnection(session);
    if (!test.success) {
        return res.render("mail/webmail-login", {
            title: 'Webmail Login',
            error: 'Connection failed: ' + test.error,
            email: email
        });
    }

    req.session.userEmail = session.userEmail;
    req.session.userPassword = session.userPassword;
    req.session.imapHost = session.imapHost;
    req.session.imapPort = session.imapPort;
    req.session.imapSecure = session.imapSecure;
    req.session.smtpHost = session.imapHost;
    req.session.smtpPort = 25;
    req.session.smtpSecure = false;

    res.redirect("/webmail");
};

// =========================
// Webmail - Auto Login (token-based, no password in URL)
// =========================
exports.webmailAutoLogin = async (req, res) => {
    const { token } = req.query;
    if (!token) return res.redirect("/webmail/login?error=No token provided");

    const EmailAccountService = require('../services/EmailAccountService');
    const email = await EmailAccountService.consumeAutoLoginToken(token);
    if (!email) return res.redirect("/webmail/login?error=Invalid or expired token");

    // Get password from stored hash (for IMAP auth)
    const creds = await EmailAccountService.getAccountCredentials(email);
    if (!creds) return res.redirect("/webmail/login?error=Account not found");

    // Validate domain
    const domain = email.split('@')[1];
    if (!domain) return res.redirect("/webmail/login?error=Invalid email format");

    try {
        const [rows] = await db.query('SELECT domain FROM websites WHERE domain = ?', [domain]);
        if (rows.length === 0) {
            return res.redirect("/webmail/login?error=" + encodeURIComponent('Domain "' + domain + '" is not registered'));
        }
    } catch (err) {
        return res.redirect("/webmail/login?error=" + encodeURIComponent(err.message));
    }

    // Note: password_plain is no longer stored. IMAP login will use the password_hash.
    // For auto-login to work with IMAP, the user needs to enter password manually
    // or we use a different auth mechanism. For now, redirect to login with email pre-filled.
    return res.redirect("/webmail/login?email=" + encodeURIComponent(email) + "&info=Please login with your password");
};

// =========================
// Webmail - Logout
// =========================
exports.webmailLogout = (req, res) => {
    delete req.session.userEmail;
    delete req.session.userPassword;
    delete req.session.imapHost;
    delete req.session.imapPort;
    delete req.session.imapSecure;
    delete req.session.smtpHost;
    delete req.session.smtpPort;
    delete req.session.smtpSecure;
    res.redirect("/webmail/login");
};

// =========================
// Webmail - Inbox (main page)
// =========================
exports.webmail = async (req, res) => {
    if (!req.session.userEmail) {
        return res.redirect("/webmail/login");
    }

    try {
        const result = await WebmailImap.getInbox(req.session);
        const threads = result.threads || [];
        const totalEmails = result.total || 0;
        const unreadCount = threads.filter(t => t.hasUnread).length;
        res.render("mail/inbox", {
            title: 'Webmail Inbox',
            threads,
            emails: [],
            totalEmails,
            unreadCount,
            currentUser: req.session.userEmail
        });
    } catch (err) {
        console.log(err);
        delete req.session.userEmail;
        delete req.session.userPassword;
        res.redirect("/webmail/login?error=" + encodeURIComponent("Session expired: " + err.message));
    }
};

// =========================
// Webmail - Read Email by UID
// =========================
exports.readEmail = async (req, res) => {
    if (!req.session.userEmail) {
        return res.redirect("/webmail/login");
    }

    try {
        const uid = req.params.uid;
        const email = await WebmailImap.getEmail(req.session, uid);
        await WebmailImap.markSeen(req.session, uid);
        const result = await WebmailImap.getInbox(req.session);
        const unreadCount = result.threads.filter(function(t) { return t.hasUnread; }).length;
        res.render("mail/read", {
            title: email.subject || 'Read Email',
            email: {
                uid: email.uid,
                from: email.from ? email.from.text : '',
                fromAddress: email.from ? email.from.value[0].address : '',
                to: email.to ? email.to.text : '',
                subject: email.subject || '(No Subject)',
                date: email.date,
                text: email.text || '',
                html: email.html || '',
                attachments: email.attachments || []
            },
            uid,
            currentUser: req.session.userEmail,
            unreadCount
        });
    } catch (err) {
        console.log(err);
        res.redirect("/webmail?error=" + encodeURIComponent(err.message));
    }
};

// =========================
// Webmail - Read Thread
// =========================
exports.readThread = async (req, res) => {
    if (!req.session.userEmail) {
        return res.redirect("/webmail/login");
    }

    try {
        const threadId = req.params.threadId;
        let threadEmails = [];
        try {
            threadEmails = JSON.parse(decodeURIComponent(req.query.emails || '[]'));
        } catch (e) {
            threadEmails = [];
        }

        if (!threadEmails.length) {
            return res.redirect("/webmail");
        }

        const thread = await WebmailImap.getThread(req.session, threadId, threadEmails);
        for (const email of thread) {
            if (!email.seen) {
                await WebmailImap.markSeen(req.session, email.uid);
            }
        }

        const result = await WebmailImap.getInbox(req.session);
        const unreadCount = result.threads.filter(function(t) { return t.hasUnread; }).length;

        res.render("mail/thread", {
            title: thread[0] ? (thread[0].subject || 'Thread') : 'Thread',
            thread,
            threadId,
            currentUser: req.session.userEmail,
            unreadCount
        });
    } catch (err) {
        console.log(err);
        res.redirect("/webmail?error=" + encodeURIComponent(err.message));
    }
};

// =========================
// Webmail - Compose Page
// =========================
exports.composePage = async (req, res) => {
    if (!req.session.userEmail) {
        return res.redirect("/webmail/login");
    }

    res.render("mail/write", {
        title: 'Compose Email',
        currentUser: req.session.userEmail,
        prefill: {
            to: req.query.to || '',
            subject: req.query.subject || '',
            body: req.query.body || ''
        }
    });
};

// =========================
// API: Get Email by UID
// =========================
exports.getEmail = async (req, res) => {
    try {
        if (!req.session.userEmail) return res.status(401).json({ error: 'Not authenticated' });
        const email = await WebmailImap.getEmail(req.session, req.params.uid);
        await WebmailImap.markSeen(req.session, req.params.uid);
        res.json({
            success: true,
            email: {
                uid: email.uid,
                from: email.from ? email.from.text : '',
                to: email.to ? email.to.text : '',
                subject: email.subject || '(No Subject)',
                date: email.date,
                text: email.text || '',
                html: email.html || ''
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// =========================
// API: Delete Email
// =========================
exports.deleteEmail = async (req, res) => {
    try {
        if (!req.session.userEmail) return res.status(401).json({ error: 'Not authenticated' });
        const uids = req.body.uids || (req.body.uid ? [req.body.uid] : []);
        if (uids.length === 0) return res.status(400).json({ error: 'UID required' });
        const numericUids = uids.map(u => parseInt(u, 10)).filter(u => !isNaN(u));
        if (numericUids.length === 0) return res.status(400).json({ error: 'UID required' });
        await WebmailImap.deleteEmails(req.session, numericUids);
        const io = require('../socket').getIO();
        if (io) numericUids.forEach(u => io.emit('email-deleted', { uid: u }));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// =========================
// API: Mark Seen/Unseen
// =========================
exports.markSeen = async (req, res) => {
    try {
        if (!req.session.userEmail) return res.status(401).json({ error: 'Not authenticated' });
        const { uid, seen } = req.body;
        if (!uid) return res.status(400).json({ error: 'UID required' });
        if (seen) {
            await WebmailImap.markSeen(req.session, uid);
        } else {
            await WebmailImap.markUnseen(req.session, uid);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// =========================
// Detail Email (legacy page)
// =========================
exports.detail = async (req, res) => {
    try {
        if (!req.session.userEmail) return res.redirect("/webmail/login");
        const email = await WebmailImap.getEmail(req.session, req.params.uid);
        res.render("mail/detail", { title: 'Email Detail', email, uid: req.params.uid });
    } catch (err) {
        console.log(err);
        res.status(500).send(err.message);
    }
};

// =========================
// Compose Form
// =========================
exports.composeForm = async (req, res) => {
    const { to, subject } = req.query;
    res.render("mail/compose", {
        title: 'Compose Email',
        from: req.query.from || 'inbox',
        prefill: { to: to || '', subject: subject || '', body: '' }
    });
};

// =========================
// Reply Form
// =========================
exports.replyForm = async (req, res) => {
    try {
        if (!req.session.userEmail) return res.redirect("/webmail/login");
        const email = await WebmailImap.getEmail(req.session, req.params.uid);
        const replyTo = email.from ? email.from.value[0].address : '';
        const replySubject = email.subject ? `Re: ${email.subject.replace(/^Re:\s*/i, '')}` : 'Re: (No Subject)';
        res.render("mail/compose", {
            title: 'Reply Email',
            from: req.query.from || 'inbox',
            prefill: { to: replyTo, subject: replySubject, body: '' }
        });
    } catch (err) {
        console.log(err);
        res.status(500).send(err.message);
    }
};

// =========================
// API: Send Email
// =========================
exports.send = async (req, res) => {
    try {
        const { to, subject, text, cc, bcc } = req.body;
        if (!to || !subject) {
            return res.status(400).json({ error: 'To and Subject are required' });
        }

        const EmailAccountService = require('../services/EmailAccountService');
        const profile = await EmailAccountService.getAccountProfile(req.session.userEmail);
        const displayName = profile && profile.display_name ? profile.display_name : '';
        const signature = profile && profile.signature ? profile.signature : '';

        let body = text || '';
        if (signature && body) {
            body = body + '\n\n' + signature;
        } else if (signature) {
            body = signature;
        }

        const from = displayName
            ? `${displayName} <${req.session.userEmail}>`
            : req.session.userEmail;

        const attachments = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach(function(file) {
                attachments.push({
                    filename: file.originalname,
                    path: file.path
                });
            });
        }

        const smtpSession = {
            userEmail: req.session.userEmail,
            smtpHost: req.session.smtpHost,
            smtpPort: req.session.smtpPort || 25,
            smtpSecure: req.session.smtpSecure || false,
            smtpUser: req.session.userEmail,
            smtpPass: req.session.userPassword
        };

        const info = await sendMail(smtpSession, { from, to, subject, text: body, cc, bcc, attachments });
        res.json({ success: true, messageId: info.messageId });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
};

// =========================
// API: Latest Email
// =========================
exports.latest = async (req, res) => {
    try {
        if (!req.session.userEmail) return res.status(401).json({ error: 'Not authenticated' });
        const emails = await WebmailImap.getInbox(req.session);
        if (!emails.length) return res.json(null);
        res.json(emails[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// =========================
// Webmail - Settings Page
// =========================
exports.settings = async (req, res) => {
    if (!req.session.userEmail) {
        return res.redirect("/webmail/login");
    }

    try {
        const EmailAccountService = require('../services/EmailAccountService');
        const profile = await EmailAccountService.getAccountProfile(req.session.userEmail);
        const result = await WebmailImap.getInbox(req.session);
        const unreadCount = result.threads.filter(function(t) { return t.hasUnread; }).length;
        res.render("mail/settings", {
            title: 'Webmail Settings',
            profile,
            currentUser: req.session.userEmail,
            unreadCount
        });
    } catch (err) {
        console.log(err);
        res.redirect("/webmail");
    }
};

// =========================
// API: Update Profile (display_name, signature)
// =========================
exports.updateProfile = async (req, res) => {
    try {
        if (!req.session.userEmail) return res.status(401).json({ error: 'Not authenticated' });
        const EmailAccountService = require('../services/EmailAccountService');
        const { display_name, signature } = req.body;
        const result = await EmailAccountService.updateProfile(req.session.userEmail, display_name, signature);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
