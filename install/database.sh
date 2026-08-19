#!/bin/bash
# ══════════════════════════════════════════════
#  database.sh — MariaDB setup
# ══════════════════════════════════════════════

banner "Langkah ke 3 dari 9: Database (MariaDB)"

# ─── Install MariaDB ─────────────────────────
if command -v mysql &>/dev/null; then
    sukses "MariaDB already installed: $(mysql --version)"
else
    proses "Menginstal MariaDB..."
    apt-get install -y -qq mariadb-server mariadb-client >> "$LOG_FILE" 2>&1
    sukses "MariaDB berhasil diinstall: $(mysql --version)"
fi

# ─── Start & enable ───────────────────────────
proses "Mengaktifkan MariaDB..."
systemctl enable mariadb >> "$LOG_FILE" 2>&1
systemctl start mariadb >> "$LOG_FILE" 2>&1
sukses "Layanan MariaDB Aktif"

# ─── Set root password ────────────────────────
proses "Menyiapkan password root MariaDB..."

mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASS}'; FLUSH PRIVILEGES;" >> "$LOG_FILE" 2>&1 || \
mysql -u root -e "SET PASSWORD FOR 'root'@'localhost' = PASSWORD('${MYSQL_ROOT_PASS}'); FLUSH PRIVILEGES;" >> "$LOG_FILE" 2>&1 || \

error "Could not set root password (may already be set)"

# ─── Create .my.cnf for root ─────────────────
cat > /root/.my.cnf << EOF
[client]
user=root
password=${MYSQL_ROOT_PASS}
EOF
chmod 600 /root/.my.cnf
sukses "Konfigurasi MariaDB selesai, tersimpan di /root/.my.cnf "
 

# ─── Secure installation ──────────────────────
proses "Menyiapkan keamanan MariaDB..."
mysql -u root -p"${MYSQL_ROOT_PASS}" -e "
    DELETE FROM mysql.user WHERE User='';
    DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
    DROP DATABASE IF EXISTS test;
    DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
    FLUSH PRIVILEGES;
" >> "$LOG_FILE" 2>&1 || warn "Some secure steps skipped"
sukses "MariaDB Aktif"

# ─── Create MR Panel database ─────────────────
proses "Membuat database MR Panel..."
mysql -u root -p"${MYSQL_ROOT_PASS}" -e "
    CREATE DATABASE IF NOT EXISTS mrpanel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    FLUSH PRIVILEGES;
" >> "$LOG_FILE" 2>&1
sukses "Database berhasil dibuat"

# ─── Bind to 127.0.0.1 only ──────────────────
if ! grep -q "bind-address.*127.0.0.1" /etc/mysql/mariadb.conf.d/50-server.cnf 2>/dev/null; then
    sed -i 's/^bind-address\s*=.*/bind-address = 127.0.0.1/' /etc/mysql/mariadb.conf.d/50-server.cnf 2>/dev/null || true
    systemctl restart mariadb >> "$LOG_FILE" 2>&1
    #log "MariaDB bound to 127.0.0.1"
fi

echo ""
