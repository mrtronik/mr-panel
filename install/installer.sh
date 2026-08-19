#!/bin/bash
set -e

TMP="/tmp/mrpanel-src"

if ! command -v git >/dev/null 2>&1; then
    apt update
    apt install -y git
fi

rm -rf "$TMP"

git clone --depth=1 https://github.com/mrtronik/mr-panel.git "$TMP"

chmod +x "$TMP"/install/*.sh

exec bash "$TMP/install/install.sh" "$@"