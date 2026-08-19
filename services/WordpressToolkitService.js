const { execSync } = require('fs');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class WordpressToolkitService {

    static WP_CLI = '/usr/local/bin/wp';

    static async listInstalls() {
        const installs = [];
        try {
            const { stdout } = await execAsync('find /home/public_html -name wp-config.php -maxdepth 3 2>/dev/null || true', { timeout: 10000 });
            const configs = stdout.trim().split('\n').filter(Boolean);
            for (const conf of configs) {
                const docRoot = path.dirname(conf);
                const domain = docRoot.replace('/home/public_html/', '');
                if (domain === docRoot) continue;
                const version = this.getInstalledVersion(docRoot);
                const plugins = this.listPlugins(docRoot);
                const themes = this.listThemes(docRoot);
                installs.push({ domain, docRoot, version, plugins, themes, isInstalled: true });
            }
        } catch (e) { console.error('[WPTK] list error:', e.message); }
        return installs;
    }

    static getInstalledVersion(docRoot) {
        try {
            const vp = path.join(docRoot, 'wp-includes', 'version.php');
            if (!fs.existsSync(vp)) return null;
            const content = fs.readFileSync(vp, 'utf8');
            const m = content.match(/\$wp_version\s*=\s*'([^']+)'/);
            return m ? m[1] : null;
        } catch { return null; }
    }

    static listPlugins(docRoot) {
        try {
            const dir = path.join(docRoot, 'wp-content', 'plugins');
            if (!fs.existsSync(dir)) return [];
            return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory()).map(name => {
                const mainFile = path.join(dir, name, name + '.php');
                let pluginName = name;
                if (fs.existsSync(mainFile)) {
                    const content = fs.readFileSync(mainFile, 'utf8');
                    const nm = content.match(/Plugin Name:\s*(.+)/);
                    if (nm) pluginName = nm[1].trim();
                }
                const activeFile = path.join(docRoot, 'wp-content', 'plugins', name, '.gitkeep');
                return { slug: name, name: pluginName };
            });
        } catch { return []; }
    }

    static listThemes(docRoot) {
        try {
            const dir = path.join(docRoot, 'wp-content', 'themes');
            if (!fs.existsSync(dir)) return [];
            return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory()).map(name => {
                const styleFile = path.join(dir, name, 'style.css');
                let themeName = name;
                if (fs.existsSync(styleFile)) {
                    const content = fs.readFileSync(styleFile, 'utf8');
                    const nm = content.match(/Theme Name:\s*(.+)/);
                    if (nm) themeName = nm[1].trim();
                }
                return { slug: name, name: themeName };
            });
        } catch { return []; }
    }

    static async updateCore(docRoot) {
        const { stdout } = await execAsync(`${this.WP_CLI} core update --path="${docRoot}" --allow-root 2>&1`, { timeout: 120000 });
        return stdout.trim();
    }

    static async updateAllPlugins(docRoot) {
        const { stdout } = await execAsync(`${this.WP_CLI} plugin update --all --path="${docRoot}" --allow-root 2>&1`, { timeout: 120000 });
        return stdout.trim();
    }

    static async updateAllThemes(docRoot) {
        const { stdout } = await execAsync(`${this.WP_CLI} theme update --all --path="${docRoot}" --allow-root 2>&1`, { timeout: 120000 });
        return stdout.trim();
    }

    static async updatePlugin(docRoot, plugin) {
        const { stdout } = await execAsync(`${this.WP_CLI} plugin update ${plugin} --path="${docRoot}" --allow-root 2>&1`, { timeout: 120000 });
        return stdout.trim();
    }

    static async updateTheme(docRoot, theme) {
        const { stdout } = await execAsync(`${this.WP_CLI} theme update ${theme} --path="${docRoot}" --allow-root 2>&1`, { timeout: 120000 });
        return stdout.trim();
    }

    static async activatePlugin(docRoot, plugin) {
        const { stdout } = await execAsync(`${this.WP_CLI} plugin activate ${plugin} --path="${docRoot}" --allow-root 2>&1`, { timeout: 30000 });
        return stdout.trim();
    }

    static async deactivatePlugin(docRoot, plugin) {
        const { stdout } = await execAsync(`${this.WP_CLI} plugin deactivate ${plugin} --path="${docRoot}" --allow-root 2>&1`, { timeout: 30000 });
        return stdout.trim();
    }

    static async deletePlugin(docRoot, plugin) {
        const { stdout } = await execAsync(`${this.WP_CLI} plugin delete ${plugin} --path="${docRoot}" --allow-root 2>&1`, { timeout: 30000 });
        return stdout.trim();
    }

    static async activateTheme(docRoot, theme) {
        const { stdout } = await execAsync(`${this.WP_CLI} theme activate ${theme} --path="${docRoot}" --allow-root 2>&1`, { timeout: 30000 });
        return stdout.trim();
    }

    static async deleteTheme(docRoot, theme) {
        const { stdout } = await execAsync(`${this.WP_CLI} theme delete ${theme} --path="${docRoot}" --allow-root 2>&1`, { timeout: 30000 });
        return stdout.trim();
    }

    static async coreVersion(docRoot) {
        try {
            const { stdout } = await execAsync(`${this.WP_CLI} core version --path="${docRoot}" --allow-root 2>&1`, { timeout: 10000 });
            return stdout.trim();
        } catch { return this.getInstalledVersion(docRoot); }
    }

    static async pluginInfo(docRoot) {
        try {
            const { stdout } = await execAsync(`${this.WP_CLI} plugin list --path="${docRoot}" --allow-root --format=json 2>&1`, { timeout: 30000 });
            return JSON.parse(stdout.trim());
        } catch { return []; }
    }

    static async themeInfo(docRoot) {
        try {
            const { stdout } = await execAsync(`${this.WP_CLI} theme list --path="${docRoot}" --allow-root --format=json 2>&1`, { timeout: 30000 });
            return JSON.parse(stdout.trim());
        } catch { return []; }
    }

    static async siteInfo(docRoot) {
        try {
            const { stdout } = await execAsync(`${this.WP_CLI} option list --path="${docRoot}" --allow-root --format=json 2>&1`, { timeout: 30000 });
            return JSON.parse(stdout.trim());
        } catch { return []; }
    }
}

module.exports = WordpressToolkitService;
