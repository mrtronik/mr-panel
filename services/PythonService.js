const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PythonService {

    static OLS_BASE = '/usr/local/lsws';
    static OLS_VHOSTS = '/usr/local/lsws/conf/vhosts';
    static OLS_HTTPD_CONF = '/usr/local/lsws/conf/httpd_config.conf';
    static SYSTEMD_DIR = '/etc/systemd/system';
    static METADATA_FILE = '.mrpanel.json';

    static isInstalled(docRoot) {
        const hasVenv = fs.existsSync(path.join(docRoot, 'venv'));
        const hasConfig = fs.existsSync(path.join(docRoot, this.METADATA_FILE));
        return hasVenv && hasConfig;
    }

    static getInfo(docRoot) {
        const configPath = path.join(docRoot, this.METADATA_FILE);
        if (!fs.existsSync(configPath)) return null;
        try {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch {
            return null;
        }
    }

    static writeConfig(docRoot, config) {
        const configPath = path.join(docRoot, this.METADATA_FILE);
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    }

    static removeConfig(docRoot) {
        const configPath = path.join(docRoot, this.METADATA_FILE);
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    }

    static detectPythonVersion() {
        const versions = [];
        try {
            const output = execSync('ls /usr/bin/python3* 2>/dev/null || true', { encoding: 'utf8' });
            const lines = output.trim().split('\n').filter(Boolean);
            for (const line of lines) {
                const match = line.match(/python3\.(\d+)/);
                if (match) {
                    const ver = match[1];
                    if (!versions.includes(ver)) {
                        // Verify binary works AND venv module is available
                        try {
                            execSync(`python3.${ver} -m venv --help >/dev/null 2>&1`, { encoding: 'utf8', timeout: 5000 });
                            versions.push(ver);
                        } catch {}
                    }
                }
            }
        } catch {}
        // Also check python3 (default)
        if (versions.length === 0) {
            try {
                execSync('python3 -m venv --help >/dev/null 2>&1', { encoding: 'utf8', timeout: 5000 });
                const out = execSync('python3 --version 2>/dev/null', { encoding: 'utf8' });
                const m = out.match(/Python 3\.(\d+)/);
                if (m && !versions.includes(m[1])) versions.push(m[1]);
            } catch {}
        }
        if (versions.length === 0) versions.push('11');
        return versions.sort();
    }

    static detectFramework(docRoot) {
        const reqPath = path.join(docRoot, 'requirements.txt');
        if (!fs.existsSync(reqPath)) return 'custom';
        try {
            const content = fs.readFileSync(reqPath, 'utf8').toLowerCase();
            if (content.includes('django')) return 'django';
            if (content.includes('flask')) return 'flask';
            if (content.includes('fastapi') || content.includes('uvicorn')) return 'fastapi';
            return 'custom';
        } catch {
            return 'custom';
        }
    }

    static allocatePort(domain) {
        const hash = crypto.createHash('md5').update(domain).digest('hex');
        const port = 5000 + (parseInt(hash.substring(0, 4), 16) % 5000);
        return port;
    }

    static isPortAvailable(port) {
        try {
            execSync(`ss -tlnp | grep -q ":${port} "`, { encoding: 'utf8', stdio: 'ignore' });
            return false;
        } catch {
            return true;
        }
    }

    static findAvailablePort(domain) {
        let port = this.allocatePort(domain);
        let attempts = 0;
        while (!this.isPortAvailable(port) && attempts < 100) {
            port = 5000 + ((port - 5000 + 1) % 5000);
            attempts++;
        }
        return port;
    }

    static getFrameworkDefaults(framework) {
        const defaults = {
            flask: { entry: 'app:app', workers: 1 },
            django: { entry: 'config.wsgi:application', workers: 2 },
            fastapi: { entry: 'main:app', workers: 2 },
            custom: { entry: 'app:app', workers: 1 }
        };
        return defaults[framework] || defaults.custom;
    }

    static createDefaultApp(docRoot, framework, domain) {
        console.log(`[Python] Creating default ${framework} app for ${domain}`);
        switch (framework) {
            case 'django':
                this.createDjangoDefault(docRoot, domain);
                break;
            case 'fastapi':
                this.createFastApiDefault(docRoot, domain);
                break;
            case 'flask':
            default:
                this.createFlaskDefault(docRoot, domain);
                break;
        }
    }

    static createFlaskDefault(docRoot, domain) {
        const port = this.findAvailablePort(domain);
        const reqPath = path.join(docRoot, 'requirements.txt');
        if (!fs.existsSync(reqPath)) {
            fs.writeFileSync(reqPath, 'flask\n', 'utf8');
        }

        fs.writeFileSync(path.join(docRoot, 'app.py'), `import os
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/')
def index():
    return f\"\"\"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome - ${domain}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               display: flex; justify-content: center; align-items: center;
               min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }}
        .card {{ background: white; border-radius: 16px; padding: 48px;
                 box-shadow: 0 20px 60px rgba(0,0,0,0.15); text-align: center; max-width: 500px; width: 90%; }}
        h1 {{ font-size: 2rem; margin-bottom: 12px; color: #667eea; }}
        p {{ color: #666; line-height: 1.6; margin-bottom: 20px; }}
        .badge {{ display: inline-block; background: #f0f0f0; padding: 6px 16px; border-radius: 20px; font-size: 0.85rem; color: #555; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>Python App Running</h1>
        <p>Your Flask app is deployed on <strong>${domain}</strong></p>
        <span class="badge">Flask</span>
    </div>
</body>
</html>\"\"\"

@app.route('/health')
def health():
    return jsonify({{"status": "ok", "framework": "flask"}})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=${port})
`, 'utf8');
    }

    static createDjangoDefault(docRoot, domain) {
        const port = this.findAvailablePort(domain);
        const configDir = path.join(docRoot, 'config');
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

        fs.writeFileSync(path.join(docRoot, 'requirements.txt'), 'django\n', 'utf8');

        fs.writeFileSync(path.join(docRoot, 'manage.py'), `#!/usr/bin/env python
import os, sys

def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
`, 'utf8');

        fs.writeFileSync(path.join(configDir, '__init__.py'), '', 'utf8');

        fs.writeFileSync(path.join(configDir, 'settings.py'), `import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = 'django-insecure-change-this-${Date.now()}'
DEBUG = True
ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
    'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
]

ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [], 'APP_DIRS': True, 'OPTIONS': {'context_processors': ['django.template.context_processors.debug', 'django.template.context_processors.request', 'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'config.wsgi.application'
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True
STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
`, 'utf8');

        fs.writeFileSync(path.join(configDir, 'urls.py'), `from django.contrib import admin
from django.urls import path
from django.http import JsonResponse

def health(request):
    return JsonResponse({"status": "ok", "framework": "django"})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', health),
]
`, 'utf8');

        fs.writeFileSync(path.join(configDir, 'wsgi.py'), `import os
from django.core.wsgi import get_wsgi_application
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
application = get_wsgi_application()
`, 'utf8');

        fs.writeFileSync(path.join(docRoot, '.env'), `DJANGO_SETTINGS_MODULE=config.settings
PORT=${port}
`, 'utf8');
    }

    static createFastApiDefault(docRoot, domain) {
        const port = this.findAvailablePort(domain);
        const reqPath = path.join(docRoot, 'requirements.txt');
        if (!fs.existsSync(reqPath)) {
            fs.writeFileSync(reqPath, 'fastapi\nuvicorn[standard]\n', 'utf8');
        }

        fs.writeFileSync(path.join(docRoot, 'main.py'), `import os
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse

app = FastAPI(title="${domain}")

@app.get("/", response_class=HTMLResponse)
async def root():
    return \"\"\"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome - ${domain}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               display: flex; justify-content: center; align-items: center;
               min-height: 100vh; background: linear-gradient(135deg, #00b4d8 0%, #0077b6 100%); }}
        .card {{ background: white; border-radius: 16px; padding: 48px;
                 box-shadow: 0 20px 60px rgba(0,0,0,0.15); text-align: center; max-width: 500px; width: 90%; }}
        h1 {{ font-size: 2rem; margin-bottom: 12px; color: #0077b6; }}
        p {{ color: #666; line-height: 1.6; margin-bottom: 20px; }}
        .badge {{ display: inline-block; background: #f0f0f0; padding: 6px 16px; border-radius: 20px; font-size: 0.85rem; color: #555; }}
        a {{ color: #0077b6; text-decoration: none; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>Python App Running</h1>
        <p>Your FastAPI app is deployed on <strong>${domain}</strong></p>
        <span class="badge">FastAPI</span>
    </div>
</body>
</html>\"\"\"

@app.get("/health")
async def health():
    return {{"status": "ok", "framework": "fastapi"}}

@app.get("/api/info")
async def info():
    return {{"framework": "fastapi", "python": os.sys.version, "port": ${port}}}
`, 'utf8');

        fs.writeFileSync(path.join(docRoot, '.env'), `PORT=${port}
`, 'utf8');
    }

    static async installPython(docRoot, config) {
        const { domain, entryPoint, port, requirements, framework } = config;
        let pythonVersion = config.pythonVersion || '11';

        console.log('[Python] Installing to', docRoot);

        // Step 1: Find working python binary
        const tryBins = [`python3.${pythonVersion}`, 'python3'];
        let pythonBin = null;
        let foundVersion = pythonVersion;

        for (const bin of tryBins) {
            try {
                // Test: can this binary create a venv?
                const testDir = `/tmp/mrpanel-test-venv-${Date.now()}`;
                execSync(`${bin} -m venv "${testDir}" 2>&1`, { encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
                execSync(`rm -rf "${testDir}"`, { stdio: 'ignore' });
                pythonBin = bin;
                const verOut = execSync(`${bin} --version 2>&1`, { encoding: 'utf8' });
                const m = verOut.match(/Python 3\.(\d+)/);
                if (m) foundVersion = m[1];
                console.log('[Python] Using', bin, '-', verOut.trim());
                break;
            } catch {}
        }

        if (!pythonBin) {
            throw new Error('No working Python 3 found. Install python3-venv: sudo apt install python3-venv');
        }

        // Step 2: Create venv
        console.log('[Python] Creating venv with ' + pythonBin);
        try {
            execSync(`${pythonBin} -m venv "${docRoot}/venv"`, { timeout: 120000, stdio: 'pipe' });
        } catch (e) {
            const msg = e.stderr ? e.stderr.toString() : e.message;
            if (msg.includes('ensurepip') || msg.includes('pip') || msg.includes('ModuleNotFoundError')) {
                console.log('[Python] venv without pip...');
                execSync(`${pythonBin} -m venv --without-pip "${docRoot}/venv"`, { timeout: 120000, stdio: 'pipe' });
            } else {
                throw new Error(`Failed to create venv: ${msg}`);
            }
        }

        if (!fs.existsSync(path.join(docRoot, 'venv', 'bin', 'activate'))) {
            throw new Error('Failed to create virtual environment');
        }

        pythonVersion = foundVersion;

        // Step 3: Determine framework and create default app BEFORE pip install
        const detectedFramework = framework || this.detectFramework(docRoot);
        const defaults = this.getFrameworkDefaults(detectedFramework);
        const finalEntryPoint = entryPoint || defaults.entry;
        const finalPort = port || this.findAvailablePort(domain);

        const hasAppFiles = fs.existsSync(path.join(docRoot, 'app.py')) ||
                           fs.existsSync(path.join(docRoot, 'main.py')) ||
                           fs.existsSync(path.join(docRoot, 'manage.py')) ||
                           fs.existsSync(path.join(docRoot, 'config'));
        if (!hasAppFiles) {
            console.log('[Python] No app files found, creating default ' + detectedFramework + ' app');
            this.createDefaultApp(docRoot, detectedFramework, domain);
        }

        // Step 4: Write requirements.txt if user provided (overrides default)
        if (requirements && requirements.trim()) {
            fs.writeFileSync(path.join(docRoot, 'requirements.txt'), requirements.trim(), 'utf8');
        }

        // Step 5: Ensure pip is available in venv
        const venvPip = path.join(docRoot, 'venv', 'bin', 'pip');
        if (!fs.existsSync(venvPip)) {
            console.log('[Python] pip not in venv, bootstrapping...');
            try {
                execSync(`"${docRoot}/venv/bin/python" -m ensurepip --upgrade 2>/dev/null || ${pythonBin} -m venv --upgrade "${docRoot}/venv"`, { timeout: 60000, stdio: 'pipe' });
            } catch {}
            // If still no pip, use get-pip.py
            if (!fs.existsSync(venvPip)) {
                try {
                    execSync(`curl -sSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py && "${docRoot}/venv/bin/python" /tmp/get-pip.py 2>/dev/null && rm -f /tmp/get-pip.py`, { timeout: 60000, stdio: 'pipe' });
                } catch {}
            }
        }

        // Step 3: Install dependencies
        const reqPath = path.join(docRoot, 'requirements.txt');
        if (fs.existsSync(reqPath)) {
            console.log('[Python] Installing dependencies...');
            try {
                execSync(`"${docRoot}/venv/bin/pip" install -r "${reqPath}" --no-cache-dir`, {
                    timeout: 300000,
                    env: { ...process.env, PIP_NO_WARN_SCRIPT_LOCATION: '1' }
                });
            } catch (e) {
                console.error('[Python] pip install error:', e.message);
                throw new Error('Failed to install dependencies: ' + (e.stderr ? e.stderr.toString().slice(-500) : e.message));
            }
        }

        // Step 3b: Always ensure gunicorn is installed (used as process manager)
        console.log('[Python] Ensuring gunicorn is installed...');
        try {
            execSync(`"${docRoot}/venv/bin/pip" install gunicorn --no-cache-dir`, {
                timeout: 60000,
                env: { ...process.env, PIP_NO_WARN_SCRIPT_LOCATION: '1' }
            });
        } catch (e) {
            console.error('[Python] gunicorn install warning:', e.message);
        }

        // Step 8: Create startup wrapper script
        const startupScript = `#!/bin/bash
cd "${docRoot}"
export PYTHONPATH="${docRoot}:$PYTHONPATH"
source venv/bin/activate
exec python -m gunicorn --bind 127.0.0.1:${finalPort} --workers ${defaults.workers} --timeout 120 --access-logfile - --error-logfile - ${finalEntryPoint}
`;
        fs.writeFileSync(path.join(docRoot, 'start.sh'), startupScript, 'utf8');
        execSync(`chmod +x "${docRoot}/start.sh"`);

        // Step 9: Write metadata
        const metadata = {
            app: 'python',
            python_version: pythonVersion,
            entry_point: finalEntryPoint,
            port: finalPort,
            framework: detectedFramework,
            domain: domain,
            created_at: new Date().toISOString(),
            status: 'stopped'
        };
        this.writeConfig(docRoot, metadata);

        // Step 10: Create systemd service
        const serviceName = domain.replace(/\./g, '-') + '-python';
        await this.createSystemdService(serviceName, docRoot, finalPort);

        // Step 11: Set permissions
        try {
            execSync(`chown -R lsadm:nogroup "${docRoot}" 2>/dev/null || true`, { stdio: 'ignore' });
        } catch {}

        // Step 12: Configure OLS reverse proxy
        await this.configureOlsProxy(domain, docRoot, finalPort);

        // Step 13: Start the service
        try {
            execSync(`systemctl daemon-reload`, { stdio: 'ignore' });
            execSync(`systemctl enable ${serviceName}`, { stdio: 'ignore' });
            execSync(`systemctl start ${serviceName}`, { timeout: 15000, stdio: 'pipe' });
            // Wait a moment and verify it's actually running
            await new Promise(r => setTimeout(r, 2000));
            const actualStatus = this.getStatus(domain);
            metadata.status = actualStatus === 'active' ? 'running' : 'error';
            this.writeConfig(docRoot, metadata);
        } catch (e) {
            console.error('[Python] Service start failed:', e.message);
            metadata.status = 'error';
            this.writeConfig(docRoot, metadata);
        }

        console.log('[Python] Install complete on port', finalPort);
        return {
            success: true,
            port: finalPort,
            entryPoint: finalEntryPoint,
            framework: detectedFramework,
            serviceName
        };
    }

    static async createSystemdService(serviceName, docRoot, port) {
        const serviceFile = `${this.SYSTEMD_DIR}/${serviceName}.service`;
        const content = `[Unit]
Description=Python App - ${serviceName}
After=network.target

[Service]
Type=exec
User=lsadm
Group=nogroup
WorkingDirectory=${docRoot}
ExecStart=/bin/bash ${docRoot}/start.sh
Restart=on-failure
RestartSec=5
Environment=PYTHONUNBUFFERED=1
Environment=PORT=${port}

[Install]
WantedBy=multi-user.target
`;
        fs.writeFileSync(serviceFile, content, 'utf8');
    }

    static async configureOlsProxy(domain, docRoot, port) {
        const vhostConfPath = `${this.OLS_VHOSTS}/${domain}/vhconf.conf`;

        if (!fs.existsSync(vhostConfPath)) {
            console.error('[Python] OLS vhost config not found:', vhostConfPath);
            return;
        }

        let vhconf = fs.readFileSync(vhostConfPath, 'utf8');

        // Remove ALL Python proxy configs — clean slate approach
        // 1. Remove marked blocks
        vhconf = vhconf.replace(/# === MR Panel Python Proxy ===[\s\S]*?# === End MR Panel Python Proxy ===\n?/g, '');
        // 2. Remove orphaned extprocessor blocks (line by line safe)
        vhconf = vhconf.replace(/\nextprocessor python-backend-[^\n]+\{[^\}]*\}\n/g, '\n');
        // 3. Remove orphaned context blocks for .well-known, /static, and / (proxy)
        vhconf = vhconf.replace(/\ncontext \.well-known\/ \{[^\}]*\}\n/g, '\n');
        vhconf = vhconf.replace(/\ncontext \/static\/ \{[^\}]*\}\n/g, '\n');
        vhconf = vhconf.replace(/\ncontext \/ \{\n\s+type\s+proxy\n[^\}]*\}\n/g, '\n');

        // Build proxy context — .well-known MUST come before context / for certbot
        const proxyBlock = `# === MR Panel Python Proxy ===
context /.well-known/ {
  allowBrowse             1
  location                ${docRoot}/.well-known/
  allowOverride           0
  enhancedPrivacy         0
  noAccessControl         1
}

context /static/ {
  location                ${docRoot}/static/
  allowBrowse             1
}

context / {
  type                    proxy
  handler                 python-backend-${domain}
  addDefaultCharset       off
}

extprocessor python-backend-${domain} {
  type                    proxy
  address                 127.0.0.1:${port}
  maxConns                50
  initTimeout             60
  retryTimeout            0
  persistConn             1
  respBuffer              0
}
# === End MR Panel Python Proxy ===
`;

        vhconf = vhconf.trimEnd() + '\n' + proxyBlock;
        fs.writeFileSync(vhostConfPath, vhconf, 'utf8');

        // Ensure domain is mapped in SSL listener (for HTTPS to work)
        this.ensureSslMap(domain);

        // Reload OLS
        this.reloadOLS();
    }

    static ensureSslMap(domain) {
        const httpdConf = `${this.OLS_HTTPD_CONF}`;
        if (!fs.existsSync(httpdConf)) return;

        let conf = fs.readFileSync(httpdConf, 'utf8');

        // Only act if SSL listener exists
        if (!conf.includes('listener SSL')) return;

        // Check if this domain already has a map in SSL listener
        const sslSection = conf.match(/listener SSL\s*\{[\s\S]*?\}/);
        if (sslSection && sslSection[0].includes(`map                     ${domain} ${domain}`)) {
            return; // already mapped
        }

        // Add map line inside SSL listener, after the last existing map line
        const mapLine = `  map                     ${domain} ${domain}`;
        conf = conf.replace(
            /(listener SSL\s*\{[\s\S]*?secure\s+1(?:\n\s+keyFile[^\n]*)*(?:\n\s+certFile[^\n]*)*(?:\n\s+certChain[^\n]*)*)/,
            `$1\n${mapLine}`
        );

        fs.writeFileSync(httpdConf, conf, 'utf8');
        console.log(`[Python] Added SSL map for ${domain}`);
    }

    static async removeOlsProxy(domain) {
        const vhostConfPath = `${this.OLS_VHOSTS}/${domain}/vhconf.conf`;
        if (!fs.existsSync(vhostConfPath)) return;

        let vhconf = fs.readFileSync(vhostConfPath, 'utf8');
        // Remove ALL Python proxy configs (clean slate)
        vhconf = vhconf.replace(/# === MR Panel Python Proxy ===[\s\S]*?# === End MR Panel Python Proxy ===\n?/g, '');
        vhconf = vhconf.replace(/\nextprocessor python-backend-[^\n]+\{[^\}]*\}\n/g, '\n');
        vhconf = vhconf.replace(/\ncontext \.well-known\/ \{[^\}]*\}\n/g, '\n');
        vhconf = vhconf.replace(/\ncontext \/static\/ \{[^\}]*\}\n/g, '\n');
        vhconf = vhconf.replace(/\ncontext \/ \{\n\s+type\s+proxy\n[^\}]*\}\n/g, '\n');
        fs.writeFileSync(vhostConfPath, vhconf, 'utf8');

        // Remove SSL map if exists
        this.removeSslMap(domain);

        this.reloadOLS();
    }

    static removeSslMap(domain) {
        const httpdConf = `${this.OLS_HTTPD_CONF}`;
        if (!fs.existsSync(httpdConf)) return;

        let conf = fs.readFileSync(httpdConf, 'utf8');
        if (!conf.includes('listener SSL')) return;

        // Remove the map line for this domain
        const mapRegex = new RegExp(`\\n\\s+map\\s+${domain.replace(/\./g, '\\.')}\\s+${domain.replace(/\./g, '\\.')}`, 'g');
        conf = conf.replace(mapRegex, '');

        fs.writeFileSync(httpdConf, conf, 'utf8');
    }

    static reloadOLS() {
        try {
            execSync(`${this.OLS_BASE}/bin/lswsctrl reload`, { timeout: 10000, stdio: 'ignore' });
        } catch {}
    }

    static async removePython(docRoot, domain) {
        const config = this.getInfo(docRoot);
        const serviceName = domain ? domain.replace(/\./g, '-') + '-python' : null;

        // Stop and remove systemd service
        if (serviceName) {
            try {
                execSync(`systemctl stop ${serviceName} 2>/dev/null || true`, { stdio: 'ignore' });
                execSync(`systemctl disable ${serviceName} 2>/dev/null || true`, { stdio: 'ignore' });
                const serviceFile = `${this.SYSTEMD_DIR}/${serviceName}.service`;
                if (fs.existsSync(serviceFile)) fs.unlinkSync(serviceFile);
                execSync('systemctl daemon-reload 2>/dev/null || true', { stdio: 'ignore' });
            } catch {}
        }

        // Remove OLS proxy
        if (domain) {
            await this.removeOlsProxy(domain);
        }

        // Remove venv and config files
        const items = ['venv', 'start.sh', this.METADATA_FILE, 'requirements.txt', '.env', 'app.py', 'main.py', 'manage.py', 'db.sqlite3'];
        const dirs = ['config'];
        for (const item of items) {
            const itemPath = path.join(docRoot, item);
            if (fs.existsSync(itemPath)) {
                execSync(`rm -rf "${itemPath}"`, { stdio: 'ignore' });
            }
        }
        for (const dir of dirs) {
            const dirPath = path.join(docRoot, dir);
            if (fs.existsSync(dirPath)) {
                execSync(`rm -rf "${dirPath}"`, { stdio: 'ignore' });
            }
        }

        return { success: true };
    }

    static async startApp(domain, docRoot) {
        const serviceName = domain.replace(/\./g, '-') + '-python';
        try {
            execSync(`systemctl start ${serviceName}`, { timeout: 15000, stdio: 'pipe' });
        } catch (e) {
            const msg = e.stderr ? e.stderr.toString() : e.message;
            throw new Error('Start failed: ' + msg.slice(-300));
        }
        await new Promise(r => setTimeout(r, 2000));
        const status = this.getStatus(domain);
        const config = this.getInfo(docRoot);
        if (config) {
            config.status = status === 'active' ? 'running' : 'error';
            this.writeConfig(docRoot, config);
        }
        return { success: true, status };
    }

    static async stopApp(domain, docRoot) {
        const serviceName = domain.replace(/\./g, '-') + '-python';
        execSync(`systemctl stop ${serviceName}`, { timeout: 15000, stdio: 'pipe' });
        const config = this.getInfo(docRoot);
        if (config) {
            config.status = 'stopped';
            this.writeConfig(docRoot, config);
        }
        return { success: true };
    }

    static async restartApp(domain, docRoot) {
        const serviceName = domain.replace(/\./g, '-') + '-python';
        try {
            execSync(`systemctl restart ${serviceName}`, { timeout: 15000, stdio: 'pipe' });
        } catch (e) {
            const msg = e.stderr ? e.stderr.toString() : e.message;
            throw new Error('Restart failed: ' + msg.slice(-300));
        }
        await new Promise(r => setTimeout(r, 2000));
        const status = this.getStatus(domain);
        const config = this.getInfo(docRoot);
        if (config) {
            config.status = status === 'active' ? 'running' : 'error';
            this.writeConfig(docRoot, config);
        }
        return { success: true, status };
    }

    static getStatus(domain) {
        const serviceName = domain.replace(/\./g, '-') + '-python';
        try {
            const output = execSync(`systemctl is-active ${serviceName} 2>/dev/null`, { encoding: 'utf8', timeout: 5000 });
            return output.trim();
        } catch {
            return 'inactive';
        }
    }

    static getLogs(domain, lines = 50) {
        const serviceName = domain.replace(/\./g, '-') + '-python';
        try {
            return execSync(`journalctl -u ${serviceName} -n ${lines} --no-pager 2>/dev/null || echo "No logs available"`, { encoding: 'utf8' });
        } catch {
            return 'No logs available';
        }
    }
}

module.exports = PythonService;
