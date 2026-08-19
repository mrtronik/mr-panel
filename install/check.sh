#!/bin/bash
# ══════════════════════════════════════════════
#  check.sh — System checks
# ══════════════════════════════════════════════

banner "Langkah ke 1 dari 9: Cek Sistem"

# ─── OS check ─────────────────────────────────
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        error "Unsupported OS: $ID. This installer requires Ubuntu."
    fi
    sukses "OS: $PRETTY_NAME"
else
    error "Cannot detect OS. /etc/os-release not found."
fi

# ─── Version check ────────────────────────────
proses "Cek versi OS"
titik "Cek versi OS"
VERSION_NUM=$(echo "$VERSION_ID" | tr -d '.')
if [ "$VERSION_NUM" -lt 2204 ]; then
    error "Ubuntu 22.04+ required. Found: $VERSION_ID"
fi
sukses "Ubuntu version OK: $VERSION_ID"

# ─── Root check ───────────────────────────────
if [ "$EUID" -ne 0 ]; then
    error "Must run as root"
fi
sukses "Berjalan sebagai root"

# ─── Architecture ─────────────────────────────
proses "Cek arsitektur"
titik "Cek arsitektur"
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "aarch64" ]; then
    error "Unsupported architecture: $ARCH"
fi
sukses "Arsitektur: $ARCH"
proses "Cek RAM"
titik "Cek RAM"
# ─── RAM check ────────────────────────────────
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM" -lt 512 ]; then
    warn "Low RAM: ${TOTAL_RAM}MB. Recommended: 1GB+"
else
    sukses "RAM: ${TOTAL_RAM}MB"
fi
proses "Cek Penyimpanan"
# ─── Disk check ───────────────────────────────
DISK_FREE=$(df -BG / | awk 'NR==2{print $4}' | tr -d 'G')
if [ "$DISK_FREE" -lt 2 ]; then
    error "Insufficient disk space: ${DISK_FREE}GB free. Need 2GB+"
fi
sukses "Disk free: ${DISK_FREE}GB"

# ─── Existing install check ───────────────────
if [ -d /opt/mrpanel ]; then
    sukses "MR Panel already installed at /opt/mrpanel"
    read -p "Reinstall? This will NOT delete data. [y/N]: " REINSTALL
    if [[ ! "$REINSTALL" =~ ^[Yy]$ ]]; then
        error "Installation cancelled."
    fi
fi

# ─── Network check ────────────────────────────
if ! ping -c 1 -W 3 8.8.8.8 &>/dev/null; then
    error "Tidak ada koneksi internet"
else
    sukses "Internet terhubung"
fi
proses "Membuat password MySql"
# ─── Generate MySQL password if not set ───────
if [ -z "$MYSQL_ROOT_PASS" ]; then
    MYSQL_ROOT_PASS=$(openssl rand -hex 16)
fi
sukses "MySQL root password sukses dibuat"

proses "Cek IP Server"
# ─── Detect public IP ─────────────────────────
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "unknown")
sukses "Public IP: $PUBLIC_IP"

echo ""
