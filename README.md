<div align="center">

# ⚡ MR Panel

### Modern Hosting Control Panel

**Self-hosted, open-source alternative to cPanel & Plesk**

Built with Node.js, OpenLiteSpeed, PowerDNS, MariaDB & more.

[![Version](https://img.shields.io/badge/version-1.1.0-blue?style=for-the-badge)](https://github.com/mrtronik/mr-panel)
[![License](https://img.shields.io/badge/license-ISC-green?style=for-the-badge)](https://github.com/mrtronik/mr-panel)
[![Node](https://img.shields.io/badge/node.js-22.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Ubuntu](https://img.shields.io/badge/ubuntu-22.04%20%7C%2024.04-E95420?style=for-the-badge&logo=ubuntu&logoColor=white)](https://ubuntu.com)
[![Architecture](https://img.shields.io/badge/arch-x86__64%20%7C%20aarch64-blueviolet?style=for-the-badge)](https://github.com/mrtronik/mr-panel)

![Dashboard](https://img.shields.io/badge/-Dashboard%20Preview-grey?style=for-the-badge)

```
┌─────────────────────────────────────────────────────────┐
│  🖥️  MR Panel v1.1                                      │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│ Website  │  Email   │   DNS    │ Database │   Files     │
│ 🌐      │  📧      │   🔗     │ 🗄️      │   📁        │
├──────────┼──────────┼──────────┼──────────┼─────────────┤
│   SSL    │ Security │ Monitor  │  Backup  │   Apps      │
│ 🔒      │ 🛡️      │ 📊      │ ☁️      │   📦        │
└──────────┴──────────┴──────────┴──────────┴─────────────┘
```

</div>

---

## 🚀 Features

### 🌐 Website Management
| | Feature |
|---|---|
| 📄 | **Website CRUD** — Add, delete, suspend, activate websites |
| ⚙️ | **PHP Version Selector** — Switch PHP version per website |
| 🔧 | **PHP Settings Editor** — Edit `php.ini` per site (memory, upload, etc.) |
| 📂 | **Document Root** — Configurable, auto-created on setup |
| 🏗️ | **OpenLiteSpeed** — High-performance web server with LSAPI |
| 🌍 | **Auto DNS Zone** — DNS zone created automatically per website |
| 📧 | **Auto Email Auth** — DKIM/SPF configured per domain |
| 🔗 | **Subdomains** — Create and manage subdomains |
| 🅿️ | **Parked Domains** — Domain alias support |

### 📧 Email
| | Feature |
|---|---|
| 📬 | **Built-in Webmail** — Full IMAP webmail client |
| 📨 | **Compose / Reply / Forward** — Send emails with attachments |
| 👤 | **Email Accounts** — Create, delete, change password, quota |
| ↪️ | **Email Forwarders** — Forward rules per account |
| 📋 | **Forwarding Rules** — Keyword, domain, and catch-all forwarding |
| 🔐 | **DKIM / SPF / DMARC** — Email authentication built-in |
| 📮 | **Postfix + Dovecot** — Full SMTP/IMAP/POP3 stack |

### 🔗 DNS
| | Feature |
|---|---|
| 🗂️ | **DNS Zone Management** — Create, delete, sync zones |
| 📝 | **DNS Records** — A, AAAA, CNAME, MX, TXT, NS, SRV, CAA |
| 🐘 | **PowerDNS** — Authoritative server with MySQL backend |
| 🔄 | **Zone Sync** — Import existing zones from PowerDNS |
| 🌐 | **PowerDNS API** — REST API on port 8081 |

### 🗄️ Database
| | Feature |
|---|---|
| 📊 | **Database Manager** — Browse tables, run SQL queries |
| 👤 | **DB Users** — Create, delete, grant/revoke privileges |
| 📥 | **Import/Export** — Upload `.sql` files, export databases |
| 🔍 | **Table Browser** — View structure, browse rows |
| ✏️ | **Row Editor** — Insert, update, delete rows |
| 📦 | **phpMyAdmin** — Install/remove via panel |

### 📁 File Manager
| | Feature |
|---|---|
| 📂 | **Web File Manager** — Browse, read, write files |
| 📤 | **File Upload** — Upload up to 500MB |
| 📦 | **Zip Extract** — Extract archives in-place |
| ✏️ | **File Editor** — Edit files directly in browser |
| 📋 | **Create/Rename/Move** — Full file operations |

### 🔒 SSL / TLS
| | Feature |
|---|---|
| 🔐 | **Let's Encrypt** — Free SSL via Certbot |
| 🔄 | **Auto-Renewal** — Automatic certificate renewal |
| 📋 | **Certificate Manager** — List, renew, delete certificates |
| 🌐 | **Panel SSL** — HTTPS for the panel itself |

### 🛡️ Security
| | Feature |
|---|---|
| 🦠 | **ClamAV Scanner** — File and directory malware scanning |
| 📦 | **Quarantine** — Isolate infected files |
| 🛡️ | **CSRF Protection** — Token-based on all forms |
| 🔐 | **Security Headers** — HSTS, X-Frame-Options, CSP |
| 🔥 | **UFW Firewall** — Pre-configured with essential ports |
| 📋 | **Scan Logs** — Full scan history with timestamps |

### 📊 Monitoring
| | Feature |
|---|---|
| 📈 | **Real-time Monitor** — Live CPU, RAM, disk, network |
| 📋 | **Process List** — View running processes |
| 🔍 | **System Info** — Detailed server information |
| ⚙️ | **Service Manager** — Start/stop/restart services |
| 📊 | **ApexCharts** — Beautiful dashboard charts |

### ☁️ Backup
| | Feature |
|---|---|
| 💾 | **Local Backup** — Create, restore, download |
| 📁 | **Google Drive** — OAuth2 integration |
| ⏰ | **Scheduled Backups** — Cron-based automation |
| 📊 | **Backup Stats** — View backup statistics |

### 📦 Application Installer
| | Feature |
|---|---|
| 🔵 | **WordPress** — One-click install + auto cache plugin |
| 🟢 | **Laravel** — One-click install + artisan commands |
| 🟠 | **phpBB** — One-click forum install |
| 🟣 | **Joomla** — One-click CMS install |
| 🐍 | **Python Apps** — Flask, Django, FastAPI with venv |

### 🛠️ WordPress Toolkit
| | Feature |
|---|---|
| 🔄 | **Core Updates** — Update WordPress to latest |
| 📦 | **Plugin Manager** — Activate/deactivate/update plugins |
| 🎨 | **Theme Manager** — Activate/deactivate/update themes |
| 📋 | **Auto-detect** — Scans all sites for WP installs |

### ⚡ More Features
| | Feature |
|---|---|
| 🔴 | **Redis Manager** — Key browser, flush, slow log |
| 🐍 | **PHP Manager** — Version install, ionCube, OPcache |
| 🕐 | **Cron Jobs** — System crontab management |
| 📊 | **Usage Tracking** — Disk/bandwidth per site |
| 📋 | **Activity Log** — Track all user actions |
| 💻 | **Web Terminal** — Browser-based SSH terminal |
| 🔗 | **WHMCS Integration** — Full server module + SSO |

---

## 📦 Tech Stack

<div align="center">

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 22.x |
| **Framework** | Express.js 5 |
| **Template** | EJS |
| **Database** | MariaDB 10.x |
| **Web Server** | OpenLiteSpeed |
| **DNS** | PowerDNS Authoritative |
| **Mail** | Postfix + Dovecot |
| **Cache** | Redis |
| **Antivirus** | ClamAV |
| **SSL** | Certbot (Let's Encrypt) |
| **PHP** | lsphp83 |
| **Process** | PM2 |
| **Real-time** | Socket.IO |
| **Firewall** | UFW |
| **Auth** | bcrypt + sessions |
| **Charts** | ApexCharts |
| **Icons** | Font Awesome 6 |

</div>

---

## 🖥️ Requirements

| Requirement | Minimum |
|---|---|
| 💻 **OS** | Ubuntu 22.04 / 24.04 (x86_64 or aarch64) |
| 🧠 **RAM** | 512MB (1GB+ recommended) |
| 💾 **Disk** | 10GB free space |
| 🌐 **Network** | Public IP with ports 80, 443, 53 open |
| 👤 **User** | Root access |

---

## ⚡ Quick Install

### One-liner Install

```bash
wget -qO /tmp/installer.sh https://raw.githubusercontent.com/mrtronik/mr-panel/main/install/installer.sh && bash /tmp/installer.sh
```

### Manual Install

```bash
# Clone repository
git clone --depth=1 https://github.com/mrtronik/mr-panel.git /tmp/mrpanel-src

# Run installer
bash /tmp/mrpanel-src/install/install.sh
```

### Install Options

```bash
bash install.sh --domain panel.example.com --port 1708
```

| Option | Description | Default |
|---|---|---|
| `--domain` | Panel domain for SSL | auto-detect IP |
| `--port` | Panel port | `1708` |
| `--password` | MySQL root password | random |
| `--src` | MR Panel source path | auto |

---

## 📁 Post-Install

After installation, you'll see:

```
==============================================================
              MR Panel Installation Complete!
==============================================================

  Panel URL    : https://your-ip:1708
  Admin User   : admin
  Admin Pass   : xxxxxxxxxxxxxxxx

  MySQL Root   : xxxxxxxxxxxxxxxx
  PowerDNS API : xxxxxxxxxxxxxxxx
  OLS Admin    : xxxxxxxxxxxxxxxx

==============================================================
```

### 1. Login to Panel

Open `https://your-server-ip:1708` in your browser.

### 2. Setup Nameservers

Point your domain's nameservers to:

```
ns1.your-domain.com → your-server-ip
ns2.your-domain.com → your-server-ip
```

### 3. Add Your First Website

1. Go to **Websites** → **Add Website**
2. Enter your domain name
3. Click **Create**
4. Upload files to `/home/public_html/your-domain.com`
5. Install SSL via **SSL** → **Request Certificate**

---

## 🔧 WHMCS Integration

### Install Module

```bash
# Copy module to WHMCS
cp -r whmcs-module/mrpanel /path/to/whmcs/modules/servers/

# Copy hooks
cp whmcs-module/mrpanel/hooks.php /path/to/whmcs/includes/hooks/
```

### Configure in WHMCS

1. Go to **Setup** → **Products/Services** → **Servers**
2. Add new server: Type = **MR Panel**
3. Enter panel URL, port, and API key
4. Go to **Setup** → **Products/Services** → **Products**
5. Link product to MR Panel server group

---

## 📂 Directory Structure

```
/home/public_html/
├── domain1.com/          # Website document root
│   ├── public_html/      # Web files
│   └── .mrpanel.json     # Panel metadata
├── domain2.com/
│   ├── public_html/
│   └── .mrpanel.json
└── ...

/usr/local/lsws/
├── conf/
│   ├── httpd_config.conf
│   └── vhosts/
│       ├── domain1.com/
│       │   └── vhconf.conf
│       └── domain2.com/
│           └── vhconf.conf
└── ...

/etc/powerdns/
├── pdns.conf
└── ...
```

---

## 🔌 API Endpoints

### Public
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/server-status` | Server status (unauthenticated) |

### Authenticated (requires session)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/website/add` | Add website |
| `DELETE` | `/api/website/delete/:id` | Delete website |
| `POST` | `/api/database/create` | Create database |
| `POST` | `/api/email/create` | Create email account |
| `POST` | `/api/backup/create` | Create backup |
| `POST` | `/api/ssl/request` | Request SSL certificate |
| `POST` | `/api/installer/wordpress` | Install WordPress |
| `POST` | `/api/installer/laravel` | Install Laravel |
| `POST` | `/api/installer/python` | Install Python app |
| ... | ... | ... |

### WHMCS API (requires API key)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/whmcs/create` | Provision account |
| `POST` | `/api/whmcs/terminate` | Terminate account |
| `POST` | `/api/whmcs/suspend` | Suspend account |
| `POST` | `/api/whmcs/usage` | Get usage stats |

---

## 🛡️ Security

- ✅ **SQL Injection** — Parameterized queries everywhere
- ✅ **Command Injection** — Input validation + `execFileSync`
- ✅ **XSS** — Email HTML sandboxed in `<iframe>`
- ✅ **CSRF** — Token-based on all forms
- ✅ **Password Logging** — Zero plaintext in logs
- ✅ **JWT** — Requires env secret, no defaults
- ✅ **Sessions** — httpOnly, sameSite, secure cookies
- ✅ **Firewall** — UFW with minimal open ports
- ✅ **DB Bind** — MariaDB bound to 127.0.0.1 only

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the **ISC License**.

---

## 🙏 Credits

Built with ❤️ by **MR Studio**

- [OpenLiteSpeed](https://openlitespeed.org/) — High-performance web server
- [PowerDNS](https://www.powerdns.com/) — Authoritative DNS server
- [MariaDB](https://mariadb.org/) — MySQL-compatible database
- [Postfix](http://www.postfix.org/) — Mail transfer agent
- [Dovecot](https://dovecot.org/) — IMAP/POP3 server
- [Redis](https://redis.io/) — In-memory data store
- [ClamAV](https://www.clamav.net/) — Antivirus engine
- [Certbot](https://certbot.eff.org/) — Let's Encrypt client
- [Node.js](https://nodejs.org/) — JavaScript runtime
- [Socket.IO](https://socket.io/) — Real-time communication
- [ApexCharts](https://apexcharts.com/) — Chart library
- [Font Awesome](https://fontawesome.com/) — Icon library

---

<div align="center">

**⭐ Star this repo if you find it useful!**

Made with ☕ and 💪 by MR Studio

</div>
