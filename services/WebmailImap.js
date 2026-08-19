const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");

class WebmailImap {

    static _getClient(session) {
        return new ImapFlow({
            host: session.imapHost || 'localhost',
            port: parseInt(session.imapPort) || 993,
            secure: session.imapSecure !== false,
            auth: {
                user: session.userEmail,
                pass: session.userPassword
            },
            timeout: 10000,
            tls: {
                rejectUnauthorized: false
            },
            logger: false
        });
    }

    static async _withLock(session, fn) {
        let client;
        let lock;
        try {
            client = this._getClient(session);
            await client.connect();
            lock = await client.getMailboxLock("INBOX");
            return await fn(client, lock);
        } catch (err) {
            throw err;
        } finally {
            if (lock) lock.release();
            if (client) {
                try { await client.logout(); } catch {}
            }
        }
    }

    static async testConnection(session) {
        let client;
        try {
            client = this._getClient(session);
            await client.connect();
            await client.logout();
            return { success: true };
        } catch (err) {
            if (client) {
                try { await client.logout(); } catch {}
            }
            return { success: false, error: err.message };
        }
    }

    static _extractMessageId(id) {
        if (!id) return '';
        return id.replace(/[<>]/g, '').trim();
    }

    static _buildThreadMap(emails) {
        const threads = {};
        const emailByMsgId = {};

        emails.forEach(function(email) {
            const msgId = email.messageId || ('uid-' + email.uid);
            emailByMsgId[msgId] = email;
            email._msgId = msgId;
        });

        const threadByMsgId = {};

        function findRoot(msgId) {
            while (threadByMsgId[msgId] && threadByMsgId[msgId] !== msgId) {
                msgId = threadByMsgId[msgId];
            }
            return msgId;
        }

        function merge(msgId1, msgId2) {
            const r1 = findRoot(msgId1);
            const r2 = findRoot(msgId2);
            if (r1 !== r2) {
                threadByMsgId[r2] = r1;
            }
        }

        emails.forEach(function(email) {
            const msgId = email._msgId;
            threadByMsgId[msgId] = msgId;
        });

        emails.forEach(function(email) {
            const msgId = email._msgId;
            const inReplyTo = email.inReplyTo || '';
            const references = email.references || [];

            if (inReplyTo && emailByMsgId[inReplyTo]) {
                merge(msgId, inReplyTo);
            }

            if (references.length > 0) {
                references.forEach(function(ref) {
                    if (emailByMsgId[ref]) {
                        merge(msgId, ref);
                    }
                });
            }
        });

        emails.forEach(function(email) {
            const msgId = email._msgId;
            const cleanSubject = (email.subject || '').replace(/^((?:Re|Fwd|Fw|Reply|Balas)[\s:]+)/i, '').trim().toLowerCase();
            if (!cleanSubject) return;

            for (let i = 0; i < emails.length; i++) {
                const other = emails[i];
                if (other.uid === email.uid) continue;
                const otherClean = (other.subject || '').replace(/^((?:Re|Fwd|Fw|Reply|Balas)[\s:]+)/i, '').trim().toLowerCase();
                if (cleanSubject === otherClean) {
                    merge(msgId, other._msgId);
                    break;
                }
            }
        });

        const grouped = {};
        emails.forEach(function(email) {
            const rootId = findRoot(email._msgId);
            if (!grouped[rootId]) grouped[rootId] = [];
            grouped[rootId].push(email);
        });

        Object.keys(grouped).forEach(function(rootId) {
            grouped[rootId].sort(function(a, b) {
                return new Date(a.date) - new Date(b.date);
            });
        });

        const result = [];
        Object.keys(grouped).forEach(function(rootId) {
            const msgs = grouped[rootId];
            const lastMsg = msgs[msgs.length - 1];
            const hasUnread = msgs.some(function(m) { return !m.seen; });
            const participants = [];
            const seenParticipants = {};
            msgs.forEach(function(m) {
                [m.from].concat(m.to || []).forEach(function(addr) {
                    if (addr && !seenParticipants[addr]) {
                        seenParticipants[addr] = true;
                        participants.push(addr);
                    }
                });
            });

            result.push({
                threadId: rootId,
                count: msgs.length,
                subject: lastMsg.subject,
                lastFrom: lastMsg.fromName || lastMsg.from,
                lastDate: lastMsg.date,
                seen: !hasUnread,
                hasUnread: hasUnread,
                preview: lastMsg.preview || '',
                emails: msgs,
                participants: participants
            });
        });

        result.sort(function(a, b) {
            return new Date(b.lastDate) - new Date(a.lastDate);
        });

        return result;
    }

    static _parseHeaders(rawHeaders) {
        const result = { messageId: '', inReplyTo: '', references: [] };

        if (!rawHeaders) return result;

        const folded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ');
        const lines = folded.split(/\r?\n/);

        for (const line of lines) {
            if (/^message-id:/i.test(line)) {
                const m = line.match(/message-id:\s*(.+)/i);
                if (m) result.messageId = m[1].replace(/[<>]/g, '').trim();
            } else if (/^in-reply-to:/i.test(line)) {
                const m = line.match(/in-reply-to:\s*(.+)/i);
                if (m) result.inReplyTo = m[1].replace(/[<>]/g, '').trim();
            } else if (/^references:/i.test(line)) {
                const m = line.match(/references:\s*(.+)/i);
                if (m) {
                    const ids = m[1].match(/<[^>]+>/g) || [];
                    result.references = ids.map(function(r) { return r.replace(/[<>]/g, '').trim(); });
                }
            }
        }

        return result;
    }

    static async getInbox(session) {
        return await this._withLock(session, async (client) => {
            const emails = [];
            const exists = client.mailbox ? client.mailbox.exists : 0;
            if (exists === 0) return { threads: [], total: 0 };

            for await (const msg of client.fetch("1:*", {
                uid: true,
                envelope: true,
                flags: true,
                bodyStructure: true
            })) {
                let messageId = '';
                let inReplyTo = '';
                let references = [];

                if (msg.envelope) {
                    messageId = (msg.envelope.messageId || '').replace(/[<>]/g, '').trim();

                    if (msg.envelope.inReplyTo) {
                        inReplyTo = msg.envelope.inReplyTo.replace(/[<>]/g, '').trim();
                    }
                }

                emails.push({
                    uid: msg.uid,
                    from: msg.envelope.from && msg.envelope.from.length
                        ? msg.envelope.from[0].address : "",
                    fromName: msg.envelope.from && msg.envelope.from.length
                        ? msg.envelope.from[0].name : "",
                    to: msg.envelope.to && msg.envelope.to.length
                        ? msg.envelope.to.map(function(t) { return t.address; }) : [],
                    subject: msg.envelope.subject || "(No Subject)",
                    date: msg.envelope.date,
                    seen: msg.flags && msg.flags.has("\\Seen"),
                    preview: msg.envelope.subject || "",
                    messageId: messageId,
                    inReplyTo: inReplyTo,
                    references: references
                });
            }

            const threads = this._buildThreadMap(emails.reverse());
            return { threads: threads, total: emails.length };
        });
    }

    static async getThread(session, threadId, emails) {
        return await this._withLock(session, async (client) => {
            const result = [];
            for (const email of emails) {
                const msg = await client.fetchOne(email.uid, {
                    source: true,
                    uid: true,
                    envelope: true,
                    flags: true
                }, { uid: true });
                if (!msg) continue;
                const parsed = await simpleParser(msg.source);
                parsed.uid = email.uid;
                parsed.seen = msg.flags && msg.flags.has("\\Seen");
                result.push(parsed);
            }
            return result;
        });
    }

    static async getEmail(session, uid) {
        return await this._withLock(session, async (client) => {
            const msg = await client.fetchOne(uid, {
                source: true,
                uid: true,
                envelope: true,
                flags: true
            }, { uid: true });
            if (!msg) throw new Error("Email not found");
            const parsed = await simpleParser(msg.source);
            parsed.uid = uid;
            parsed.seen = msg.flags && msg.flags.has("\\Seen");
            return parsed;
        });
    }

    static async markSeen(session, uid) {
        return await this._withLock(session, async (client) => {
            await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        });
    }

    static async markUnseen(session, uid) {
        return await this._withLock(session, async (client) => {
            await client.messageFlagsDelete(uid, ["\\Seen"], { uid: true });
        });
    }

    static async deleteEmail(session, uid) {
        return await this._withLock(session, async (client) => {
            await client.messageDelete(uid, { uid: true });
        });
    }

    static async deleteEmails(session, uids) {
        return await this._withLock(session, async (client) => {
            await client.messageDelete(uids, { uid: true });
        });
    }
}

module.exports = WebmailImap;
