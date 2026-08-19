const socket = require("./socket");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");

let client = null;
let idleStarted = false;

function getClient(config) {
    return new ImapFlow({
        host: config.host || 'localhost',
        port: parseInt(config.port) || 993,
        secure: config.secure !== false,
        auth: {
            user: config.user,
            pass: config.pass
        },
        timeout: 10000,
        tls: {
            rejectUnauthorized: false
        }
    });
}

async function connect(config) {
    client = getClient(config);
    await client.connect();
    console.log("IMAP Connected:", config.user);
}

async function disconnect() {
    if (client && client.usable) {
        await client.logout();
    }
}

module.exports = {
    getClient,
    connect,
    disconnect
};
