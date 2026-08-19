#!/bin/bash
# ══════════════════════════════════════════════
#  php.sh — Install lsphp83 for OpenLiteSpeed
# ══════════════════════════════════════════════

banner "Langkah ke 4 dari 9: Instalasi PHP"

# ─── Add OLS repo ─────────────────────────────
if [ -f /etc/apt/sources.list.d/lst_repo.list ] || [ -f /etc/apt/sources.list.d/lst_debian_repo.list ]; then
    sukses "Repository sudah ada"
else
    sukses "Menambahkan Repository..."
    wget -qO /tmp/lst-setup.sh https://repo.litespeed.sh
    bash /tmp/lst-setup.sh >> "$LOG_FILE" 2>&1
    rm -f /tmp/lst-setup.sh
    # Fix repo for Ubuntu 24.04 if needed
    CODENAME=$(lsb_release -cs 2>/dev/null || echo "noble")
    REPO_FILE=$(ls /etc/apt/sources.list.d/lst_*.list 2>/dev/null | head -1)
    if [ -n "$REPO_FILE" ]; then
        sed -i "s|/jammy |//${CODENAME} |g" "$REPO_FILE" 2>/dev/null || true
    fi
    apt-get update -qq >> "$LOG_FILE" 2>&1
    sukses "Repository sudah Ditambahkan"
fi

# ─── Install lsphp83 ─────────────────────────
proses "Mengintall PHP..."
apt-get install -y -qq lsphp83 lsphp83-common lsphp83-mysql lsphp83-curl \
    lsphp83-imap lsphp83-imagick lsphp83-intl lsphp83-opcache \
    lsphp83-redis lsphp83-igbinary lsphp83-memcached lsphp83-sqlite3 >> "$LOG_FILE" 2>&1

# ─── Create symlink for CLI ───────────────────
if [ -f /usr/local/lsws/lsphp83/bin/lsphp ]; then
    ln -sf /usr/local/lsws/lsphp83/bin/lsphp /usr/bin/php8.3
    ln -sf /usr/local/lsws/lsphp83/bin/lsphp /usr/local/bin/php
    sukses "PHP CLI symlinked: php8.3 -> lsphp"
else
    warn "lsphp binary not found at expected path"
fi

# ─── Verify ───────────────────────────────────
PHP_VER=$(php8.3 -v 2>/dev/null | head -1 || echo "not found")
sukses "PHP terinstal: $PHP_VER"

# ─── Configure PHP settings ──────────────────
proses "Mengkonfigurasi PHP"
PHP_INI="/usr/local/lsws/lsphp83/etc/php/8.3/litespeed/php.ini"
if [ -f "$PHP_INI" ]; then
    sed -i 's/^memory_limit = .*/memory_limit = 256M/' "$PHP_INI"
    sed -i 's/^max_execution_time = .*/max_execution_time = 30/' "$PHP_INI"
    sed -i 's/^upload_max_filesize = .*/upload_max_filesize = 64M/' "$PHP_INI"
    sed -i 's/^post_max_size = .*/post_max_size = 64M/' "$PHP_INI"
    sed -i 's/^max_input_time = .*/max_input_time = 60/' "$PHP_INI"
    sed -i 's/^max_input_vars = .*/max_input_vars = 3000/' "$PHP_INI"
    sukses "PHP telah terkonfigurasi"
else
    warn "PHP ini not found at $PHP_INI"
fi

# ─── Configure OPcache ───────────────────────
OPCACHE_INI="/usr/local/lsws/lsphp83/etc/php/8.3/mods/opcache.ini"
if [ -f "$OPCACHE_INI" ]; then
    sed -i 's/^opcache.enable=.*/opcache.enable=1/' "$OPCACHE_INI"
    sed -i 's/^opcache.memory_consumption=.*/opcache.memory_consumption=128/' "$OPCACHE_INI"
    sed -i 's/^opcache.max_accelerated_files=.*/opcache.max_accelerated_files=10000/' "$OPCACHE_INI"
    sed -i 's/^opcache.revalidate_freq=.*/opcache.revalidate_freq=2/' "$OPCACHE_INI"
    sed -i 's/^opcache.save_comments=.*/opcache.save_comments=1/' "$OPCACHE_INI"
  #  log "OPcache configured"
fi

echo ""
