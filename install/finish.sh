#!/bin/bash
# finish.sh - Post-install summary

banner "Step 8/9: Installation Complete!"

# ─── Verify services ──────────────────────────
proses "Verifying services..."

# MySQL
if systemctl is-active --quiet mariadb; then
    sukses "MariaDB: Running"
else
    warn "MariaDB: Not running"
fi

# OLS
if systemctl is-active --quiet lshttpd; then
    sukses "OpenLiteSpeed: Running"
else
    warn "OpenLiteSpeed: Not running"
fi

# PowerDNS
if systemctl is-active --quiet pdns; then
    sukses "PowerDNS: Running"
else
    warn "PowerDNS: Not running"
fi

# PM2
if pm2 list 2>/dev/null | grep -q "online"; then
    sukses "MR Panel: Running"
else
    warn "MR Panel: Not running"
fi

# ─── Save credentials ─────────────────────────
CRED_FILE="/root/mrpanel-credentials.txt"
cat > "$CRED_FILE" << EOF
===========================================
  MR Panel Installation Credentials
  Generated: $(date)
===========================================

MySQL Root Password:  ${MYSQL_ROOT_PASS}
OLS WebAdmin Password: ${OLS_ADMIN_PASS}
PowerDNS API Key:     ${PDNS_API_KEY}
Panel App Key:        ${APP_KEY}

MR Panel URL:    http://${PUBLIC_IP}:${PANEL_PORT}
OLS WebAdmin:    http://${PUBLIC_IP}:7080
PowerDNS API:    http://127.0.0.1:8081

Panel Login:
  Username: admin
  Password: (set on first login)

===========================================
  IMPORTANT: Save these credentials!
  File: ${CRED_FILE}
===========================================
EOF

chmod 600 "$CRED_FILE"
sukses "Credentials saved to $CRED_FILE"

echo ""
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}        STATUS INSTALASI MR PANEL     ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

for s in "${STATUS[@]}"; do
    echo  "$s"
done
# ─── Summary ──────────────────────────────────
echo ""
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}        INSTALASI MR PANEL SELESAI      ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

echo -e "  ${CYAN}MR Panel URL				:${NC}	http://${PUBLIC_IP}:${PANEL_PORT}"
echo -e "  ${CYAN}WebServer Admin			:${NC}	http://${PUBLIC_IP}:7080"
echo -e "  ${CYAN}PowerDNS API				:${NC}	http://127.0.0.1:8081"
echo ""

echo -e "  ${CYAN}Password Root MySQL		:${NC}	${MYSQL_ROOT_PASS}"
echo -e "  ${CYAN}Password WebServer		:${NC}	${OLS_ADMIN_PASS}"
echo -e "  ${CYAN}PowerDNS API Key			:${NC}	${PDNS_API_KEY}"
echo ""

echo -e "  ${CYAN}Folder MR Panel			:${NC}	/opt/mrpanel"
echo -e "  ${CYAN}Catatan instalasi			:${NC}	${LOG_FILE}"
echo -e "  ${CYAN}Info Kredensial			:${NC}	${CRED_FILE}"
echo ""

echo -e "  ${KUNING}Versi MR Panel			:${NC}	V1.1"
echo -e "  ${KUNING}Runtime					:${NC}	MR Runtime Manager"
echo -e "  ${KUNING}Hak Cipta				:${NC}	${GREEN}© 2026 MR Projects${NC}"
echo ""

echo -e "  ${KUNING}Ucapan terima kasih kepada:${NC}"
echo -e "  Allah SWT"
echo -e "  Ayah (Alm) & Ibu"
echo -e "  ❤️Istri Tercinta❤️"
echo -e "  ❤️Anak anakku Tersayang❤️"
echo -e "  Warga Net Indonesia"
echo -e "  PT. Mas Ranto Projects"
echo ""

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Terima Kasih telah menggunakan MR Panel  ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
