#!/bin/bash
# ══════════════════════════════════════════════
#  openlitespeed.sh — Install & configure OLS + PowerDNS
# ══════════════════════════════════════════════

banner "Langkah ke 5 dari 9: Instalasi WebServer + DNS"


# ─── Composer ─────────────────────────────────
if command -v composer &>/dev/null; then
    sukses "Composer sudah Aktif : $(composer --version | head -n 1)"
else
    proses "Menginstall Composer..."

    cd /tmp

    curl -sS https://getcomposer.org/installer -o composer-setup.php >> "$LOG_FILE" 2>&1

    if [ ! -f composer-setup.php ]; then
        error "Gagal download Composer installer"
    fi

    php composer-setup.php --install-dir=/usr/local/bin --filename=composer >> "$LOG_FILE" 2>&1

    rm -f composer-setup.php

    sukses "Composer sudah Aktif : $(composer --version | head -n 1)"
fi


# ─── ionCube Loader ────────────────────────────
PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || echo "8.2")
PHP_EXT_DIR=$(php -r 'echo PHP_EXTENSION_DIR;' 2>/dev/null)
ARCH=$(uname -m)

if php -m 2>/dev/null | grep -qi ioncube; then
    sukses "ionCube Loader sudah Aktif"
else
    proses "Menginstall ionCube Loader..."
    cd /tmp
    if [ "$ARCH" = "aarch64" ]; then
        IONCUBE_URL="https://downloads.ioncube.com/loader_downloads/ioncube_loaders_lin_aarch64.tar.gz"
    else
        IONCUBE_URL="https://downloads.ioncube.com/loader_downloads/ioncube_loaders_lin_x86-64.tar.gz"
    fi
    if wget -q "$IONCUBE_URL" >> "$LOG_FILE" 2>&1 && \
       tar xzf ioncube_loaders_lin_*.tar.gz >> "$LOG_FILE" 2>&1 && \
       [ -n "$PHP_EXT_DIR" ]; then
        cp ioncube/ioncube_loader_lin_${PHP_VER}.so "$PHP_EXT_DIR/" 2>/dev/null || true
        for ini in /etc/php/*/fpm/php.ini /etc/php/*/cli/php.ini; do
            if [ -f "$ini" ] && ! grep -q "ioncube_loader" "$ini" 2>/dev/null; then
                sed -i "1i zend_extension=ioncube_loader_lin_${PHP_VER}.so" "$ini"
            fi
        done
        systemctl restart php${PHP_VER}-fpm 2>/dev/null || true
        sukses "ionCube Loader installed (PHP ${PHP_VER})"
    else
        sukses "ionCube Loader skipped (download gagal, bisa diinstall manual nanti)"
    fi
    rm -rf /tmp/ioncube*
fi


# ─── PowerDNS Authoritative Server ─────────────
PDNS_API_KEY="mrpanel-$(openssl rand -hex 16)"

if command -v pdns_server &>/dev/null; then
    sukses "PowerDNS sudah Aktif: $(pdns_server --version 2>&1 | head -1)"
else
    proses "Menginstall PowerDNS..."
    apt-get update >> "$LOG_FILE" 2>&1
    apt-get install -y pdns-server pdns-backend-mysql >> "$LOG_FILE" 2>&1
    sukses "PowerDNS terinstall"
fi

# ─── Configure PowerDNS with MySQL backend ─────
proses "Mengkonfigurasi PowerDNS..."

# Stop PowerDNS first
systemctl stop pdns >> "$LOG_FILE" 2>&1 || true

# Create PowerDNS MySQL database and schema
mysql -u root -p"${MYSQL_ROOT_PASS}" -e "
    CREATE DATABASE IF NOT EXISTS powerdns CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
" >> "$LOG_FILE" 2>&1

# Create tables using IF NOT EXISTS
mysql -u root -p"${MYSQL_ROOT_PASS}" powerdns -e "
    CREATE TABLE IF NOT EXISTS domains (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        master VARCHAR(128) DEFAULT NULL,
        last_check INT DEFAULT NULL,
        notified_serial INT DEFAULT NULL,
        type VARCHAR(6) NOT NULL,
        options VARCHAR(255) DEFAULT NULL,
        catalog VARCHAR(255) DEFAULT NULL,
        UNIQUE KEY name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS records (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        domain_id INT DEFAULT NULL,
        name VARCHAR(255) DEFAULT NULL,
        type VARCHAR(10) DEFAULT NULL,
        content VARCHAR(64000) DEFAULT NULL,
        ttl INT DEFAULT NULL,
        prio INT DEFAULT NULL,
        disabled TINYINT(1) DEFAULT 0,
        ordername VARCHAR(255) DEFAULT NULL,
        auth TINYINT(1) DEFAULT 1,
        UNIQUE KEY rec_name_index (domain_id, name, type),
        KEY domain_id (domain_id),
        KEY ordername (domain_id, ordername),
        CONSTRAINT records_domain_id FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS supermasters (
        ip VARCHAR(64) NOT NULL,
        nameserver VARCHAR(255) NOT NULL,
        account VARCHAR(40) NOT NULL,
        UNIQUE KEY ip_nameserver (ip, nameserver)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS domainmetadata (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_id INT NOT NULL,
        kind VARCHAR(32) NOT NULL,
        content TEXT NOT NULL,
        KEY domainmetadata_idx (domain_id, kind),
        CONSTRAINT domainmetadata_domain_id FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS cryptokeys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_id INT NOT NULL,
        flags INT NOT NULL,
        active TINYINT(1) DEFAULT 0,
        content TEXT,
        CONSTRAINT cryptokeys_domain_id FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS tsigkeys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        algorithm VARCHAR(50) NOT NULL,
        secret VARCHAR(255) NOT NULL,
        UNIQUE KEY namealgorithm (name, algorithm)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(10) NOT NULL,
        modified_at INT NOT NULL,
        account VARCHAR(40) NOT NULL,
        comment TEXT NOT NULL,
        KEY domain_id (domain_id),
        CONSTRAINT comments_domain_id FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
" >> "$LOG_FILE" 2>&1
sukses "PowerDNS database schema ready"

# Write pdns.conf
cat > /etc/powerdns/pdns.conf << PDNSEOF
# PowerDNS Authoritative Server Configuration
# Generated by MR Panel Installer

# MySQL Backend
launch=gmysql
gmysql-host=127.0.0.1
gmysql-port=3306
gmysql-dbname=powerdns
gmysql-user=root
gmysql-password=${MYSQL_ROOT_PASS}
gmysql-dnssec=no

# Server Settings
local-address=0.0.0.0
local-port=53
guardian=no
daemon=no
write-pid=yes

# Logging
loglevel=4
query-logging=no

# Webserver/API
webserver=yes
webserver-address=0.0.0.0
webserver-port=8081
webserver-allow-from=127.0.0.1/32
webserver-password=
api=yes
api-key=${PDNS_API_KEY}

# Security
default-soa-name=ns1
default-soa-mail=admin
PDNSEOF

# Remove BIND9 config conflict if exists
rm -f /etc/powerdns/pdns.d/bind.conf >> "$LOG_FILE" 2>&1 || true

# Fix permissions
chown -R pdns:pdns /etc/powerdns >> "$LOG_FILE" 2>&1 || true
chmod 640 /etc/powerdns/pdns.conf >> "$LOG_FILE" 2>&1 || true

# Start PowerDNS
systemctl enable pdns >> "$LOG_FILE" 2>&1
systemctl restart pdns >> "$LOG_FILE" 2>&1
sukses "PowerDNS dikonfigurasi dan dijalankan (API: port 8081)"


# ─── Install OpenLiteSpeed ─────────────────────
if [ -f /usr/local/lsws/bin/lswsctrl ]; then
    sukses "WebServer sudah Aktif"
else
    proses "Menginstall WebServer..."

    apt-get update >> "$LOG_FILE" 2>&1
    apt-get install -y openlitespeed >> "$LOG_FILE" 2>&1

    sukses "WebServer sudah Aktif"
fi


# ─── Start OpenLiteSpeed ───────────────────────
proses "Menjalankan WebServer..."

systemctl enable lshttpd >> "$LOG_FILE" 2>&1 || true
systemctl restart lshttpd >> "$LOG_FILE" 2>&1 || true

sukses "WebServer sudah Jalan"

# ─── Set admin password ───────────────────────
proses "Membuat password WebServer..."
OLS_ADMIN_PASS=$(openssl rand -hex 8)
cat > /usr/local/lsws/conf/htpasswd << EOF
mrpanel:${OLS_ADMIN_PASS}
EOF
chown lsadm:nogroup /usr/local/lsws/conf/htpasswd
sukses "WebServer Admin password: $OLS_ADMIN_PASS"

# ─── Create vhosts directory ──────────────────
mkdir -p /usr/local/lsws/conf/vhosts
chown -R lsadm:nogroup /usr/local/lsws/conf/vhosts

# ─── Create document roots directory ──────────
mkdir -p /home/public_html
chown -R lsadm:nogroup /home/public_html

# ─── Create default vhost template ────────────
cat > /usr/local/lsws/conf/vhosts/Example/vhconf.conf << 'EOF'
docRoot $VH_ROOT/html/

index {
  useServer               0
  indexFiles              index.php, index.html
}

accessControl {
  deny
  allow *
}

errorlog $VH_ROOT/logs/error.log {
  logLevel                DEBUG
  rollingSize             10M
  useServer               1
}

accessLog $VH_ROOT/logs/access.log {
  compressArchive         0
  logReferer              1
  keepDays                30
  rollingSize             10M
  logUserAgent            1
  useServer               0
}

rewrite {
  enable                  1
  autoLoadHtaccess        1
}
EOF

mkdir -p /usr/local/lsws/conf/vhosts/Example/html
echo "<h1>OpenLiteSpeed is running</h1>" > /usr/local/lsws/conf/vhosts/Example/html/index.html
chown -R lsadm:nogroup /usr/local/lsws/conf/vhosts/Example

# ─── Reload OLS ───────────────────────────────
/usr/local/lsws/bin/lswsctrl reload >> "$LOG_FILE" 2>&1 || true

# ─── OpenDKIM for email authentication ────────
proses "Menginstall OpenDKIM..."
apt-get install -y opendkim opendkim-tools >> "$LOG_FILE" 2>&1

mkdir -p /etc/opendkim/keys
cat > /etc/opendkim.conf << 'OPENDKIM_CONF'
AutoRestart          Yes
AutoRestartRate      10/1M
Background           Yes
Canonicalization     relaxed/simple
ExternalIgnoreList   refile:/etc/opendkim/TrustedHosts
InternalHosts        refile:/etc/opendkim/TrustedHosts
KeyTable             refile:/etc/opendkim/KeyTable
SigningTable         refile:/etc/opendkim/SigningTable
LogWhy               Yes
Mode                 sv
PidFile              /run/opendkim/opendkim.pid
SignatureAlgorithm   rsa-sha256
Socket               inet:8891@localhost
Syslog               Yes
SyslogSuccess        Yes
TemporaryDirectory   /var/tmp
UMask                007
UserID               opendkim:opendkim
OPENDKIM_CONF

cat > /etc/opendkim/TrustedHosts << 'EOF'
127.0.0.1
localhost
EOF

touch /etc/opendkim/KeyTable
touch /etc/opendkim/SigningTable

chown -R opendkim:opendkim /etc/opendkim
systemctl enable opendkim
systemctl start opendkim

# Configure Postfix for DKIM signing (only if Postfix is installed)
if command -v postconf &>/dev/null; then
    postconf -e "milter_default_action = accept"
    postconf -e "milter_protocol = 6"
    postconf -e "smtpd_milters = inet:localhost:8891"
    postconf -e "non_smtpd_milters = inet:localhost:8891"
    systemctl restart postfix 2>/dev/null || true
    sukses "OpenDKIM installed and configured"
else
    sukses "OpenDKIM installed (Postfix not found — configure manually)"
fi

echo ""
