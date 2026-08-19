const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

class ClamAVService {
  static async getStatus() {
    try {
      let daemonRunning = false;
      try {
        const result = execSync('systemctl is-active clamav-daemon', { encoding: 'utf8', timeout: 5000 }).trim();
        daemonRunning = result === 'active';
      } catch (e) {
        daemonRunning = false;
      }

      let dbVersion = 'Unknown';
      let dbDate = 'Unknown';
      try {
        const sigs = execSync('sigtool --info /var/lib/clamav/main.cvd 2>/dev/null || freshclam --version 2>/dev/null || echo "Unknown"', { encoding: 'utf8', timeout: 10000 });
        const lines = sigs.split('\n');
        for (const line of lines) {
          if (line.includes('Version:')) dbVersion = line.split('Version:')[1].trim();
          if (line.includes('Build time:')) dbDate = line.split('Build time:')[1].trim();
        }
      } catch (e) { /* ignore */ }

      let clamscanPath = 'clamscan';
      try {
        execSync('which clamscan', { encoding: 'utf8', timeout: 5000 });
      } catch (e) {
        clamscanPath = '/usr/bin/clamscan';
      }

      return {
        installed: daemonRunning || fs.existsSync('/usr/bin/clamscan'),
        daemonRunning,
        dbVersion,
        dbDate,
        clamscanPath
      };
    } catch (error) {
      return { installed: false, daemonRunning: false, error: error.message };
    }
  }

  static _validatePath(filePath) {
    // Block path traversal
    if (filePath.includes('..') || filePath.includes('\0')) {
      throw new Error('Invalid path: path traversal detected');
    }
    return filePath;
  }

  static async scanFile(filePath) {
    this._validatePath(filePath);
    if (!fs.existsSync(filePath)) {
      throw new Error('File tidak ditemukan');
    }

    return new Promise((resolve, reject) => {
      const cmd = `clamscan --no-summary "${filePath}"`;
      exec(cmd, { timeout: 300000 }, async (error, stdout, stderr) => {
        const isInfected = stdout.includes(' FOUND');
        const result = {
          clean: !isInfected && error === null,
          infected: isInfected,
          output: stdout || stderr,
          file: filePath,
          scannedAt: new Date()
        };

        if (isInfected) {
          const match = stdout.match(/(.+): (.+) FOUND/);
          if (match) {
            result.virus = match[2];
            result.infectedFile = match[1];
          }
        }

        try {
          await db.execute(
            'INSERT INTO scan_logs (scan_type, target_path, result, virus_name, details, scanned_by) VALUES (?, ?, ?, ?, ?, ?)',
            ['file', filePath, result.infected ? 'infected' : 'clean', result.virus || null, result.output, null]
          );
        } catch (e) { /* ignore db error */ }

        resolve(result);
      });
    });
  }

  static async scanDirectory(dirPath, options = {}) {
    this._validatePath(dirPath);
    if (!fs.existsSync(dirPath)) {
      throw new Error('Directory tidak ditemukan');
    }

    const { recursive = true, maxDepth = 10 } = options;

    return new Promise((resolve, reject) => {
      const args = ['--no-summary', '--recursive'];
      if (recursive) args.push(`--max-recursion=${maxDepth}`);
      
      const cmd = `clamscan ${args.join(' ')} "${dirPath}"`;
      exec(cmd, { timeout: 600000, maxBuffer: 10 * 1024 * 1024 }, async (error, stdout, stderr) => {
        const lines = stdout.split('\n').filter(l => l.trim());
        const infected = [];
        const scanned = [];
        let totalScanned = 0;
        let totalInfected = 0;

        for (const line of lines) {
          if (line.includes(' FOUND')) {
            const match = line.match(/(.+): (.+) FOUND/);
            if (match) {
              infected.push({ file: match[1], virus: match[2] });
              totalInfected++;
            }
          } else if (line.includes(': OK')) {
            const file = line.replace(': OK', '').trim();
            scanned.push(file);
          }

          const summaryMatch = line.match(/(\d+) scanned/);
          if (summaryMatch) totalScanned = parseInt(summaryMatch[1]);
        }

        const result = {
          clean: totalInfected === 0,
          totalScanned,
          totalInfected,
          infected,
          scannedFiles: scanned.slice(0, 100),
          output: stdout,
          scannedAt: new Date()
        };

        try {
          await db.execute(
            'INSERT INTO scan_logs (scan_type, target_path, result, virus_name, details, scanned_by) VALUES (?, ?, ?, ?, ?, ?)',
            [
              'directory',
              dirPath,
              result.infected ? 'infected' : 'clean',
              result.infected.length > 0 ? result.infected.map(i => i.virus).join(', ') : null,
              JSON.stringify({ totalScanned, totalInfected, infected: result.infected }),
              null
            ]
          );
        } catch (e) { /* ignore db error */ }

        resolve(result);
      });
    });
  }

  static async updateDatabase() {
    return new Promise((resolve, reject) => {
      exec('freshclam', { timeout: 300000 }, (error, stdout, stderr) => {
        if (error && !stdout.includes('up to date')) {
          reject(new Error(stderr || error.message));
        } else {
          resolve({ success: true, output: stdout || stderr });
        }
      });
    });
  }

  static async getScanLogs(limit = 50) {
    try {
      const [rows] = await db.execute(
        'SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT ?',
        [limit]
      );
      return rows;
    } catch (error) {
      return [];
    }
  }

  static async clearLogs() {
    try {
      await db.execute('DELETE FROM scan_logs');
      return true;
    } catch (error) {
      return false;
    }
  }

  static async quarantineFile(filePath) {
    const quarantineDir = '/var/quarantine';
    if (!fs.existsSync(quarantineDir)) {
      fs.mkdirSync(quarantineDir, { recursive: true });
    }

    const fileName = path.basename(filePath);
    const timestamp = Date.now();
    const quarantinePath = path.join(quarantineDir, `${timestamp}_${fileName}`);

    try {
      fs.copyFileSync(filePath, quarantinePath);
      fs.unlinkSync(filePath);
      return { success: true, quarantinePath };
    } catch (error) {
      throw new Error(`Gagal quarantine: ${error.message}`);
    }
  }

  static async getQuarantinedFiles() {
    const quarantineDir = '/var/quarantine';
    if (!fs.existsSync(quarantineDir)) {
      return [];
    }

    const files = fs.readdirSync(quarantineDir);
    return files.map(f => {
      const filePath = path.join(quarantineDir, f);
      const stats = fs.statSync(filePath);
      return {
        name: f,
        path: filePath,
        size: stats.size,
        sizeFormatted: this.formatBytes(stats.size),
        quarantinedAt: stats.mtime
      };
    });
  }

  static async deleteQuarantinedFile(fileName) {
    // Prevent path traversal
    const safeName = path.basename(fileName);
    const filePath = path.join('/var/quarantine', safeName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  static async restoreFile(fileName) {
    const safeName = path.basename(fileName);
    const quarantinePath = path.join('/var/quarantine', safeName);
    if (!fs.existsSync(quarantinePath)) {
      throw new Error('File tidak ditemukan di quarantine');
    }

    const originalName = fileName.replace(/^\d+_/, '');
    const restorePath = path.join('/tmp', originalName);

    fs.copyFileSync(quarantinePath, restorePath);
    fs.unlinkSync(quarantinePath);

    return { success: true, restoredTo: restorePath };
  }

  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static isArchive(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz'].includes(ext);
  }

  static async scanUploadedFile(filePath) {
    const status = await this.getStatus();
    if (!status.installed) {
      return { skipped: true, reason: 'ClamAV tidak terinstall' };
    }

    return await this.scanFile(filePath);
  }
}

module.exports = ClamAVService;
