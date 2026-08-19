#!/bin/bash
# setup-dkim.sh — Install & configure OpenDKIM + DMARC for Postfix
# Run on VPS as root

set -e

DOMAIN="${1:-}"
FROM_EMAIL="${2:-postmaster@${DOMAIN}}"

if [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <domain> [from-email]"
    echo "Example: $0 mrstudio.web.id admin@mrstudio.web.id"
    exit 1
fi

echo "=== Setting up DKIM for ${DOMAIN} ==="

# 1. Install OpenDKIM
echo "[1/6] Installing OpenDKIM..."
apt-get update -qq
apt-get install -y opendkim opendkim-tools >> /dev/null 2>&1

# 2. Generate DKIM key
echo "[2/6] Generating DKIM key..."
mkdir -p /etc/opendkim/keys/${DOMAIN}
opendkim-genkey -b 2048 -d ${DOMAIN} -D /etc/opendkim/keys/${DOMAIN} -s default -v
chown -R opendkim:opendkim /etc/opendkim
chmod 600 /etc/opendkim/keys/${DOMAIN}/default.private

# 3. Configure OpenDKIM
echo "[3/6] Configuring OpenDKIM..."
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

# Trusted hosts
cat > /etc/opendkim/TrustedHosts << EOF
127.0.0.1
localhost
${DOMAIN}
*.${DOMAIN}
EOF

# Key table
cat > /etc/opendkim/KeyTable << EOF
default._domainkey.${DOMAIN} ${DOMAIN}:default:/etc/opendkim/keys/${DOMAIN}/default.private
EOF

# Signing table
cat > /etc/opendkim/SigningTable << EOF
*@${DOMAIN} default._domainkey.${DOMAIN}
*.${DOMAIN} default._domainkey.${DOMAIN}
EOF

# 4. Configure Postfix to use OpenDKIM
echo "[4/6] Configuring Postfix..."
postconf -e "milter_default_action = accept"
postconf -e "milter_protocol = 6"
postconf -e "smtpd_milters = inet:localhost:8891"
postconf -e "non_smtpd_milters = inet:localhost:8891"

# 5. Start services
echo "[5/6] Starting services..."
systemctl enable opendkim
systemctl restart opendkim
systemctl restart postfix

# 6. Get DNS records
echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Add these DNS TXT records for ${DOMAIN}:"
echo ""

# DKIM public key
DKIM_PUB=$(cat /etc/opendkim/keys/${DOMAIN}/default.pub | grep -oP 'p = \K.*' | tr -d ' \n')
echo "── DKIM Record ──"
echo "Name:  default._domainkey.${DOMAIN}"
echo "Type:  TXT"
echo "Value: v=DKIM1; k=rsa; p=${DKIM_PUB}"
echo ""

# DMARC record
echo "── DMARC Record ──"
echo "Name:  _dmarc.${DOMAIN}"
echo "Type:  TXT"
echo "Value: v=DMARC1; p=quarantine; rua=mailto:${FROM_EMAIL}; pct=100"
echo ""

echo "── SPF Record (verify existing) ──"
echo "Name:  ${DOMAIN}"
echo "Type:  TXT"
echo "Value: v=spf1 ip4:103.191.63.147 a mx ~all"
echo ""

echo "── Reverse DNS (PTR) ──"
echo "Set PTR for 103.191.63.147 → mail.${DOMAIN} (via VPS provider panel)"
echo ""
echo "After adding DNS records, test with:"
echo "  dig TXT default._domainkey.${DOMAIN}"
echo "  dig TXT _dmarc.${DOMAIN}"
echo "  dig TXT ${DOMAIN}"
echo "  python3 -c \"import dns.resolver; print(dns.resolver.resolve('default._domainkey.${DOMAIN}', 'TXT')[0])\""
