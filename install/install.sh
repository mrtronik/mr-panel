#!/bin/bash
# ══════════════════════════════════════════════
#  MR Panel — One-Click Installer
#  Tested on: Ubuntu 22.04 / 24.04
# ══════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="/tmp/mrpanel-install.log"
PANEL_PORT=3000
MYSQL_ROOT_PASS="$(openssl rand -hex 16)"
APP_KEY="mrpanel-$(cat /proc/sys/kernel/random/uuid)"
PANEL_DOMAIN=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
KUNING='\033[33m'
declare -a STATUS

proses() {
    printf  "\r\033[K${KUNING} [>] $1...${NC}"
    echo "[>] $1..." >> "$LOG_FILE"
}
titik() {
    for d in "." ".." "..."; do
        printf "\r\033[K${KUNING}[>] %s%s${NC}" "$1" "$d"
        sleep 0.2
    done
}
sukses() {
    printf  "\r\033[K${GREEN} [✓]%s${NC}\n" "$1"

    STATUS+=("[✓] $1")
}

gagal() {
    printf  "\r\033[K${RED} [✗]${NC} $1"
    echo "[✗] $1" >> "$LOG_FILE"
}
error() {
    printf  "\r\033[K${RED} [✗]${NC} $1\n"
    echo "[✗] $1" >> "$LOG_FILE"
    exit 1
}
warn() {
    printf  "\r\033[K${KUNING} [!]${NC} $1\n"
    echo "[!] $1" >> "$LOG_FILE"
}
banner() {
    clear

    echo "=============================================================="
    echo "                 $1"
    echo "=============================================================="

    STATUS+=("")
    STATUS+=("$1")
}

# ─── Check root ──────────────────────────────
if [ "$EUID" -ne 0 ]; then
    error "Please run as root: sudo bash install.sh"
fi

# ─── Detect source directory ──────────────────
# If install.sh is inside the project, PROJECT_DIR is one level up
if [ -f "$SCRIPT_DIR/../package.json" ] && [ -f "$SCRIPT_DIR/../app.js" ]; then
    PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
elif [ -f "$SCRIPT_DIR/app.js" ]; then
    PROJECT_DIR="$SCRIPT_DIR"
else
    PROJECT_DIR=""
fi

# ─── Parse args ──────────────────────────────
while [ $# -gt 0 ]; do
    case $1 in
        --domain) PANEL_DOMAIN="$2"; shift 2 ;;
        --port) PANEL_PORT="$2"; shift 2 ;;
        --password) MYSQL_ROOT_PASS="$2"; shift 2 ;;
        --src) PROJECT_DIR="$2"; shift 2 ;;
        --help)
            echo "Usage: sudo bash install.sh [options]"
            echo "  --domain    Panel domain (e.g. panel.example.com)"
            echo "  --port      Panel port (default: 3000)"
            echo "  --password  MySQL root password (default: random)"
            echo "  --src       MR Panel source directory"
            exit 0 ;;
        *) shift ;;
    esac
done
banner "MR Panel Installer v1.1"

echo ""
echo -e " ${GREEN}Selamat Datang di MR Panel Installer ${NC}"
echo ""
echo " Installer ini akan menyiapkan server Anda secara otomatis."
echo ""
echo " Yang akan dipersiapkan:"
echo "   ✓ Pemeriksaan Sistem"
echo "   ✓ Dependensi (Node.js, Python, Redis, ClamAV, Postfix, Dovecot)"
echo "   ✓ Basis Data (MariaDB)"
echo "   ✓ PHP (lsphp83)"
echo "   ✓ Web Server (OpenLiteSpeed)"
echo "   ✓ DNS Server (PowerDNS)"
echo "   ✓ MR Panel + Database Migrations"
echo "   ✓ Firewall (UFW)"
echo ""
echo -e " ${KUNING}[~] Silakan ngopi dulu, biar kami yang bekerja.${NC}"
echo ""

while true
do
    echo "=============================================================="
    echo -e "  ${GREEN}1. Instalasi Baru ${NC}"
    echo -e "  ${RED}2. Reinstal MR Panel ${NC}"
    echo -e "  ${KUNING}3. Ngopi + Udud [~] ${NC}"
    echo -e "  4. Gak Jadi"
    echo "=============================================================="

    read -rp " Pilihan Anda : " MENU

    case "$MENU" in

        1)
            INSTALL_MODE="install"
            break
            ;;

        2)
            INSTALL_MODE="reinstall"
            break
            ;;

        3)
            banner "MODE NGOPI"

            echo ""
            echo "  [~] Kopi siap..."
            sleep 1
            echo "  [~] Rokok siap..."
            sleep 1
            echo ""
            echo "  Server belum siap :)"
            echo ""
            read -rp " Tekan ENTER untuk kembali..."
            banner "MR Panel Installer v1.1"
            ;;

        4)
            echo ""
            echo "  Sampai jumpa lagi."
            exit
            ;;

        *)
            echo ""
            echo "  Pilihan tidak tersedia."
            sleep 1
            banner "MR Panel Installer v1.1"
            ;;

    esac
done
# ─── Run scripts ─────────────────────────────
source "$SCRIPT_DIR/check.sh"
source "$SCRIPT_DIR/dependency.sh"
source "$SCRIPT_DIR/database.sh"
source "$SCRIPT_DIR/php.sh"
source "$SCRIPT_DIR/openlitespeed.sh"
source "$SCRIPT_DIR/mrpanel.sh"
source "$SCRIPT_DIR/firewall.sh"
source "$SCRIPT_DIR/finish.sh"
