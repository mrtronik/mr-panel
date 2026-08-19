#!/bin/bash
# cron-usage.sh — Run hourly to snapshot disk usage
# Add to crontab: 0 * * * * /opt/mrpanel/install/cron-usage.sh

PANEL_DIR="/opt/mrpanel"
LOG_FILE="/var/log/mrpanel-usage.log"

echo "[$(date)] Starting usage snapshot..." >> "$LOG_FILE"
cd "$PANEL_DIR"
node -e "
const UsageService = require('./services/UsageService');
UsageService.snapshotAll().then(n => {
    console.log('[' + new Date().toISOString() + '] Snapshot saved: ' + n + ' websites');
    process.exit(0);
}).catch(err => {
    console.error('Snapshot failed:', err.message);
    process.exit(1);
});
" >> "$LOG_FILE" 2>&1
echo "[$(date)] Done." >> "$LOG_FILE"
