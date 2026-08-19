/* =========================================================
   Webhost Panel Theme - Main JS
   Theme toggle | Mobile menu | Charts | Nav active
   ========================================================= */

// ---- Theme Toggle ----
(function () {
  const saved = localStorage.getItem('whp-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
})();

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('whp-theme', next);
  // update icon
  document.querySelectorAll('.theme-toggle i').forEach((i) => {
    i.className = next === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  });
  // re-render charts if any
  if (window.__whpCharts) {
    window.__whpCharts.forEach((fn) => fn && fn(next));
  }
}

// init toggle icon on load
window.addEventListener('DOMContentLoaded', () => {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  document.querySelectorAll('.theme-toggle i').forEach((i) => {
    i.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  });
});

// ---- Mobile Menu ----
function toggleMobileMenu() {
  const menu = document.getElementById('navMenu');
  if (menu) menu.classList.toggle('open');
}

// close mobile menu on link click (but toggle dropdown parents instead)
document.addEventListener('click', (e) => {
  const link = e.target.closest('#navMenu .nav-link');
  const toggle = e.target.closest('.mobile-toggle');
  if (link && window.innerWidth <= 920) {
    const dd = link.closest('.nav-dropdown');
    // dropdown parent -> toggle expand, don't close menu
    if (dd && (link.getAttribute('href') === 'javascript:void(0)' || link.getAttribute('href') === '#')) {
      dd.classList.toggle('open');
      return;
    }
    const menu = document.getElementById('navMenu');
    if (menu) menu.classList.remove('open');
  }
});

// ---- Active nav based on filename ----
window.addEventListener('DOMContentLoaded', () => {
  let page = window.location.pathname.split('/').pop();
  if (!page || page === '') page = 'index.html';
  document.querySelectorAll('#navMenu .nav-link').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === page) a.classList.add('active');
  });
});

// ---- Chart helpers ----
function chartColors(theme) {
  const dark = theme === 'dark';
  return {
    text: dark ? '#94a3b8' : '#64748b',
    grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
    primary: '#1e3a8a',
    primaryLight: '#3b82f6',
    green: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
    purple: '#8b5cf6',
    cyan: '#06b6d4',
    tooltips: dark ? '#1e293b' : '#ffffff',
    tooltipText: dark ? '#e2e8f0' : '#1e293b',
  };
}

window.__whpCharts = [];

// ---- Radial Chart (Server Info) ----
function initRadialChart() {
  const canvas = document.getElementById('radialChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const render = (theme) => {
    const c = chartColors(theme);
    const ctx = canvas.getContext('2d');
    if (canvas._chart) canvas._chart.destroy();

    canvas._chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['CPU', 'RAM', 'Disk', 'Network', 'Free'],
        datasets: [{
          data: [42, 58, 35, 22, 100],
          backgroundColor: [c.primary, c.primaryLight, c.green, c.amber, 'rgba(148,163,184,0.12)'],
          borderColor: c.tooltips,
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        cutout: '72%',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: c.text,
              font: { size: 11, weight: '600' },
              padding: 14,
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          tooltip: {
            backgroundColor: c.tooltips,
            titleColor: c.tooltipText,
            bodyColor: c.tooltipText,
            padding: 10,
            cornerRadius: 8,
            callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed}%` },
          },
        },
      },
    });
  };

  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  render(theme);
  window.__whpCharts.push(render);
}

// ---- Mini line chart (dashboard) ----
function initMiniChart() {
  const canvas = document.getElementById('miniChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const render = (theme) => {
    const c = chartColors(theme);
    const ctx = canvas.getContext('2d');
    if (canvas._chart) canvas._chart.destroy();
    const grad = ctx.createLinearGradient(0, 0, 0, 160);
    grad.addColorStop(0, 'rgba(59,130,246,0.35)');
    grad.addColorStop(1, 'rgba(59,130,246,0.0)');

    canvas._chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          data: [320, 410, 380, 520, 490, 610, 580],
          borderColor: c.primaryLight,
          backgroundColor: grad,
          fill: true,
          tension: 0.4,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: c.primaryLight,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: c.tooltips, titleColor: c.tooltipText, bodyColor: c.tooltipText,
          cornerRadius: 8, padding: 10, displayColors: false,
        }},
        scales: {
          x: { grid: { display: false }, ticks: { color: c.text, font: { size: 10 } } },
          y: { grid: { color: c.grid }, ticks: { color: c.text, font: { size: 10 } }, beginAtZero: true },
        },
      },
    });
  };

  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  render(theme);
  window.__whpCharts.push(render);
}

// ---- Auto init ----
window.addEventListener('DOMContentLoaded', () => {
  initRadialChart();
  initMiniChart();
});

// ---- Simple add-row demo (websites list) ----
function addWebsiteFromModal() {
  const domain = document.getElementById('addWebDomain');
  const user = document.getElementById('addWebUser');
  const pkg = document.getElementById('addWebPkg');
  if (!domain || !domain.value.trim()) {
    whpToast('Error', 'Domain name is required.', 'error');
    return;
  }
  const tbody = document.getElementById('websitesTbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><span class="domain-name">${domain.value.trim()}</span></td>
    <td>${user ? user.value.trim() || '—' : '—'}</td>
    <td>${pkg ? pkg.value : 'Starter'}</td>
    <td>/home/${(user ? user.value : 'user').toLowerCase() || 'user'}/public_html</td>
    <td><span class="badge-soft success">Active</span></td>
    <td>
      <button class="act-icon" title="Manage"><i class="fa-solid fa-gear"></i></button>
      <button class="act-icon" title="File Manager"><i class="fa-solid fa-folder"></i></button>
      <button class="act-icon danger" title="Delete"><i class="fa-solid fa-trash"></i></button>
    </td>`;
  tbody.prepend(tr);
  whpToast('Website Created', `${domain.value.trim()} has been added successfully.`, 'success');
  domain.value = '';
  if (user) user.value = '';
  // close modal
  const modalEl = document.getElementById('addWebsiteModal');
  if (modalEl && window.bootstrap) {
    bootstrap.Modal.getOrCreateInstance(modalEl).hide();
  }
}

/* =========================================================
   FITUR TAMBAHAN
   ========================================================= */

// ---- Toast System ----
function whpToast(title, msg, type = 'info') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const t = document.createElement('div');
  t.className = `whp-toast ${type}`;
  t.innerHTML = `
    <span class="t-icon"><i class="fa-solid ${icons[type] || icons.info}"></i></span>
    <div class="t-body"><div class="t-title">${title}</div><div class="t-msg">${msg}</div></div>
    <button class="t-close"><i class="fa-solid fa-xmark"></i></button>
    <div class="t-progress"></div>`;
  const close = () => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  };
  t.querySelector('.t-close').addEventListener('click', close);
  stack.appendChild(t);
  const timer = setTimeout(close, 3600);
  t.addEventListener('mouseenter', () => clearTimeout(timer));
}

window.whpToast = whpToast;

// ---- Skeleton Loading ----
function showSkeletons() {
  document.querySelectorAll('[data-skeleton-target]').forEach((target) => {
    const count = parseInt(target.getAttribute('data-skeleton-count') || '3', 10);
    const type = target.getAttribute('data-skeleton-type') || 'box';
    const original = target.innerHTML;
    target.dataset.skeletonOriginal = original;
    let html = '';
    for (let i = 0; i < count; i++) {
      if (type === 'stat') {
        html += `<div class="stat-card skeleton-card"><span class="skeleton circle"></span><div style="flex:1"><div class="skeleton line short"></div><div class="skeleton line w80"></div></div></div>`;
      } else if (type === 'table') {
        html += `<div class="skeleton box" style="margin-bottom:8px"></div>`;
      } else {
        html += `<div class="skeleton box" style="margin-bottom:10px"></div>`;
      }
    }
    target.innerHTML = html;
    target.style.opacity = '1';
  });
}
function hideSkeletons() {
  document.querySelectorAll('[data-skeleton-target]').forEach((target) => {
    if (target.dataset.skeletonOriginal) {
      target.innerHTML = target.dataset.skeletonOriginal;
      delete target.dataset.skeletonOriginal;
      target.classList.add('skeleton-fade');
    }
  });
  // Re-initialise dynamic JS widgets whose DOM was wiped by skeleton swap
  if (typeof initRings === 'function') initRings();
  if (typeof initGauge === 'function') initGauge();
}

window.addEventListener('DOMContentLoaded', () => {
  const hasSkeleton = document.querySelector('[data-skeleton-target]');
  if (hasSkeleton) {
    showSkeletons();
    setTimeout(hideSkeletons, 850);
  }
});
 

window.addEventListener('load', function() {
    function tryInit(retries) {
        if (typeof ApexCharts !== 'undefined') {
            initCharts();
            refreshDashboard();
            setInterval(refreshDashboard, 2000);
        } else if (retries > 0) {
            setTimeout(function() { tryInit(retries - 1); }, 200);
        }
    }
    tryInit(20);
});
// ---- Progress Ring (CPU/RAM/Disk) ----
function buildRing(percent, color, label) {
  const r = 38, c = 2 * Math.PI * r;
  const off = c - (percent / 100) * c;
  return `
    <div class="ring-item">
      <div class="ring-wrap">
        <svg class="ring-svg" width="90" height="90" viewBox="0 0 90 90">
          <circle class="ring-track" cx="45" cy="45" r="${r}" fill="none" stroke-width="8"/>
          <circle class="ring-fill ${color}" cx="45" cy="45" r="${r}" fill="none" stroke-width="8"
            stroke-dasharray="${c}" stroke-dashoffset="${c}" data-ring-target="${percent}"/>
        </svg>
        <div class="ring-center-text">${percent}%</div>
      </div>
      <div class="ring-label"><i class="fa-solid fa-${label.icon}"></i> ${label.text}</div>
    </div>`;
}
 

// ---- Gauge Meter (server info) ----
function initGauge() {
  const host = document.getElementById('gaugeMeter');
  if (!host) return;
  const percent = parseInt(host.getAttribute('data-gauge-value') || '31', 10);
  const radius = 80, cx = 110, cy = 100;
  const startAngle = 180, endAngle = 360; // semicircle
  const angle = startAngle + (percent / 100) * (endAngle - startAngle);
  const rad = (deg) => (deg * Math.PI) / 180;
  const pointAt = (deg) => [cx + radius * Math.cos(rad(deg)), cy + radius * Math.sin(rad(deg))];
  const [sx, sy] = pointAt(startAngle);
  const [ex, ey] = pointAt(endAngle);
  const [fx, fy] = pointAt(angle);
  const arcLen = Math.PI * radius; // half circle
  const fillLen = (percent / 100) * arcLen;
  // needle end
  const needleLen = radius - 18;
  const [nx, ny] = [cx + needleLen * Math.cos(rad(angle)), cy + needleLen * Math.sin(rad(angle))];

  host.innerHTML = `
    <div class="gauge-wrap">
      <svg class="gauge-svg" viewBox="0 0 220 120">
        <path class="gauge-track" d="M ${sx} ${sy} A ${radius} ${radius} 0 0 1 ${ex} ${ey}" stroke-width="14"/>
        <path class="gauge-fill" d="M ${sx} ${sy} A ${radius} ${radius} 0 0 1 ${fx} ${fy}"
          stroke-width="14" stroke-dasharray="${arcLen}" stroke-dashoffset="${arcLen}" data-gauge-fill="${fillLen}"/>
        <line class="gauge-needle" x1="${cx}" y1="${cy}" x2="${cx + needleLen}" y2="${cy}"
          stroke="var(--text-main)" stroke-width="3" stroke-linecap="round"
          style="transform: rotate(${angle - 180}deg); transform-origin: ${cx}px ${cy}px;"/>
        <circle cx="${cx}" cy="${cy}" r="7" fill="var(--primary)"/>
      </svg>
      <div class="gauge-center"><div class="gv">${percent}%</div><div class="gl">Server Load</div></div>
    </div>`;
  // animate fill
  setTimeout(() => {
    const fill = host.querySelector('[data-gauge-fill]');
    if (fill) fill.style.strokeDashoffset = arcLen - fillLen;
  }, 200);
}
window.addEventListener('DOMContentLoaded', initGauge);

// ---- Custom Confirm Dialog ----
function whpConfirm(title, msg, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <h3 class="confirm-title">${title}</h3>
      <p class="confirm-msg">${msg}</p>
      <div class="confirm-actions">
        <button class="btn-ghost" data-c="cancel">Cancel</button>
        <button class="btn-danger-soft" data-c="ok">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => { overlay.style.animation = 'toastOut 0.2s ease forwards'; setTimeout(() => overlay.remove(), 200); };
  overlay.addEventListener('click', (e) => {
    const action = e.target.closest('[data-c]');
    if (action) {
      if (action.dataset.c === 'ok') { onConfirm && onConfirm(); close(); }
      else close();
    } else if (e.target === overlay) close();
  });
}
window.whpConfirm = whpConfirm;

// wire delete buttons globally
document.addEventListener('click', (e) => {
  const delBtn = e.target.closest('.act-icon.danger');
  if (!delBtn) return;
  e.preventDefault();
  const row = delBtn.closest('tr');
  const nameEl = row && row.querySelector('.domain-name');
  const name = nameEl ? nameEl.textContent : 'this item';
  whpConfirm('Delete Confirmation', `Are you sure you want to delete <b>${name}</b>? This action cannot be undone.`, () => {
    if (row) {
      row.style.transition = 'all 0.3s ease';
      row.style.opacity = '0';
      row.style.transform = 'translateX(20px)';
      setTimeout(() => { row.remove(); whpToast('Deleted', `${name} has been removed.`, 'success'); }, 280);
    } else {
      whpToast('Deleted', `${name} has been removed.`, 'success');
    }
  });
});

// ---- Settings Vertical Tabs ----
window.switchSettingsTab = function (id, btn) {
  document.querySelectorAll('.settings-nav .stab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const pane = document.getElementById(id);
  if (pane) pane.classList.add('active');
};

// ---- Wire modal "create" buttons to toast (non-website modals) ----
window.addEventListener('DOMContentLoaded', () => {
  // SSL modal
  const sslBtn = document.querySelector('#addSslModal .btn-primary-soft');
  if (sslBtn) sslBtn.addEventListener('click', () => {
    const inp = document.querySelector('#addSslModal input');
    whpToast('SSL Issued', inp && inp.value ? `Certificate for ${inp.value} is being issued.` : 'SSL certificate issued successfully.', 'success');
  });
  // Domain modal
  const domBtn = document.querySelector('#addDomainModal .btn-primary-soft');
  if (domBtn) domBtn.addEventListener('click', () => {
    const inp = document.querySelector('#addDomainModal input');
    whpToast('Domain Added', inp && inp.value ? `${inp.value} has been added.` : 'Domain added successfully.', 'success');
  });
  // DB modal
  const dbBtn = document.querySelector('#addDbModal .btn-primary-soft');
  if (dbBtn) dbBtn.addEventListener('click', () => {
    const inp = document.querySelector('#addDbModal input');
    whpToast('Database Created', inp && inp.value ? `Database "${inp.value}" created.` : 'Database created successfully.', 'success');
  });
  // Email modal
  const mailBtn = document.querySelector('#addEmailModal .btn-primary-soft');
  if (mailBtn) mailBtn.addEventListener('click', () => {
    const inp = document.querySelector('#addEmailModal input[type="text"], #addEmailModal input:not([type])');
    whpToast('Email Created', inp && inp.value ? `${inp.value}@hostpanel.dev created.` : 'Email account created successfully.', 'success');
  });
  // Folder modal
  const folderBtn = document.querySelector('#newFolderModal .btn-primary-soft');
  if (folderBtn) folderBtn.addEventListener('click', () => {
    const inp = document.querySelector('#newFolderModal input');
    whpToast('Folder Created', inp && inp.value ? `Folder "${inp.value}" created.` : 'Folder created successfully.', 'success');
  });
});

/* ===== Button Loading Spinner ===== */
function btnLoading(btn, ms) {
  if (!btn) return;
  var orig = btn.innerHTML;
  btn.classList.add('is-loading');
  btn.disabled = true;
  var icon = btn.querySelector('i:first-child');
  var origIconClass = icon ? icon.className : '';
  if (icon) {
    icon.className = 'fa-solid fa-circle-notch fa-spin';
  }
  setTimeout(function () {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    if (icon) icon.className = origIconClass;
  }, ms || 1500);
}
// Auto-attach to buttons with data-loading attr
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-loading]');
  if (b) {
    var ms = parseInt(b.getAttribute('data-loading'), 10) || 1500;
    btnLoading(b, ms);
  }
});

/* ===== Empty State Toggle Helper ===== */
function showEmptyState(containerId, iconType, title, desc, actionHtml) {
  var icons = {
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3z"/></svg>',
    database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 4 5.7 4 9s-1.5 6.3-4 9c-2.5-2.7-4-5.7-4-9s1.5-6.3 4-9z"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5 5h14l3 9v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5l3-9z"/></svg>'
  };
  var c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = '<div class="empty-state">' +
    '<div class="es-icon">' + (icons[iconType] || icons.folder) + '</div>' +
    '<h4>' + title + '</h4><p>' + desc + '</p>' +
    '<div class="es-actions">' + (actionHtml || '') + '</div></div>';
}

/* ===== File Manager: folder tree toggle + drag-drop + chmod ===== */
function initFileManager() {
  // Folder tree expand/collapse
  document.querySelectorAll('.fm-tree-item.has-children').forEach(function (item) {
    item.addEventListener('click', function (e) {
      if (e.target.closest('.fm-tree-children')) return;
      item.classList.toggle('open');
      var next = item.nextElementSibling;
      if (next && next.classList.contains('fm-tree-children')) {
        next.classList.toggle('open');
      }
    });
  });
  // Tree item select
  document.querySelectorAll('.fm-tree-item').forEach(function (item) {
    item.addEventListener('click', function (e) {
      if (e.target.closest('.fm-tree-children')) return;
      document.querySelectorAll('.fm-tree-item').forEach(function (i) { i.classList.remove('active'); });
      item.classList.add('active');
    });
  });
  // Drag-drop zone
  // Drag-drop zone (handled by file-manager.ejs)
  // Removed duplicate handlers to avoid conflicts
  // File row select
  document.querySelectorAll('.fm-table tbody tr').forEach(function (row) {
    row.addEventListener('click', function (e) {
      if (e.target.closest('button') || e.target.closest('.fm-check input')) return;
      var cb = row.querySelector('.fm-check input');
      if (cb) cb.checked = !cb.checked;
      row.classList.toggle('selected-row', cb && cb.checked);
    });
  });
}

/* ===== SSL: auto-renew toggle feedback ===== */
function initSslToggles() {
  document.querySelectorAll('.ssl-renew-switch .form-check-input').forEach(function (sw) {
    sw.addEventListener('change', function () {
      var row = sw.closest('tr');
      var domain = row ? row.querySelector('.domain-name') : null;
      var dname = domain ? domain.textContent : 'certificate';
      if (typeof whpToast === 'function') {
        whpToast(
          'Auto-Renew ' + (sw.checked ? 'Enabled' : 'Disabled'),
          dname + ' will ' + (sw.checked ? 'now renew automatically before expiry.' : 'no longer auto-renew.'),
          sw.checked ? 'success' : 'info'
        );
      }
    });
  });
}

/* ===== Mobile Bottom Nav: set active based on current page ===== */
function initMobileBottomNav() {
  var path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.mobile-bottom-nav a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href === path) a.classList.add('active');
    // group mapping
    if (path === 'inbox.html' || path === 'read.html' || path === 'write.html' || path === 'emails.html') {
      if (href === 'inbox.html') a.classList.add('active');
    }
    if (path === 'files.html' && href === 'files.html') a.classList.add('active');
    if (path === 'ssl.html' || path === 'domains.html' || path === 'databases.html') {
      if (href === 'files.html') {} // no direct match, leave to exact
    }
  });
}

/* Init on DOM ready */
document.addEventListener('DOMContentLoaded', function () {
  initFileManager();
  initSslToggles();
  initMobileBottomNav();
});

/* ===== Inbox Empty State Toggle (demo) ===== */
function toggleInboxEmpty() {
  var list = document.getElementById('mailListWrap');
  var empty = document.getElementById('inboxEmpty');
  if (!list || !empty) return;
  if (empty.style.display === 'none') {
    list.style.display = 'none';
    empty.style.display = 'block';
  } else {
    list.style.display = '';
    empty.style.display = 'none';
  }
}

/* ===== Website Detail: Tab Switching ===== */
function switchWdTab(tabId, btn) {
  document.querySelectorAll('.wd-tab').forEach(function (t) { t.classList.remove('active'); });
  document.querySelectorAll('.wd-tab-pane').forEach(function (p) { p.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  var pane = document.getElementById(tabId);
  if (pane) pane.classList.add('active');
}

