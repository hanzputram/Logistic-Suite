/**
 * ATS Logistics Suite — Client Application Logic v2.0
 * 2-Stage Workflow: Marketing (Date Scheduling) → Dispatcher (Driver & Vehicle Assignment)
 * Clean White Business Theme • Accurate Online Integration
 */

const API = '';

// Application Global State
const state = {
  currentUser: null,
  userPermissions: [],
  shipments: [],
  trips: [],
  users: [],
  vehicles: [],
  zones: [],
  activeTab: 'tab-jadwal-marketing',
  selectedMktIds: new Set(),
  mktSearch: '',
  dispSearch: '',
  dispFilterZona: '',
  monSearch: '',
  monFilterDriver: '',
  monFilterDate: new Date().toISOString().split('T')[0],
  adminSearch: '',
  pickupSearch: '',
  pickupFilterStatus: '',
  // Master SKU & Pengkategorian
  skuItems: [],
  skuStats: { total: 0, besar: 0, sedang: 0, kecil: 0 },
  skuSearch: '',
  skuFilterSize: '',
  skuPage: 1,
  skuLimit: 50,
  skuTotalPages: 1,
  skuSelectedIds: new Set(),
  skuMode: 'scheduled', // 'scheduled' | 'all'
  skuScheduledPeriod: 'tomorrow',
  skuScheduledDate: '2026-10-02',
  // Otomasi Jalur Rute
  jalurFilterDate: new Date().toISOString().split('T')[0],
  jalurData: null,
  // Pengiriman Hari Ini (Command Center)
  todayDate: '2026-10-02',
  todaySearch: '',
  todayData: null,
  // Riwayat Semua Pengiriman
  histSearch: '',
  histPeriod: 'tomorrow',
  histVehicle: 'all',
  histDriver: 'all',
  histStatus: 'all',
  histStartDate: '',
  histEndDate: '',
  histPage: 1,
  histLimit: 50
};

// Driver & Vehicle Mappings
const DRIVER_VEHICLE_MAP = {
  'Munir': { vehicle: 'TRAGA', label: 'Isuzu Traga' },
  'Dani': { vehicle: 'CARRY', label: 'Suzuki Carry' },
  'Agus': { vehicle: 'GRANMAX', label: 'Gran Max (SIM A&C)' },
  'Arifin': { vehicle: 'AVANZA', label: 'Avanza (SIM A&C)' },
  'Angga': { vehicle: 'MOTOR', label: 'Motor (SIM C)' },
  'Markus': { vehicle: 'MOTOR', label: 'Motor (SIM C)' },
  'Zahril': { vehicle: 'MOTOR', label: 'Motor (SIM C)' },
  'Aldi': { vehicle: 'MOTOR', label: 'Motor (SIM C)' },
  'Hendrik': { vehicle: 'MOTOR', label: 'Motor (SIM C)' },
  'Cahyono': { vehicle: 'MOTOR', label: 'Motor' },
  'Pak Adi': { vehicle: 'MOTOR', label: 'Motor' }
};

// Deteksi apakah Surat Jalan adalah pengambilan di J23 (Customer Pickup / Ambil Sendiri)
// Pesanan pickup TIDAK BOLEH dimasukkan ke rute pengiriman driver atau jadwal kirim armada
function isPickupShipment(s) {
  if (!s) return false;
  const fType = String(s.fulfillment_type || '').toUpperCase();
  const type = String(s.type || '').toUpperCase();
  const status = String(s.status || '').toUpperCase();
  const notes = String(s.notes || '').toUpperCase();
  const addr = String(s.destination_address || '').toUpperCase();
  const shipMethod = String(s.ship_method || s.shipping_method || s.transporter_name || '').toUpperCase();

  if (fType.includes('PICKUP') || fType.includes('AMBIL')) return true;
  if (type === 'PICKUP') return true;
  if (status.startsWith('PICKUP')) return true;
  if (notes.includes('DIAMBIL') || notes.includes('AMBIL DI J23') || notes.includes('PICKUP')) return true;
  if (shipMethod.includes('DIAMBIL') || shipMethod.includes('AMBIL') || shipMethod.includes('PICKUP')) return true;
  if (addr.includes('LOKET') && addr.includes('PICKUP')) return true;
  if (addr.includes('DIAMBIL DI J23')) return true;
  return false;
}

const VEHICLE_DEFAULT_DRIVER = {
  'TRAGA': 'Munir',
  'CARRY': 'Dani',
  'GRANMAX': 'Agus',
  'AVANZA': 'Arifin',
  'MOTOR': 'Angga'
};

const DRIVER_SIM_MAP = {
  'Munir': ['A', 'C'],
  'Dani': ['A', 'C'],
  'Agus': ['A', 'C'],
  'Arifin': ['A', 'C'],
  'Cahyono': ['A', 'B1'],
  'Pak Adi': ['A'],
  'Angga': ['C'],
  'Markus': ['C'],
  'Zahril': ['C'],
  'Aldi': ['C'],
  'Hendrik': ['C']
};

const ALL_AVAILABLE_PERMS = [
  { id: 'tab.jadwal_marketing', label: 'Tab Jadwal Marketing' },
  { id: 'tab.penugasan_driver', label: 'Tab Penugasan Driver' },
  { id: 'tab.master_sku', label: 'Tab Master Kategori SKU' },
  { id: 'tab.otomasi_rute', label: 'Tab Otomasi Jalur Rute' },
  { id: 'tab.jadwal_harian', label: 'Tab Jadwal Harian' },
  { id: 'tab.checker', label: 'Tab Checker Dokumen' },
  { id: 'tab.urgent', label: 'Tab Persetujuan Urgent' },
  { id: 'tab.admin_users', label: 'Tab Kelola User (Admin)' },
  { id: 'action.schedule_date', label: 'Aksi: Jadwalkan Tanggal' },
  { id: 'action.assign_driver', label: 'Aksi: Tugaskan Driver' },
  { id: 'action.categorize_sku', label: 'Aksi: Atur Kategori SKU' },
  { id: 'action.optimize_routes', label: 'Aksi: Susun Rute Jalur' },
  { id: 'action.check_docs', label: 'Aksi: Verifikasi Dokumen' },
  { id: 'action.approve_urgent', label: 'Aksi: Approve Urgent' },
  { id: 'action.pull_accurate', label: 'Aksi: Tarik Accurate' },
  { id: 'action.manage_users', label: 'Aksi: CRUD User' }
];

// ==============================================================
// DOM READY & BOOTSTRAP
// ==============================================================
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initModals();
  initSidebarToggle();
  initFilterEvents();
  initTodayModule();
  initHistoryModule();
  initScheduledSkuModule();
  initRouteTabModule();
  initMasterRouteEvents();
  loadData();
});

function initSidebarToggle() {
  const btn = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (btn && sidebar) {
    btn.onclick = () => {
      sidebar.classList.toggle('open');
      backdrop?.classList.toggle('open');
    };
  }
  if (backdrop && sidebar) {
    backdrop.onclick = () => {
      sidebar.classList.remove('open');
      backdrop.classList.remove('open');
    };
  }
}

// ==============================================================
// TOAST NOTIFICATION SYSTEM
// ==============================================================
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconKeys = { success: 'check-circle', error: 'ban', warning: 'alert-triangle', info: 'info' };
  const iconSvg = getSvgIcon(iconKeys[type] || 'info', '', 18);
  toast.innerHTML = `
    <span style="display:inline-flex; align-items:center; flex-shrink:0;">${iconSvg}</span>
    <span style="flex:1;">${escapeHtml(message)}</span>
    <button class="toast-close" type="button">&times;</button>
  `;

  container.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(80px)';
    setTimeout(() => toast.remove(), 200);
  });

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.transition = 'all 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(80px)';
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}

// ==============================================================
// AUTHENTICATION & SESSION MANAGEMENT
// ==============================================================
function initAuth() {
  const formLogin = document.getElementById('form-login');
  const chips = document.querySelectorAll('.quick-chip');
  const btnLogout = document.getElementById('btn-logout');
  const btnHeaderLogin = document.getElementById('btn-header-login');

  // Check persisted session
  const savedUser = localStorage.getItem('ats_user');
  const savedPerms = localStorage.getItem('ats_permissions');
  const isExplicitLogout = sessionStorage.getItem('ats_logged_out') === '1';

  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
      state.userPermissions = savedPerms ? JSON.parse(savedPerms) : [];
      updateHeader(state.currentUser);
      renderTabs();
      hideLogin();
      switchTab(state.activeTab || 'tab-jadwal-marketing');
    } catch (e) {
      autoLoginAdmin();
    }
  } else if (!isExplicitLogout) {
    // Auto-login as Superadmin by default so the workspace is immediately operational
    autoLoginAdmin();
  } else {
    showLogin();
  }

  // Quick Login Chips
  chips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const username = chip.getAttribute('data-user');
      doLogin(username, 'password123');
    });
  });

  // Login form submit
  if (formLogin) {
    formLogin.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      if (username) doLogin(username, password);
    });
  }

  // Logout button
  if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
      e.preventDefault();
      handleLogout();
    });
  }

  // Header login button
  if (btnHeaderLogin) {
    btnHeaderLogin.addEventListener('click', (e) => {
      e.preventDefault();
      showLogin();
    });
  }
}

function autoLoginAdmin() {
  state.currentUser = {
    id: 'user-admin',
    name: 'Admin Logistics',
    username: 'admin',
    role: 'SUPERADMIN',
    department: 'OPERASIONAL',
    color_code: '#2563eb'
  };
  state.userPermissions = [
    'tab.jadwal_marketing', 'tab.penugasan_driver', 'tab.master_sku',
    'tab.otomasi_rute', 'tab.jadwal_harian', 'tab.checker', 'tab.urgent', 'tab.admin_users'
  ];
  localStorage.setItem('ats_user', JSON.stringify(state.currentUser));
  localStorage.setItem('ats_permissions', JSON.stringify(state.userPermissions));
  updateHeader(state.currentUser);
  renderTabs();
  hideLogin();
  switchTab('tab-jadwal-marketing');
  doLogin('admin', 'password123').catch(() => {});
}

async function doLogin(username, password) {
  const errorBox = document.getElementById('login-error-msg');
  if (errorBox) {
    errorBox.className = 'login-error-box';
    errorBox.textContent = '';
  }

  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success && data.user) {
      sessionStorage.removeItem('ats_logged_out');
      state.currentUser = data.user;
      state.userPermissions = data.permissions || [];

      localStorage.setItem('ats_token', data.token);
      localStorage.setItem('ats_user', JSON.stringify(data.user));
      localStorage.setItem('ats_permissions', JSON.stringify(state.userPermissions));

      updateHeader(data.user);
      renderTabs();
      hideLogin();

      // Pick default landing tab based on role
      pickLandingTab(data.user.role);

      showToast(`Selamat datang, ${data.user.name}!`, 'success');
      loadData();
    } else {
      showLoginError(data.message || 'Username atau password salah.');
    }
  } catch (err) {
    console.error('Login error:', err);
    showLoginError('Gagal menghubungi server. Pastikan server aktif.');
  }
}

function handleLogout() {
  localStorage.removeItem('ats_token');
  localStorage.removeItem('ats_user');
  localStorage.removeItem('ats_permissions');
  sessionStorage.setItem('ats_logged_out', '1');
  state.currentUser = null;
  state.userPermissions = [];

  // Notify server
  fetch(`${API}/api/auth/logout`, { method: 'POST' }).catch(() => {});

  updateHeader(null);
  renderTabs();
  showLogin();

  const errorBox = document.getElementById('login-error-msg');
  if (errorBox) {
    errorBox.textContent = 'Anda telah keluar dari sistem.';
    errorBox.className = 'login-error-box success-msg visible';
  }

  showToast('Berhasil keluar dari sistem.', 'info');
}

function showLogin() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.add('visible');
    overlay.style.display = 'flex';
  }
}

function hideLogin() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.style.display = 'none';
  }
}

function showLoginError(msg) {
  const errorBox = document.getElementById('login-error-msg');
  if (errorBox) {
    errorBox.textContent = msg;
    errorBox.className = 'login-error-box visible';
  }
}

function updateHeader(user) {
  const profileDisplay = document.getElementById('user-profile-display');
  const btnHeaderLogin = document.getElementById('btn-header-login');
  const nameLabel = document.getElementById('user-name-label');
  const roleLabel = document.getElementById('user-role-label');
  const avatar = document.getElementById('user-avatar');

  if (user) {
    if (profileDisplay) profileDisplay.style.display = 'flex';
    if (btnHeaderLogin) btnHeaderLogin.style.display = 'none';
    if (nameLabel) nameLabel.textContent = user.name;
    if (roleLabel) roleLabel.textContent = user.department || user.role;
    if (avatar) {
      const initials = (user.name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
      avatar.textContent = initials;
      if (user.color_code) avatar.style.background = user.color_code;
    }
  } else {
    if (profileDisplay) profileDisplay.style.display = 'none';
    if (btnHeaderLogin) btnHeaderLogin.style.display = 'inline-flex';
  }
}

// ==============================================================
// PERMISSION CHECK & DYNAMIC TABS
// ==============================================================
function hasPerm(permKey) {
  if (!state.currentUser) return false;
  if (state.currentUser.role === 'SUPERADMIN') return true;
  return state.userPermissions.includes(permKey);
}

const TAB_CONFIGS = [
  { id: 'tab-hari-ini', icon: 'sun', label: 'Pengiriman Hari Ini', perm: 'tab.jadwal_harian', roles: ['SUPERADMIN', 'DISPATCHER', 'MARKETING', 'KEPALA_OPERASIONAL', 'DRIVER', 'BACKUP_DRIVER'] },
  { id: 'tab-jadwal-marketing', icon: 'calendar', label: 'Jadwalkan Tanggal Kirim', perm: 'tab.jadwal_marketing', roles: ['SUPERADMIN', 'MARKETING'] },
  { id: 'tab-penugasan-driver', icon: 'truck', label: 'Penugasan Driver & Cek Muat', perm: 'tab.penugasan_driver', roles: ['SUPERADMIN', 'DISPATCHER'] },
  { id: 'tab-master-sku', icon: 'box', label: 'Pengkategorian SKU', perm: 'tab.master_sku', roles: ['SUPERADMIN', 'DISPATCHER', 'KEPALA_OPERASIONAL', 'MARKETING'] },
  { id: 'tab-otomasi-rute', icon: 'navigation', label: 'Optimasi & Pembagian Rute', perm: 'tab.otomasi_rute', roles: ['SUPERADMIN', 'DISPATCHER', 'KEPALA_OPERASIONAL', 'MARKETING'] },
  { id: 'tab-master-rute', icon: 'map', label: 'Master Rute (A, B, C...)', perm: 'tab.master_rute', roles: ['SUPERADMIN', 'DISPATCHER', 'KEPALA_OPERASIONAL', 'MARKETING'] },
  { id: 'tab-riwayat-semua', icon: 'archive', label: 'Riwayat Semua Pengiriman', perm: 'tab.jadwal_harian', roles: ['SUPERADMIN', 'DISPATCHER', 'MARKETING', 'KEPALA_OPERASIONAL', 'DRIVER'] },
  { id: 'tab-pickup-j23', icon: 'package', label: 'Ambil di J23 (Pickup)', perm: 'tab.jadwal_harian', roles: ['SUPERADMIN', 'DISPATCHER', 'MARKETING', 'KEPALA_OPERASIONAL', 'CHECKER_L1', 'CHECKER_L2', 'DRIVER'] },
  { id: 'tab-jadwal-harian', icon: 'clipboard', label: 'Jadwal Kirim Harian', perm: 'tab.jadwal_harian', roles: ['SUPERADMIN', 'DISPATCHER', 'MARKETING', 'KEPALA_OPERASIONAL', 'DRIVER', 'BACKUP_DRIVER'] },
  { id: 'tab-checker', icon: 'file-check', label: 'Pemeriksaan Dokumen', perm: 'tab.checker', roles: ['SUPERADMIN', 'CHECKER_L1', 'CHECKER_L2'] },
  { id: 'tab-urgent', icon: 'zap', label: 'Persetujuan Urgent', perm: 'tab.urgent', roles: ['SUPERADMIN', 'KEPALA_OPERASIONAL'] },
  { id: 'tab-admin-users', icon: 'settings', label: 'Kelola User & Permission', perm: 'tab.admin_users', roles: ['SUPERADMIN'] }
];

function canAccessTab(cfg) {
  if (!state.currentUser) return false;
  if (state.currentUser.role === 'SUPERADMIN') return true;
  if (hasPerm(cfg.perm)) return true;
  return cfg.roles.includes(state.currentUser.role);
}

function renderTabs() {
  const container = document.getElementById('toolbar-tabs');
  if (!container) return;

  container.innerHTML = '';
  if (!state.currentUser) return;

  const accessible = TAB_CONFIGS.filter(canAccessTab);

  accessible.forEach(tab => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tab-link ${tab.id === state.activeTab ? 'active' : ''}`;
    btn.setAttribute('data-tab', tab.id);
    btn.innerHTML = `
      ${getSvgIcon(tab.icon, 'svg-icon-tab', 16)}
      <span>${tab.label}</span>
      <span class="badge-num" id="badge-${tab.id}" style="display:none;">0</span>
    `;

    btn.addEventListener('click', () => {
      switchTab(tab.id);
    });

    container.appendChild(btn);
  });

  // If current active tab is not accessible, switch to the first one
  const isAccessible = accessible.some(t => t.id === state.activeTab);
  if (!isAccessible && accessible.length > 0) {
    switchTab(accessible[0].id);
  } else {
    switchTab(state.activeTab);
  }

  updateBadges();
}

function switchTab(tabId) {
  state.activeTab = tabId;

  const titleEl = document.getElementById('topbar-page-title');
  if (titleEl) {
    const t = TAB_CONFIGS.find(c => c.id === tabId);
    if (t) titleEl.textContent = t.label;
  }

  // On mobile screens, close sidebar when a tab is clicked
  if (window.innerWidth <= 900) {
    document.getElementById('app-sidebar')?.classList.remove('open');
    document.getElementById('sidebar-backdrop')?.classList.remove('open');
  }

  // Update tab links
  document.querySelectorAll('.tab-link').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update view sections
  document.querySelectorAll('.view-section').forEach(sec => {
    if (sec.id === tabId) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  if (tabId === 'tab-hari-ini') {
    loadTodayDashboard(state.todayDate);
  } else if (tabId === 'tab-riwayat-semua') {
    loadShipmentHistory();
  } else if (tabId === 'tab-master-sku') {
    loadScheduledSkuItems();
  } else if (tabId === 'tab-otomasi-rute') {
    loadJalurOverview();
  } else if (tabId === 'tab-master-rute') {
    loadMasterRoutes();
  }
}

function pickLandingTab(role) {
  if (state.activeTab) {
    switchTab(state.activeTab);
    return;
  }
  if (role === 'SUPERADMIN' || role === 'MARKETING') switchTab('tab-jadwal-marketing');
  else if (role === 'DISPATCHER') switchTab('tab-hari-ini');
  else if (role === 'CHECKER_L1' || role === 'CHECKER_L2') switchTab('tab-checker');
  else if (role === 'KEPALA_OPERASIONAL') switchTab('tab-urgent');
  else if (role === 'DRIVER' || role === 'BACKUP_DRIVER') switchTab('tab-jadwal-harian');
  else switchTab('tab-jadwal-marketing');
}

// ==============================================================
// DATA LOADING
// ==============================================================
async function loadData() {
  try {
    const [shipRes, tripsRes, usersRes, vehRes, zonesRes, statusRes, routesRes] = await Promise.all([
      fetch(`${API}/api/shipments`),
      fetch(`${API}/api/trips`),
      fetch(`${API}/api/users`),
      fetch(`${API}/api/vehicles`),
      fetch(`${API}/api/zones`),
      fetch(`${API}/api/status`),
      fetch(`${API}/api/master-routes`).catch(() => ({ json: () => ({ success: false }) }))
    ]);

    const shipData = await shipRes.json();
    const tripsData = await tripsRes.json();
    const usersData = await usersRes.json();
    const vehData = await vehRes.json();
    const zonesData = await zonesRes.json();
    const statusData = await statusRes.json();
    const routesData = await routesRes.json().catch(() => ({ success: false }));

    if (shipData.success) state.shipments = shipData.data || [];
    if (tripsData.success) state.trips = tripsData.data || [];
    if (usersData.success) state.users = usersData.data || [];
    if (vehData.success) state.vehicles = vehData.data || [];
    if (zonesData.success) state.zones = zonesData.data || [];
    if (routesData.success) state.masterRoutes = routesData.data || [];

    // Header Accurate status
    if (statusData.accurate) {
      const badge = document.getElementById('accurate-badge');
      const text = document.getElementById('accurate-text');
      if (statusData.accurate.connected) {
        if (badge) badge.className = 'status-badge connected';
        if (text) text.textContent = `Accurate: Terhubung (${statusData.accurate.warehouseCount} Gudang)`;
      } else {
        if (badge) badge.className = 'status-badge disconnected';
        if (text) text.textContent = 'Accurate: Terputus';
      }
    }

    populateZoneFilter();
    populateDriverFilter();
    renderAll();
  } catch (err) {
    console.error('Data loading error:', err);
  }
}

function renderAll() {
  renderMarketingTable();
  renderDispatcherTable();
  renderMonitorTable();
  renderPickupTable();
  renderCheckerTable();
  renderUrgentTable();
  if (canAccessTab({ perm: 'tab.admin_users', roles: ['SUPERADMIN'] })) {
    renderAdminTable();
  }
  updateBadges();
}

function updateBadges() {
  // Marketing badge: SJs in DRAFT / UNSCHEDULED (strictly excluding pickup)
  const draftCount = state.shipments.filter(s => (s.status === 'DRAFT' || s.status === 'UNSCHEDULED') && !isPickupShipment(s)).length;
  setBadge('badge-tab-jadwal-marketing', draftCount);

  // Dispatcher badge: SJs in SCHEDULED (strictly excluding pickup)
  const scheduledCount = state.shipments.filter(s => s.status === 'SCHEDULED' && !isPickupShipment(s)).length;
  setBadge('badge-tab-penugasan-driver', scheduledCount);
  setBadge('badge-tab-otomasi-rute', scheduledCount);

  // Monitor count: Assigned (strictly excluding pickup)
  const assignedCount = state.shipments.filter(s => s.status === 'ASSIGNED' && !isPickupShipment(s)).length;
  setBadge('badge-tab-jadwal-harian', assignedCount);

  // Pickup J23 count: Siap diambil di loket
  const pickupCount = state.shipments.filter(s => isPickupShipment(s) && s.status === 'PICKUP_READY').length;
  setBadge('badge-tab-pickup-j23', pickupCount);

  // Urgent count
  const urgentCount = state.trips.filter(t => t.is_urgent && t.status !== 'APPROVED').length;
  setBadge('badge-tab-urgent', urgentCount, true);
}

function setBadge(id, count, isUrgent = false) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.textContent = count;
    el.style.display = 'inline-block';
    if (isUrgent) el.classList.add('badge-urgent');
  } else {
    el.style.display = 'none';
  }
}

// ==============================================================
// MARKETING: ACCURATE ONLINE LIVE DELIVERY ORDER (DO) SEARCH & SCHEDULING
// ==============================================================
let doSearchDebounceTimer = null;

function initMarketingDoSearch() {
  const searchInput = document.getElementById('do-live-search-input');
  const searchBtn = document.getElementById('btn-do-search-exec');
  const recentBtn = document.getElementById('btn-do-show-recent');
  const dropdown = document.getElementById('do-search-dropdown');
  const spinner = document.getElementById('do-search-spinner');

  if (!searchInput) return;

  const performSearch = async (keywords = '') => {
    if (spinner) spinner.style.display = 'inline-block';
    try {
      const res = await fetch(`${API}/api/accurate/delivery-orders/search?q=${encodeURIComponent(keywords)}&limit=50`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal mencari Delivery Order di Accurate');
      renderDoSearchResults(json.data || []);
    } catch (err) {
      console.error('[DO Search Error]:', err);
      showToast('Gagal mencari DO Accurate: ' + err.message, 'error');
    } finally {
      if (spinner) spinner.style.display = 'none';
    }
  };

  searchInput.addEventListener('input', (e) => {
    clearTimeout(doSearchDebounceTimer);
    const val = e.target.value.trim();
    doSearchDebounceTimer = setTimeout(() => {
      performSearch(val);
    }, 350);
  });

  searchInput.addEventListener('focus', () => {
    if (dropdown && dropdown.children.length > 0) {
      dropdown.style.display = 'block';
    } else {
      performSearch(searchInput.value.trim());
    }
  });

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      performSearch(searchInput.value.trim());
    });
  }

  if (recentBtn) {
    recentBtn.addEventListener('click', () => {
      searchInput.value = '';
      performSearch('');
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.do-search-box-wrap')) {
      if (dropdown) dropdown.style.display = 'none';
    }
  });

  // Scheduling card events
  const btnCloseCard = document.getElementById('btn-do-card-close');
  const btnCancelCard = document.getElementById('btn-do-card-cancel');
  const btnSubmitCard = document.getElementById('btn-do-card-submit');
  const btnMapPickerFromCard = document.getElementById('btn-open-map-picker-from-card');

  [btnCloseCard, btnCancelCard].forEach(b => {
    if (b) b.addEventListener('click', () => {
      const card = document.getElementById('do-scheduling-card');
      if (card) card.style.display = 'none';
      state.activeDo = null;
    });
  });

  if (btnMapPickerFromCard) {
    btnMapPickerFromCard.addEventListener('click', () => {
      const latVal = document.getElementById('do-card-lat')?.value;
      const lngVal = document.getElementById('do-card-lng')?.value;
      const zoneBadge = document.getElementById('do-card-zone-badge');
      const currentZone = zoneBadge ? zoneBadge.textContent.replace('Zona ', '').trim() : 'B';
      const currentAddress = document.getElementById('do-card-address')?.value || '';

      openMapPickerModal(latVal, lngVal, currentZone, (picked) => {
        const inputLat = document.getElementById('do-card-lat');
        const inputLng = document.getElementById('do-card-lng');
        const statusEl = document.getElementById('do-card-geocode-status');
        if (inputLat) inputLat.value = picked.lat;
        if (inputLng) inputLng.value = picked.lng;
        if (zoneBadge) zoneBadge.textContent = `Zona ${picked.zoneCode}`;
        if (statusEl) statusEl.innerHTML = `<span style="color:#15803d; font-weight:700;">✅ Dipilih dari Peta: Zona ${picked.zoneCode}</span>`;
        showToast(`Titik koordinat berhasil diset ke ${picked.lat}, ${picked.lng} (Zona ${picked.zoneCode})`, 'success');
      }, currentAddress);
    });
  }

  setupCardAddressAutoGeocode();

  if (btnSubmitCard) {
    btnSubmitCard.addEventListener('click', () => {
      submitDoSchedule();
    });
  }
}

function renderDoSearchResults(dos) {
  const dropdown = document.getElementById('do-search-dropdown');
  if (!dropdown) return;

  if (dos.length === 0) {
    dropdown.innerHTML = `
      <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px;">
        Tidak ada Dokumen Pengiriman (DO / JC / IT / MA) yang sesuai di Accurate Online.
      </div>
    `;
    dropdown.style.display = 'block';
    return;
  }

  dropdown.innerHTML = dos.map(d => {
    const isScheduled = d.isScheduled;
    const planInfo = d.existingPlanDate ? `(Tgl: ${d.existingPlanDate})` : '';

    let typeBadge = '';
    const dtype = (d.docType || 'DO').toUpperCase();
    if (dtype === 'JC') {
      typeBadge = `<span class="badge" style="background:#7c3aed; color:white; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">JC (Job Costing)</span>`;
    } else if (dtype === 'IT') {
      typeBadge = `<span class="badge" style="background:#d97706; color:white; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">IT (Pindah Barang)</span>`;
    } else if (dtype === 'MA') {
      typeBadge = `<span class="badge" style="background:#0f766e; color:white; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">MA (Penyesuaian)</span>`;
    } else {
      typeBadge = `<span class="badge" style="background:#2563eb; color:white; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">DO (Pengiriman)</span>`;
    }

    const safeNumber = (d.number || '').replace(/'/g, "\\'");
    const safeDocType = dtype.replace(/'/g, "\\'");

    return `
      <div class="do-search-item" onclick="window.selectDoForScheduling('${d.accurateId}', '${safeDocType}', '${safeNumber}')">
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px; flex-wrap:wrap;">
            <span class="do-search-item-number">${escapeHtml(d.number)}</span>
            ${typeBadge}
            <span class="status-pill ${isScheduled ? 'jalan' : 'siap'}" style="font-size:10px; padding:2px 6px;">
              ${isScheduled ? `Sudah Dijadwalkan ${planInfo}` : 'Belum Dijadwalkan'}
            </span>
            ${d.poNumber ? `<span style="font-size:11px; color:#64748b;">(Ref/PO: ${escapeHtml(d.poNumber)})</span>` : ''}
          </div>
          <div class="do-search-item-cust">${escapeHtml(d.customerName)}</div>
          <div class="do-search-item-addr">${escapeHtml(d.address || 'Alamat belum tercantum di Accurate')}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px; color:#64748b;">Tgl: ${escapeHtml(d.transDate || '-')}</div>
          <button type="button" class="btn btn-outline btn-xs" style="margin-top:4px; font-weight:600; color:#2563eb;">
            Pilih & Atur Jadwal &rarr;
          </button>
        </div>
      </div>
    `;
  }).join('');

  dropdown.style.display = 'block';
}

window.selectDoForScheduling = async function(accurateId, docType = 'DO', docNumber = '') {
  const dropdown = document.getElementById('do-search-dropdown');
  if (dropdown) dropdown.style.display = 'none';

  const typeLabel = docType === 'JC' ? 'Job Costing (JC)' : docType === 'IT' ? 'Transfer Barang (IT)' : docType === 'MA' ? 'Penyesuaian Bahan (MA)' : 'Delivery Order (DO)';
  showToast(`Mengambil rincian ${typeLabel} dari Accurate...`, 'info', 1000);

  try {
    const res = await fetch(`${API}/api/accurate/delivery-orders/${accurateId}/preview?type=${encodeURIComponent(docType)}&number=${encodeURIComponent(docNumber)}`);
    const json = await res.json();
    if (!json.success || !json.data) throw new Error(json.error || 'Data dokumen tidak ditemukan');

    const d = json.data;
    d.docType = docType || d.docType || 'DO';
    state.activeDo = d;

    const card = document.getElementById('do-scheduling-card');
    const titleEl = document.getElementById('do-card-title');
    const typeBadge = document.getElementById('do-card-type-badge');
    const custEl = document.getElementById('do-card-customer');
    const poEl = document.getElementById('do-card-po');
    const transDateEl = document.getElementById('do-card-transdate');
    const statusBadge = document.getElementById('do-card-status-badge');
    const itemCountEl = document.getElementById('do-card-item-count');
    const itemsTbody = document.getElementById('do-card-items-tbody');
    const addrInput = document.getElementById('do-card-address');
    const latInput = document.getElementById('do-card-lat');
    const lngInput = document.getElementById('do-card-lng');
    const zoneBadge = document.getElementById('do-card-zone-badge');
    const dateInput = document.getElementById('do-card-plan-date');
    const prioritySel = document.getElementById('do-card-priority');
    const notesInput = document.getElementById('do-card-notes');

    if (titleEl) titleEl.textContent = d.number;
    if (typeBadge) {
      typeBadge.textContent = d.docTypeLabel || `${d.docType} Accurate`;
      if (d.docType === 'JC') {
        typeBadge.style.background = '#7c3aed';
        typeBadge.style.color = '#ffffff';
      } else if (d.docType === 'IT') {
        typeBadge.style.background = '#d97706';
        typeBadge.style.color = '#ffffff';
      } else if (d.docType === 'MA') {
        typeBadge.style.background = '#0f766e';
        typeBadge.style.color = '#ffffff';
      } else {
        typeBadge.style.background = '#2563eb';
        typeBadge.style.color = '#ffffff';
      }
    }
    if (custEl) custEl.textContent = d.customerName;
    if (poEl) poEl.textContent = d.poNumber || '-';
    if (transDateEl) transDateEl.textContent = d.transDate || '-';

    if (statusBadge) {
      if (d.isScheduled) {
        statusBadge.style.display = 'inline-block';
        statusBadge.textContent = `Sudah Dijadwalkan (${d.existingPlanDate || ''})`;
      } else {
        statusBadge.style.display = 'none';
      }
    }

    if (itemCountEl) itemCountEl.textContent = d.itemCount || 0;
    if (itemsTbody) {
      itemsTbody.innerHTML = (d.items || []).map((it, idx) => `
        <tr>
          <td style="text-align:center; font-weight:700;">${idx + 1}</td>
          <td><code style="font-weight:700; color:#1e293b;">${escapeHtml(it.sku)}</code></td>
          <td><div style="font-weight:600; color:var(--text-main);">${escapeHtml(it.name)}</div></td>
          <td style="text-align:center; font-weight:700;">${it.quantity}</td>
          <td>${escapeHtml(it.unitName || 'PCS')}</td>
        </tr>
      `).join('');
    }

    if (addrInput) addrInput.value = d.address || '';
    if (latInput) latInput.value = d.lat || -7.30211;
    if (lngInput) lngInput.value = d.lng || 112.7819;
    if (zoneBadge) zoneBadge.textContent = `Zona ${d.zoneCode || 'B'}`;

    if (dateInput) {
      dateInput.value = d.existingPlanDate || '2026-10-02';
    }

    if (prioritySel) prioritySel.value = 'NORMAL';
    if (notesInput) notesInput.value = d.notes || '';

    if (card) {
      card.style.display = 'block';
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (err) {
    console.error('[Select DO Error]:', err);
    showToast('Gagal memuat rincian: ' + err.message, 'error');
  }
};

async function submitDoSchedule() {
  if (!state.activeDo) {
    showToast('Pilih dokumen (DO / JC / IT / MA) terlebih dahulu', 'warning');
    return;
  }

  const dateInput = document.getElementById('do-card-plan-date');
  const planDate = dateInput?.value;
  if (!planDate) {
    showToast('Tanggal rencana kirim wajib diisi', 'warning');
    return;
  }

  const customAddress = document.getElementById('do-card-address')?.value || '';
  const latVal = parseFloat(document.getElementById('do-card-lat')?.value) || -7.30211;
  const lngVal = parseFloat(document.getElementById('do-card-lng')?.value) || 112.7819;
  const zoneText = document.getElementById('do-card-zone-badge')?.textContent || 'Zona B';
  const zoneCode = zoneText.replace('Zona ', '').trim();
  const priority = document.getElementById('do-card-priority')?.value || 'NORMAL';
  const notes = document.getElementById('do-card-notes')?.value || '';

  const btnSubmit = document.getElementById('btn-do-card-submit');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = '⏳ Menyimpan Jadwal...';
  }

  try {
    const res = await fetch(`${API}/api/accurate/delivery-orders/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accurateId: state.activeDo.accurateId,
        docType: state.activeDo.docType || 'DO',
        planDate,
        customAddress,
        lat: latVal,
        lng: lngVal,
        zoneCode,
        priority,
        notes,
        scheduledBy: state.currentUser?.name || 'Marketing'
      })
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.error || json.message || 'Gagal menjadwalkan pengiriman');

    showToast(`✅ ${json.message || 'Dokumen pengiriman berhasil dijadwalkan!'}`, 'success');

    const card = document.getElementById('do-scheduling-card');
    if (card) card.style.display = 'none';
    state.activeDo = null;

    await loadData();
    loadScheduledSkuItems();
  } catch (err) {
    console.error('[Submit Schedule Error]:', err);
    showToast('Gagal menjadwalkan: ' + err.message, 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '🗓️ Simpan & Jadwalkan Pengiriman';
    }
  }
}

// ==============================================================
// LEAFLET MAP PICKER MODAL
// ==============================================================
let leafletMap = null;
let leafletMarker = null;
let mapPickerCallback = null;
let currentPickedLat = -7.30211;
let currentPickedLng = 112.7819;
let currentPickedZone = 'B';

function detectZoneFromCoords(lat, lng) {
  if (lat > -7.22 && lng < 112.65) return { zone: 'A', name: 'Zona A (Gresik / Manyar / KIM)' };
  if (lat > -7.27 && lng < 112.70) return { zone: 'A', name: 'Zona A (Margomulyo / Tandes)' };
  if (lat < -7.52 && lng < 112.65) return { zone: 'NG', name: 'Zona NG (Mojokerto / Ngoro NIP)' };
  if (lat < -7.50 && lng > 112.75) return { zone: 'PSR', name: 'Zona PSR (Pasuruan / PIER Rembang)' };
  if (lat < -7.42) return { zone: 'C', name: 'Zona C (Sidoarjo Kota / Buduran / Candi)' };
  if (lat < -7.33) return { zone: 'B', name: 'Zona B (Sidoarjo Utara / Waru / Berbek)' };
  return { zone: 'FR', name: 'Zona FR (Surabaya Timur / Rungkut / SIER)' };
}

window.openMapPickerModal = function(initialLat, initialLng, initialZone, onSave, addressText = '') {
  const modal = document.getElementById('modal-map-picker');
  if (!modal) {
    console.error('modal-map-picker element not found');
    return;
  }
  mapPickerCallback = onSave;

  const latNum = parseFloat(initialLat);
  const lngNum = parseFloat(initialLng);
  currentPickedLat = (!isNaN(latNum) && latNum !== 0) ? latNum : -7.30211;
  currentPickedLng = (!isNaN(lngNum) && lngNum !== 0) ? lngNum : 112.7819;
  currentPickedZone = initialZone || 'B';

  const searchInput = document.getElementById('map-search-address-input');
  if (searchInput) {
    searchInput.value = addressText || '';
  }

  openModal(modal);
  modal.style.display = 'flex';

  setTimeout(() => {
    const container = document.getElementById('leaflet-map-container');
    if (container && typeof L !== 'undefined') {
      if (!leafletMap) {
        if (container._leaflet_id) {
          container._leaflet_id = null;
        }
        try {
          leafletMap = L.map('leaflet-map-container').setView([currentPickedLat, currentPickedLng], 14);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
          }).addTo(leafletMap);

          leafletMarker = L.marker([currentPickedLat, currentPickedLng], { draggable: true }).addTo(leafletMap);

          leafletMarker.on('dragend', () => {
            const pos = leafletMarker.getLatLng();
            setPickedPosition(pos.lat, pos.lng);
          });

          leafletMap.on('click', (e) => {
            leafletMarker.setLatLng(e.latlng);
            setPickedPosition(e.latlng.lat, e.latlng.lng);
          });
        } catch (err) {
          console.error('Error initializing Leaflet:', err);
        }
      } else {
        leafletMap.invalidateSize();
        leafletMap.setView([currentPickedLat, currentPickedLng], 14);
        if (leafletMarker) leafletMarker.setLatLng([currentPickedLat, currentPickedLng]);
      }
    }

    setPickedPosition(currentPickedLat, currentPickedLng, currentPickedZone);

    // If an address was typed in the card, automatically search and center the map on it
    if (addressText && addressText.trim().length > 3) {
      searchAddressOnMap(addressText, false);
    }
  }, 100);

  setTimeout(() => {
    if (leafletMap) leafletMap.invalidateSize();
  }, 300);
};

async function searchAddressOnMap(query, showToastMsg = true) {
  if (!query || query.trim().length < 2) return;
  const suggestionsBox = document.getElementById('map-search-suggestions');
  const btnSearch = document.getElementById('btn-map-search-exec');

  try {
    if (btnSearch) {
      btnSearch.disabled = true;
      btnSearch.textContent = 'Mencari...';
    }

    const res = await fetch(`${API}/api/geocode?q=${encodeURIComponent(query.trim())}`);
    const json = await res.json();

    if (json.success && json.results && json.results.length > 0) {
      const top = json.results[0];

      if (leafletMap) {
        leafletMap.flyTo([top.lat, top.lng], 15, { duration: 0.8 });
      }
      if (leafletMarker) {
        leafletMarker.setLatLng([top.lat, top.lng]);
      }
      setPickedPosition(top.lat, top.lng, top.zoneCode);

      if (showToastMsg) {
        const shortName = top.display_name.split(',')[0];
        showToast(`📍 Lokasi ditemukan: ${shortName} (Zona ${top.zoneCode})`, 'success');
      }

      if (suggestionsBox && json.results.length > 1) {
        suggestionsBox.innerHTML = json.results.map((r, i) => `
          <div class="address-suggest-item" onclick="window.selectMapSearchResult(${i})">
            <div>
              <div class="suggest-title">${escapeHtml(r.display_name.split(',')[0])}</div>
              <div class="suggest-sub">${escapeHtml(r.display_name)}</div>
            </div>
            <div class="suggest-zone">
              <span class="zone-badge">Zona ${escapeHtml(r.zoneCode)}</span>
            </div>
          </div>
        `).join('');
        window._currentMapSearchResults = json.results;
        suggestionsBox.style.display = 'block';
      } else if (suggestionsBox) {
        suggestionsBox.style.display = 'none';
      }
    } else {
      if (showToastMsg) {
        showToast(`Alamat "${query}" tidak ditemukan di peta. Coba masukkan nama jalan utama atau kawasan industri.`, 'warning');
      }
      if (suggestionsBox) suggestionsBox.style.display = 'none';
    }
  } catch (err) {
    console.error('Geocode search error:', err);
  } finally {
    if (btnSearch) {
      btnSearch.disabled = false;
      btnSearch.textContent = '🔍 Cari di Peta';
    }
  }
}

window.selectMapSearchResult = function(index) {
  const list = window._currentMapSearchResults || [];
  const r = list[index];
  if (!r) return;
  const suggestionsBox = document.getElementById('map-search-suggestions');
  if (suggestionsBox) suggestionsBox.style.display = 'none';

  if (leafletMap) {
    leafletMap.flyTo([r.lat, r.lng], 15, { duration: 0.8 });
  }
  if (leafletMarker) {
    leafletMarker.setLatLng([r.lat, r.lng]);
  }
  setPickedPosition(r.lat, r.lng, r.zoneCode);
  showToast(`Titik disetel ke: ${r.display_name.split(',')[0]} (Zona ${r.zoneCode})`, 'success');
};

let cardAddressDebounceTimer = null;

function setupCardAddressAutoGeocode() {
  const addrInput = document.getElementById('do-card-address');
  const btnFind = document.getElementById('btn-do-card-find-coords');
  const suggestionsBox = document.getElementById('do-card-address-suggestions');
  const statusEl = document.getElementById('do-card-geocode-status');

  if (addrInput) {
    addrInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearTimeout(cardAddressDebounceTimer);
      if (val.length < 3) {
        if (statusEl) statusEl.textContent = '';
        if (suggestionsBox) suggestionsBox.style.display = 'none';
        return;
      }
      if (statusEl) statusEl.innerHTML = `<span style="color:#64748b;">Mendeteksi titik peta...</span>`;
      cardAddressDebounceTimer = setTimeout(() => {
        executeCardAddressGeocode(val);
      }, 700);
    });
  }

  if (btnFind) {
    btnFind.addEventListener('click', () => {
      const val = addrInput ? addrInput.value.trim() : '';
      if (val) executeCardAddressGeocode(val, true);
    });
  }
}

async function executeCardAddressGeocode(addressText, isManual = false) {
  const statusEl = document.getElementById('do-card-geocode-status');
  const latInput = document.getElementById('do-card-lat');
  const lngInput = document.getElementById('do-card-lng');
  const zoneBadge = document.getElementById('do-card-zone-badge');
  const suggestionsBox = document.getElementById('do-card-address-suggestions');

  try {
    const res = await fetch(`${API}/api/geocode?q=${encodeURIComponent(addressText)}`);
    const json = await res.json();

    if (json.success && json.results && json.results.length > 0) {
      const top = json.results[0];
      if (latInput) latInput.value = Number(top.lat).toFixed(6);
      if (lngInput) lngInput.value = Number(top.lng).toFixed(6);
      if (zoneBadge) zoneBadge.textContent = `Zona ${top.zoneCode}`;

      if (statusEl) {
        statusEl.innerHTML = `<span style="color:#15803d; font-weight:700;">✅ Terdeteksi: Zona ${top.zoneCode}</span>`;
      }

      if (isManual) {
        showToast(`Titik berhasil dideteksi: ${top.display_name.split(',')[0]} (Zona ${top.zoneCode})`, 'success');
      }

      if (suggestionsBox && json.results.length > 1) {
        suggestionsBox.innerHTML = json.results.map((r, i) => `
          <div class="address-suggest-item" onclick="window.selectCardAddressSuggestion(${i})">
            <div>
              <div class="suggest-title">${escapeHtml(r.display_name.split(',')[0])}</div>
              <div class="suggest-sub">${escapeHtml(r.display_name)}</div>
            </div>
            <div class="suggest-zone">
              <span class="zone-badge">Zona ${escapeHtml(r.zoneCode)}</span>
            </div>
          </div>
        `).join('');
        window._currentCardAddressResults = json.results;
        suggestionsBox.style.display = 'block';
      } else if (suggestionsBox) {
        suggestionsBox.style.display = 'none';
      }
    } else {
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:#b45309;">⚠️ Titik belum terdeteksi (Gunakan tombol Buka Peta)</span>`;
      }
      if (suggestionsBox) suggestionsBox.style.display = 'none';
      if (isManual) {
        showToast(`Lokasi tidak ditemukan otomatis. Silakan klik "Buka Peta & Pick Titik Koordinat".`, 'warning');
      }
    }
  } catch (err) {
    console.error('Card geocode error:', err);
    if (statusEl) statusEl.textContent = '';
  }
}

window.selectCardAddressSuggestion = function(index) {
  const list = window._currentCardAddressResults || [];
  const r = list[index];
  if (!r) return;
  const latInput = document.getElementById('do-card-lat');
  const lngInput = document.getElementById('do-card-lng');
  const zoneBadge = document.getElementById('do-card-zone-badge');
  const suggestionsBox = document.getElementById('do-card-address-suggestions');
  const statusEl = document.getElementById('do-card-geocode-status');

  if (latInput) latInput.value = Number(r.lat).toFixed(6);
  if (lngInput) lngInput.value = Number(r.lng).toFixed(6);
  if (zoneBadge) zoneBadge.textContent = `Zona ${r.zoneCode}`;
  if (statusEl) statusEl.innerHTML = `<span style="color:#15803d; font-weight:700;">✅ Terpilih: Zona ${r.zoneCode}</span>`;
  if (suggestionsBox) suggestionsBox.style.display = 'none';

  showToast(`Koordinat diatur ke: ${r.display_name.split(',')[0]} (Zona ${r.zoneCode})`, 'success');
};

function setPickedPosition(lat, lng, explicitZone = null) {
  currentPickedLat = lat;
  currentPickedLng = lng;
  const detected = detectZoneFromCoords(lat, lng);
  currentPickedZone = explicitZone || detected.zone;

  const coordsEl = document.getElementById('map-picked-coords');
  const zoneEl = document.getElementById('map-picked-zone-text');
  const badgeEl = document.getElementById('map-modal-zone-badge');

  if (coordsEl) coordsEl.textContent = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  if (zoneEl) zoneEl.textContent = detected.name;
  if (badgeEl) badgeEl.textContent = `Zona ${currentPickedZone}`;
}

function initMapPickerEvents() {
  const modal = document.getElementById('modal-map-picker');
  const btnClose = document.getElementById('btn-close-map-picker');
  const btnCancel = document.getElementById('btn-cancel-map-picker');
  const btnSave = document.getElementById('btn-save-map-picker');
  const btnMapSearch = document.getElementById('btn-map-search-exec');
  const inputMapSearch = document.getElementById('map-search-address-input');

  [btnClose, btnCancel].forEach(b => {
    if (b) b.addEventListener('click', () => {
      closeModal(modal);
    });
  });

  if (btnMapSearch && inputMapSearch) {
    btnMapSearch.addEventListener('click', () => {
      searchAddressOnMap(inputMapSearch.value, true);
    });

    inputMapSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchAddressOnMap(inputMapSearch.value, true);
      }
    });
  }

  // Dismiss suggestions on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#do-card-address') && !e.target.closest('#do-card-address-suggestions')) {
      const s = document.getElementById('do-card-address-suggestions');
      if (s) s.style.display = 'none';
    }
    if (!e.target.closest('#map-search-address-input') && !e.target.closest('#map-search-suggestions')) {
      const s = document.getElementById('map-search-suggestions');
      if (s) s.style.display = 'none';
    }
  });

  // Preset buttons
  document.querySelectorAll('.btn-map-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const lat = parseFloat(btn.getAttribute('data-lat'));
      const lng = parseFloat(btn.getAttribute('data-lng'));
      const zone = btn.getAttribute('data-zone');
      if (!isNaN(lat) && !isNaN(lng)) {
        if (leafletMap) {
          leafletMap.flyTo([lat, lng], 14, { duration: 0.8 });
        }
        if (leafletMarker) {
          leafletMarker.setLatLng([lat, lng]);
        }
        setPickedPosition(lat, lng, zone);
      }
    });
  });

  if (btnSave) {
    btnSave.addEventListener('click', () => {
      if (mapPickerCallback) {
        mapPickerCallback({
          lat: Number(currentPickedLat).toFixed(6),
          lng: Number(currentPickedLng).toFixed(6),
          zoneCode: currentPickedZone
        });
      }
      closeModal(modal);
    });
  }

  // Also hook "Buka Peta & Pick Koordinat" button inside modal-edit-address
  const btnOpenFromEdit = document.getElementById('btn-open-map-picker-from-edit');
  if (btnOpenFromEdit) {
    btnOpenFromEdit.addEventListener('click', () => {
      const inputLat = document.getElementById('edit-addr-lat');
      const inputLng = document.getElementById('edit-addr-lng');
      const inputZone = document.getElementById('edit-addr-zone');
      const inputAddr = document.getElementById('edit-addr-destination');

      const latVal = inputLat ? inputLat.value : '';
      const lngVal = inputLng ? inputLng.value : '';
      const zoneVal = inputZone ? inputZone.value : '';
      const addrVal = inputAddr ? inputAddr.value : '';

      openMapPickerModal(latVal, lngVal, zoneVal, (picked) => {
        if (inputLat) inputLat.value = picked.lat;
        if (inputLng) inputLng.value = picked.lng;
        if (inputZone) inputZone.value = picked.zoneCode;
        const coordsInput = document.getElementById('edit-addr-coords-input');
        if (coordsInput) coordsInput.value = `${picked.lat}, ${picked.lng}`;
        const previewLink = document.getElementById('edit-addr-preview-link');
        if (previewLink) {
          previewLink.href = `https://www.google.com/maps?q=${picked.lat},${picked.lng}`;
          previewLink.style.display = 'inline-flex';
          previewLink.textContent = `Buka Titik (${picked.lat}, ${picked.lng}) di Google Maps`;
        }
        showToast(`Titik peta (${picked.lat}, ${picked.lng}) diterapkan ke form alamat!`, 'success');
      }, addrVal);
    });
  }
}

// ==============================================================
// FILTERS INITIALIZATION
// ==============================================================
function initFilterEvents() {
  // Init DO Live Search & Map Picker
  initMarketingDoSearch();
  initMapPickerEvents();

  // Pickup search & filter
  const pickupSearch = document.getElementById('pickup-search');
  if (pickupSearch) {
    pickupSearch.addEventListener('input', (e) => {
      state.pickupSearch = e.target.value.toLowerCase();
      renderPickupTable();
    });
  }

  const pickupFilterStatus = document.getElementById('pickup-filter-status');
  if (pickupFilterStatus) {
    pickupFilterStatus.addEventListener('change', (e) => {
      state.pickupFilterStatus = e.target.value;
      renderPickupTable();
    });
  }

  // Marketing search & date filter
  const mktSearch = document.getElementById('mkt-search');
  if (mktSearch) {
    mktSearch.addEventListener('input', (e) => {
      state.mktSearch = e.target.value.toLowerCase();
      renderMarketingTable();
    });
  }

  const mktFilterDate = document.getElementById('mkt-filter-date');
  if (mktFilterDate) {
    mktFilterDate.addEventListener('change', (e) => {
      state.mktFilterDate = e.target.value;
      renderMarketingTable();
    });
  }

  // Accurate pull button
  const btnPull = document.getElementById('btn-pull-accurate');
  if (btnPull) {
    btnPull.addEventListener('click', async () => {
      btnPull.disabled = true;
      btnPull.innerHTML = `<span>⏳</span> Menarik Accurate...`;
      try {
        const res = await fetch(`${API}/api/accurate/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 100 })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Berhasil menarik ${data.savedCount || 0} SJ baru dari Accurate Online!`, 'success');
          loadData();
        } else {
          showToast(data.error || 'Gagal sinkronisasi Accurate', 'error');
        }
      } catch (err) {
        showToast('Gagal menghubungi server Accurate', 'error');
      } finally {
        btnPull.disabled = false;
        btnPull.textContent = 'Tarik SJ Baru dari Accurate';
      }
    });
  }

  // Dispatcher search & zone filter
  const dispSearch = document.getElementById('disp-search');
  if (dispSearch) {
    dispSearch.addEventListener('input', (e) => {
      state.dispSearch = e.target.value.toLowerCase();
      renderDispatcherTable();
    });
  }

  const dispFilterZona = document.getElementById('disp-filter-zona');
  if (dispFilterZona) {
    dispFilterZona.addEventListener('change', (e) => {
      state.dispFilterZona = e.target.value;
      renderDispatcherTable();
      checkZoneLockStatus(e.target.value);
    });
  }

  // Monitor search, driver filter, date filter, print
  const monSearch = document.getElementById('mon-search');
  if (monSearch) {
    monSearch.addEventListener('input', (e) => {
      state.monSearch = e.target.value.toLowerCase();
      renderMonitorTable();
    });
  }

  const monFilterDriver = document.getElementById('mon-filter-driver');
  if (monFilterDriver) {
    monFilterDriver.addEventListener('change', (e) => {
      state.monFilterDriver = e.target.value;
      renderMonitorTable();
    });
  }

  const monFilterDate = document.getElementById('mon-filter-date');
  if (monFilterDate) {
    monFilterDate.value = state.monFilterDate;
    monFilterDate.addEventListener('change', (e) => {
      state.monFilterDate = e.target.value;
      renderMonitorTable();
    });
  }

  const btnPrint = document.getElementById('btn-print');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

    // Admin user search
    const adminSearch = document.getElementById('admin-search');
    if (adminSearch) {
      adminSearch.addEventListener('input', (e) => {
        state.adminSearch = e.target.value.toLowerCase();
        renderAdminTable();
      });
    }

    // SKU Search & Filter
    const skuSearch = document.getElementById('sku-search');
    if (skuSearch) {
      let debounceTimer;
      skuSearch.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.skuSearch = e.target.value.toLowerCase().trim();
          loadSkuItems(1);
        }, 300);
      });
    }

    const skuFilterSize = document.getElementById('sku-filter-size');
    if (skuFilterSize) {
      skuFilterSize.addEventListener('change', (e) => {
        state.skuFilterSize = e.target.value;
        loadSkuItems(1);
      });
    }

    const btnSyncSku = document.getElementById('btn-sync-sku-accurate');
    if (btnSyncSku) {
      btnSyncSku.addEventListener('click', () => {
        syncSkuFromAccurate();
      });
    }

    const btnRecalcAll = document.getElementById('btn-recalc-all-muat');
    if (btnRecalcAll) {
      btnRecalcAll.addEventListener('click', () => {
        recalculateAllMuat();
      });
    }

    const skuPrev = document.getElementById('sku-prev-page');
    if (skuPrev) {
      skuPrev.addEventListener('click', () => {
        if (state.skuPage > 1) loadSkuItems(state.skuPage - 1);
      });
    }

    const skuNext = document.getElementById('sku-next-page');
    if (skuNext) {
      skuNext.addEventListener('click', () => {
        if (state.skuPage < state.skuTotalPages) loadSkuItems(state.skuPage + 1);
      });
    }

    const skuSelectAll = document.getElementById('sku-select-all');
    if (skuSelectAll) {
      skuSelectAll.addEventListener('change', (e) => {
        if (e.target.checked) {
          state.skuItems.forEach(it => state.skuSelectedIds.add(it.id));
        } else {
          state.skuSelectedIds.clear();
        }
        renderSkuTable();
      });
    }

    // SKU Bulk category buttons
    const btnBulkKecil = document.getElementById('btn-bulk-set-kecil');
    const btnBulkSedang = document.getElementById('btn-bulk-set-sedang');
    const btnBulkBesar = document.getElementById('btn-bulk-set-besar');
    if (btnBulkKecil) btnBulkKecil.onclick = () => bulkSetSkuCategory('KECIL');
    if (btnBulkSedang) btnBulkSedang.onclick = () => bulkSetSkuCategory('SEDANG');
    if (btnBulkBesar) btnBulkBesar.onclick = () => bulkSetSkuCategory('BESAR');

    // Jalur Date & Refresh
    const jalurDate = document.getElementById('jalur-filter-date');
    if (jalurDate) {
      jalurDate.value = state.jalurFilterDate;
      jalurDate.addEventListener('change', (e) => {
        state.jalurFilterDate = e.target.value;
        loadJalurOverview();
      });
    }

    const btnRefreshJalur = document.getElementById('btn-refresh-jalur');
    if (btnRefreshJalur) {
      btnRefreshJalur.addEventListener('click', () => {
        loadJalurOverview();
      });
    }

    // Modal SJ Detail close buttons
    const btnCloseSj = document.getElementById('btn-close-sj-detail');
    const btnCloseSjBtn = document.getElementById('btn-close-sj-detail-btn');
    if (btnCloseSj) btnCloseSj.onclick = () => document.getElementById('modal-sj-detail')?.classList.remove('open');
    if (btnCloseSjBtn) btnCloseSjBtn.onclick = () => document.getElementById('modal-sj-detail')?.classList.remove('open');
  }

function populateZoneFilter() {
  const sel = document.getElementById('disp-filter-zona');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Semua Zona</option>';
  state.zones.forEach(z => {
    const opt = document.createElement('option');
    opt.value = z.code;
    opt.textContent = `Zona ${z.code} — ${z.name}`;
    sel.appendChild(opt);
  });
  sel.value = current;
}

function populateDriverFilter() {
  const sel = document.getElementById('mon-filter-driver');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Semua Pengemudi</option>';
  const drivers = state.users.filter(u => u.role === 'DRIVER' || u.role === 'BACKUP_DRIVER' || u.is_backup_driver);
  drivers.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = `${d.name} (${d.department || d.role})`;
    sel.appendChild(opt);
  });
  sel.value = current;
}

async function checkZoneLockStatus(zoneCode) {
  const badge = document.getElementById('zone-lock-info');
  const text = document.getElementById('zone-lock-text');
  if (!badge || !text) return;

  if (!zoneCode) {
    badge.style.display = 'none';
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`${API}/api/zone-locks?date=${today}`);
    const data = await res.json();
    if (data.success && data.data) {
      const lock = data.data.find(l => l.zone_code === zoneCode);
      if (lock) {
        badge.style.display = 'inline-flex';
        badge.className = 'status-badge warning';
        text.textContent = `Zona ${zoneCode} terkunci hari ini untuk ${lock.vehicle_type} (${lock.driver_name || 'Driver'})`;
        return;
      }
    }
    badge.style.display = 'inline-flex';
    badge.className = 'status-badge connected';
    text.textContent = `Zona ${zoneCode} tersedia untuk armada mobil`;
  } catch (err) {
    badge.style.display = 'none';
  }
}

// ==============================================================
// TAB 1: MARKETING — JADWALKAN TANGGAL KIRIM
// ==============================================================
function renderMarketingTable() {
  const tbody = document.getElementById('mkt-tbody');
  const summary = document.getElementById('mkt-summary');
  const countBadge = document.getElementById('scheduled-count-badge');
  if (!tbody) return;

  // Show scheduled and active shipments, strictly excluding pickup shipments!
  let list = state.shipments.filter(s => !isPickupShipment(s));

  // Date filter
  const filterDate = state.mktFilterDate || 'all';
  if (filterDate === 'tomorrow') {
    list = list.filter(s => s.plan_date === '2026-10-02');
  } else if (filterDate === 'today') {
    const today = new Date().toISOString().split('T')[0];
    list = list.filter(s => s.plan_date === today || s.plan_date === '2026-10-01');
  }

  if (state.mktSearch) {
    const q = state.mktSearch;
    list = list.filter(s =>
      (s.sj_number && s.sj_number.toLowerCase().includes(q)) ||
      (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
      (s.po_number && s.po_number.toLowerCase().includes(q)) ||
      (s.destination_address && s.destination_address.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q))
    );
  }

  if (countBadge) {
    countBadge.textContent = `${list.length} SJ Terjadwal`;
  }

  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state" style="padding:40px 20px;">
            <div class="empty-state-icon">${getSvgIcon('clipboard', 'svg-icon-hero', 42)}</div>
            <h3 style="margin-top:10px;">Belum Ada Pengiriman Terjadwal</h3>
            <p style="color:var(--text-secondary); max-width:560px; margin:8px auto; font-size:13px;">
              Gunakan kotak pencarian <strong>"Cari Pengiriman Pesanan (DO) Accurate Online"</strong> di atas untuk mencari DO customer, memeriksa/mengubah alamat kirim, memilih titik koordinat peta, dan menetapkan tanggal pengiriman.
            </p>
          </div>
        </td>
      </tr>
    `;
    if (summary) summary.innerHTML = '0 Surat Jalan telah dijadwalkan';
    return;
  }

  list.forEach(s => {
    const tr = document.createElement('tr');
    const muatBadge = getMuatBadge(s.muat_category || 'KECIL');

    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span class="sj-number clickable-sj" onclick="openSjDetailModal('${s.id}')" title="Klik untuk rincian produk">${escapeHtml(s.sj_number)}</span>
          ${s.type && s.type !== 'DO' ? `<span class="badge" style="background:${s.type === 'JC' ? '#7c3aed' : s.type === 'IT' ? '#d97706' : '#0f766e'}; color:white; font-size:9px; font-weight:700; padding:1px 5px; border-radius:3px;">${s.type}</span>` : ''}
        </div>
        <span class="status-pill ${s.status === 'SCHEDULED' ? 'jalan' : (s.status === 'ASSIGNED' ? 'siap' : 'siap')}" style="font-size:10px; padding:2px 6px; margin-top:3px; display:inline-block;">
          ${s.status === 'SCHEDULED' ? 'Terjadwal' : (s.status === 'ASSIGNED' ? 'Siap Kirim' : s.status)}
        </span>
      </td>
      <td>
        <div class="po-number" style="font-weight:600; color:var(--text-main); font-size:12px;">${escapeHtml(s.po_number || '-')}</div>
        <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(s.so_ref || '-')}</div>
      </td>
      <td>
        <div class="customer-name" style="font-weight:700;">${escapeHtml(s.customer_name)}</div>
        <div class="customer-address" style="font-size:12px; margin-top:2px;">${escapeHtml(s.destination_address || 'Alamat belum ada')}</div>
        ${s.notes ? `<div class="customer-note" style="margin-top:2px; font-size:11px;">${escapeHtml(s.notes)}</div>` : ''}
        <div style="display:flex; align-items:center; gap:6px; margin-top:6px; flex-wrap:wrap;">
          ${s.destination_lat && s.destination_lng
            ? `<span class="badge-gps ready" title="${s.destination_lat}, ${s.destination_lng}">📍 GPS: ${Number(s.destination_lat).toFixed(4)}, ${Number(s.destination_lng).toFixed(4)}</span>`
            : `<span class="badge-gps missing">⚠️ Titik GPS Belum Ada</span>`}
          <button type="button" class="btn btn-outline btn-xs" onclick="openEditAddressModal('${s.id}')" title="Edit Alamat & Titik Koordinat Peta">
            ✏️ Edit Alamat & Map
          </button>
        </div>
      </td>
      <td>
        <span class="zone-badge">Zona ${s.zone_code || '-'}</span>
      </td>
      <td>
        <div>
          ${muatBadge}
          <a href="javascript:void(0)" onclick="openSjDetailModal('${s.id}')" style="font-size:10px; margin-left:4px; text-decoration:none; color:#2563eb; font-weight:600;">Lihat Produk</a>
        </div>
        ${s.muat_reason ? `<div style="font-size:10px; color:var(--text-secondary); margin-top:2px; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(s.muat_reason)}">${escapeHtml(s.muat_reason)}</div>` : ''}
      </td>
      <td>
        ${s.plan_date
          ? `<span class="date-badge" style="font-weight:700;">${s.plan_date}</span>`
          : `<span class="date-badge empty">Belum diatur</span>`}
      </td>
      <td style="text-align:center;">
        <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
          <button type="button" class="btn btn-outline btn-xs" onclick="changeShipmentDatePrompt('${s.id}', '${s.plan_date || ''}')" style="width:100%; font-size:11px;">
            🗓️ Ubah Tanggal
          </button>
          <button type="button" class="btn btn-outline btn-xs" onclick="cancelShipmentSchedule('${s.id}', '${escapeHtml(s.sj_number)}')" style="width:100%; font-size:11px; color:#b45309;">
            ❌ Batal Jadwal
          </button>
          <button type="button" class="btn btn-outline btn-xs" onclick="deleteShipmentPermanently('${s.id}', '${escapeHtml(s.sj_number)}')" style="width:100%; font-size:11px; color:#b91c1c;">
            🗑️ Hapus
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  if (summary) {
    summary.innerHTML = `Menampilkan <strong>${list.length}</strong> Surat Jalan telah dijadwalkan`;
  }
}

window.changeShipmentDatePrompt = async function(shipmentId, currentDate) {
  const newDate = prompt('Masukkan tanggal rencana kirim baru (YYYY-MM-DD):', currentDate || '2026-10-02');
  if (!newDate) return;
  try {
    const res = await fetch(`${API}/api/shipments/schedule-date`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipmentIds: [shipmentId],
        planDate: newDate.trim(),
        scheduledBy: state.currentUser?.name || 'Marketing'
      })
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Tanggal kirim berhasil diubah ke ${newDate}!`, 'success');
      await loadData();
    } else {
      showToast(json.message || 'Gagal mengubah tanggal kirim', 'error');
    }
  } catch (err) {
    showToast('Gagal mengubah tanggal kirim: ' + err.message, 'error');
  }
};

window.cancelShipmentSchedule = async function(shipmentId, sjNumber) {
  if (!confirm(`Batalkan jadwal untuk Surat Jalan ${sjNumber}? Status akan dikembalikan ke DRAFT.`)) return;
  try {
    const res = await fetch(`${API}/api/shipments/${shipmentId}/unschedule`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast(`Jadwal untuk ${sjNumber} berhasil dibatalkan`, 'info');
      await loadData();
    } else {
      showToast(json.message || 'Gagal membatalkan jadwal', 'error');
    }
  } catch (err) {
    showToast('Gagal membatalkan jadwal: ' + err.message, 'error');
  }
};

window.deleteShipmentPermanently = async function(shipmentId, sjNumber) {
  if (!confirm(`Hapus Surat Jalan ${sjNumber} dari sistem secara permanen?`)) return;
  try {
    const res = await fetch(`${API}/api/shipments/${shipmentId}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast(`Surat Jalan ${sjNumber} berhasil dihapus`, 'success');
      await loadData();
    } else {
      showToast(json.message || 'Gagal menghapus Surat Jalan', 'error');
    }
  } catch (err) {
    showToast('Gagal menghapus Surat Jalan: ' + err.message, 'error');
  }
};

function updateSelectAllCheckbox(total) {
  const selectAll = document.getElementById('mkt-select-all');
  if (selectAll) {
    selectAll.checked = total > 0 && state.selectedMktIds.size === total;
  }
  const summary = document.getElementById('mkt-summary');
  if (summary) {
    const selCount = state.selectedMktIds.size;
    summary.innerHTML = `${selCount > 0 ? `<strong>${selCount}</strong> terpilih` : ''}`;
  }
}

function getMuatBadge(category) {
  if (category === 'BESAR') {
    return `<span class="sku-badge besar">Besar (Wajib Mobil)</span>`;
  }
  if (category === 'SEDANG') {
    return `<span class="sku-badge sedang">Sedang (Bisa Diakali)</span>`;
  }
  return `<span class="sku-badge kecil">Kecil (Motor)</span>`;
}

// ==============================================================
// TAB 2: DISPATCHER — PENUGASAN DRIVER & CEK MUAT
// ==============================================================
function renderDispatcherTable() {
  const tbody = document.getElementById('disp-tbody');
  const summary = document.getElementById('disp-summary');
  if (!tbody) return;

  // Dispatcher shows SCHEDULED or ASSIGNED shipments, strictly excluding pickup shipments!
  let list = state.shipments.filter(s => (s.status === 'SCHEDULED' || s.status === 'ASSIGNED') && !isPickupShipment(s));

  if (state.dispSearch) {
    const q = state.dispSearch;
    list = list.filter(s =>
      (s.sj_number && s.sj_number.toLowerCase().includes(q)) ||
      (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
      (s.assigned_driver && s.assigned_driver.toLowerCase().includes(q)) ||
      (s.destination_address && s.destination_address.toLowerCase().includes(q))
    );
  }

  if (state.dispFilterZona) {
    list = list.filter(s => s.zone_code === state.dispFilterZona);
  }

  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">
            <div class="empty-state-icon">${getSvgIcon('truck', 'svg-icon-hero', 42)}</div>
            <h3>Belum Ada SJ yang Dijadwalkan Tanggalnya</h3>
            <p>Buka tab <strong>"Jadwalkan Tanggal Kirim"</strong> untuk menjadwalkan tanggal kirim pesanan customer terlebih dahulu.</p>
          </div>
        </td>
      </tr>
    `;
    if (summary) summary.textContent = '0 SJ perlu penugasan driver';
    return;
  }

  list.forEach(s => {
    const tr = document.createElement('tr');

    // SKU category badge
    const muatBadge = getMuatBadge(s.muat_category || 'KECIL');

    // Recommendation text
    let recoText = 'Rekomendasi Motor';
    if (s.muat_category === 'BESAR') recoText = 'Wajib Mobil / Traga';
    else if (s.muat_category === 'SEDANG') recoText = 'Evaluasi Dispatcher (Bisa Diakali)';

    // Vehicle
    const vType = s.assigned_vehicle_type || s.required_vehicle_type || 'MOTOR';
    const vInfo = getVehicleInfo(vType);

    // Driver
    const driverName = s.assigned_driver || 'Belum ditugaskan';
    const driverClass = getDriverClass(driverName);

    // Tas Bingkisan
    const tasSize = s.tas_size === 'BESAR' ? 'BESAR' : 'KECIL';
    const bagClass = tasSize === 'BESAR' ? 'besar' : 'kecil';
    const bagLabel = tasSize === 'BESAR' ? 'Tas Besar' : 'Tas Kecil';

    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span class="sj-number clickable-sj" onclick="openSjDetailModal('${s.id}')" title="Klik untuk lihat detail produk">${escapeHtml(s.sj_number)}</span>
          ${s.type && s.type !== 'DO' ? `<span class="badge" style="background:${s.type === 'JC' ? '#7c3aed' : s.type === 'IT' ? '#d97706' : '#0f766e'}; color:white; font-size:9px; font-weight:700; padding:1px 5px; border-radius:3px;">${s.type}</span>` : ''}
        </div>
        <div class="po-number">PO: ${escapeHtml(s.po_number || '-')}</div>
        ${s.plan_date ? `<div style="font-size:11px; color:var(--primary); font-weight:600; margin-top:2px;">Kirim: ${s.plan_date}</div>` : ''}
      </td>
      <td>
        <div class="customer-name">${escapeHtml(s.customer_name)}</div>
        <div class="customer-address">${escapeHtml(s.destination_address || 'Alamat')}</div>
        ${s.notes ? `<div class="customer-note">${escapeHtml(s.notes)}</div>` : ''}
        <div style="display:flex; align-items:center; gap:6px; margin-top:4px; flex-wrap:wrap;">
          ${s.destination_lat && s.destination_lng
            ? `<span class="badge-gps ready" title="${s.destination_lat}, ${s.destination_lng}">📍 GPS: ${Number(s.destination_lat).toFixed(4)}, ${Number(s.destination_lng).toFixed(4)}</span>`
            : `<span class="badge-gps missing">⚠️ GPS Kosong</span>`}
          <button type="button" class="btn btn-outline btn-xs" onclick="openEditAddressModal('${s.id}')" title="Edit Alamat & Titik Koordinat">
            ✏️ Edit Alamat
          </button>
        </div>
      </td>
      <td>
        <span class="zone-badge">Zona ${s.zone_code || '-'}</span>
      </td>
      <td>
        <div>
          ${muatBadge}
          <a href="javascript:void(0)" onclick="openSjDetailModal('${s.id}')" style="font-size:10px; margin-left:4px; text-decoration:none; color:#2563eb; font-weight:600;">Lihat</a>
        </div>
      </td>
      <td>
        <div style="font-size:11px; font-weight:600; color:var(--text-secondary);">${escapeHtml(s.muat_recommendation || recoText)}</div>
        ${s.muat_reason ? `<div style="font-size:10px; color:var(--text-secondary); margin-top:2px; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(s.muat_reason)}">${escapeHtml(s.muat_reason)}</div>` : ''}
      </td>
      <td>
        <span class="transport-badge ${vInfo.cls}">${vInfo.label}</span>
      </td>
      <td>
        <span class="driver-pill ${driverClass}">
          <span style="font-size:9px;">●</span> ${escapeHtml(driverName)}
        </span>
      </td>
      <td>
        <span class="bag-badge ${bagClass}">${bagLabel}</span>
      </td>
      <td style="text-align:center;">
        <button type="button" class="btn ${s.status === 'ASSIGNED' ? 'btn-outline' : 'btn-primary'} btn-sm btn-assign-row" data-id="${s.id}">
          ${s.status === 'ASSIGNED' ? 'Ubah' : 'Tugaskan'}
        </button>
      </td>
    `;

    const btnAssign = tr.querySelector('.btn-assign-row');
    btnAssign.addEventListener('click', () => {
      openAssignDriverModal(s);
    });

    tbody.appendChild(tr);
  });

  if (summary) {
    const unassigned = list.filter(s => s.status === 'SCHEDULED').length;
    summary.innerHTML = `Total <strong>${list.length}</strong> SJ (${unassigned} menunggu penugasan driver)`;
  }
}

// ==============================================================
// TAB 3: MONITOR — JADWAL KIRIM HARIAN
// ==============================================================
function renderMonitorTable() {
  const tbody = document.getElementById('mon-tbody');
  const summary = document.getElementById('mon-summary');
  if (!tbody) return;

  // Shipments that are ASSIGNED or DELIVERED, strictly excluding pickup shipments!
  let list = state.shipments.filter(s => (s.status === 'ASSIGNED' || s.status === 'DELIVERED') && !isPickupShipment(s));

  if (state.monSearch) {
    const q = state.monSearch;
    list = list.filter(s =>
      (s.sj_number && s.sj_number.toLowerCase().includes(q)) ||
      (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
      (s.assigned_driver && s.assigned_driver.toLowerCase().includes(q)) ||
      (s.destination_address && s.destination_address.toLowerCase().includes(q))
    );
  }

  if (state.monFilterDriver) {
    list = list.filter(s => s.assigned_driver === state.monFilterDriver);
  }

  if (state.monFilterDate) {
    list = list.filter(s => !s.plan_date || s.plan_date === state.monFilterDate);
  }

  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <div class="empty-state-icon">${getSvgIcon('clipboard', 'svg-icon-hero', 42)}</div>
            <h3>Belum Ada Pengiriman Terjadwal untuk Filter Ini</h3>
            <p>Tugaskan driver dan armada di tab <strong>"Penugasan Driver & Cek Muat"</strong>.</p>
          </div>
        </td>
      </tr>
    `;
    if (summary) summary.textContent = '0 pengiriman';
    return;
  }

  list.forEach((s, idx) => {
    const tr = document.createElement('tr');

    const vType = s.assigned_vehicle_type || s.required_vehicle_type || 'MOTOR';
    const vInfo = getVehicleInfo(vType);
    const driverClass = getDriverClass(s.assigned_driver);

    const tasSize = s.tas_size === 'BESAR' ? 'BESAR' : 'KECIL';
    const bagClass = tasSize === 'BESAR' ? 'besar' : 'kecil';
    const bagLabel = tasSize === 'BESAR' ? 'Tas Besar' : 'Tas Kecil';

    const statusInfo = getStatusInfo(s.status);

    tr.innerHTML = `
      <td style="text-align:center;">
        <span class="seq-badge">${idx + 1}</span>
      </td>
      <td>
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span class="sj-number clickable-sj" onclick="openSjDetailModal('${s.id}')" title="Klik untuk lihat detail produk">${escapeHtml(s.sj_number)}</span>
          ${s.type && s.type !== 'DO' ? `<span class="badge" style="background:${s.type === 'JC' ? '#7c3aed' : s.type === 'IT' ? '#d97706' : '#0f766e'}; color:white; font-size:9px; font-weight:700; padding:1px 5px; border-radius:3px;">${s.type}</span>` : ''}
        </div>
        <div class="po-number">PO: ${escapeHtml(s.po_number || '-')}</div>
      </td>
      <td>
        <div class="customer-name">${escapeHtml(s.customer_name)}</div>
        <div class="customer-address">${escapeHtml(s.destination_address || '-')}</div>
        <span class="zone-badge" style="margin-top:2px;">Zona ${s.zone_code || '-'}</span>
      </td>
      <td>
        <span class="bag-badge ${bagClass}">${bagLabel}</span>
      </td>
      <td>
        <span class="transport-badge ${vInfo.cls}">${vInfo.label}</span>
      </td>
      <td>
        <span class="driver-pill ${driverClass}">
          <span style="font-size:9px;">●</span> ${escapeHtml(s.assigned_driver || 'Driver')}
        </span>
      </td>
      <td>
        <span class="status-pill ${statusInfo.cls}">${statusInfo.label}</span>
      </td>
      <td>
        <div style="display:flex; gap:3px; align-items:center; flex-wrap:wrap;">
          <span class="doc-check-tag checked">SJ</span>
          <span class="doc-check-tag checked">PO</span>
          <span class="doc-check-tag">TTB</span>
          <span class="doc-check-tag">INV</span>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  if (summary) {
    summary.innerHTML = `Total <strong>${list.length}</strong> pengiriman terjadwal dari Gudang J40`;
  }
}

// ==============================================================
// TAB: LOKET AMBIL DI J23 (CUSTOMER PICKUP)
// ==============================================================
function renderPickupTable() {
  const tbody = document.getElementById('pickup-tbody');
  const summary = document.getElementById('pickup-summary');
  if (!tbody) return;

  let list = state.shipments.filter(isPickupShipment);

  if (state.pickupSearch) {
    const q = state.pickupSearch.toLowerCase();
    list = list.filter(s =>
      (s.sj_number && s.sj_number.toLowerCase().includes(q)) ||
      (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
      (s.po_number && s.po_number.toLowerCase().includes(q)) ||
      (s.so_ref && s.so_ref.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q))
    );
  }

  if (state.pickupFilterStatus) {
    list = list.filter(s => s.status === state.pickupFilterStatus);
  }

  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-state-icon">${getSvgIcon('package', 'svg-icon-hero', 42)}</div>
            <h3>Tidak Ada Pesanan Pengambilan di J23</h3>
            <p>Pesanan dengan metode <em>"DIAMBIL DI J23"</em> dari Accurate Online akan otomatis muncul di loket ini.</p>
          </div>
        </td>
      </tr>
    `;
    if (summary) summary.textContent = '0 pesanan pickup';
    return;
  }

  list.forEach(s => {
    const tr = document.createElement('tr');
    const isDone = s.status === 'PICKUP_DONE';

    tr.innerHTML = `
      <td>
        <div class="sj-number">${escapeHtml(s.sj_number)}</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
          Metode: <strong style="color:var(--primary);">DIAMBIL DI J23</strong>
        </div>
      </td>
      <td>
        <div class="po-number" style="font-weight:600; color:var(--text-main); font-size:12px;">${escapeHtml(s.po_number || '-')}</div>
        <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(s.so_ref || '-')}</div>
      </td>
      <td>
        <div class="customer-name">${escapeHtml(s.customer_name)}</div>
        ${s.notes ? `<div class="customer-note" style="color:#d97706; font-weight:500;">${escapeHtml(s.notes)}</div>` : ''}
      </td>
      <td>
        <div style="font-size:12px; font-weight:600; color:var(--text-main);">Loket Kantor J23</div>
        <div style="font-size:11px; color:var(--text-muted);">Ruko Galaxi Bumi Permai J1/23</div>
      </td>
      <td>
        <span class="status-pill ${isDone ? 'sukses' : 'warning'}" style="font-size:11px; padding:3px 8px;">
          ${isDone ? 'Sudah Diserahkan' : 'Siap Diambil di J23'}
        </span>
        ${s.received_by ? `<div style="font-size:11px; color:var(--text-muted); margin-top:3px;">Penerima: ${escapeHtml(s.received_by)}</div>` : ''}
      </td>
      <td style="text-align:center;">
        ${isDone ? `
          <button type="button" class="btn btn-outline btn-sm" disabled style="opacity:0.65;">
            Selesai
          </button>
        ` : `
          <button type="button" class="btn btn-success btn-sm btn-pickup-handover" data-id="${s.id}">
            Serahkan Barang
          </button>
        `}
      </td>
    `;

    const btnHandover = tr.querySelector('.btn-pickup-handover');
    if (btnHandover) {
      btnHandover.addEventListener('click', () => {
        handlePickupHandover(s);
      });
    }

    tbody.appendChild(tr);
  });

  if (summary) {
    const readyCount = list.filter(s => s.status === 'PICKUP_READY').length;
    summary.innerHTML = `Total <strong>${list.length}</strong> pesanan pickup (${readyCount} siap diserahkan ke customer di J23)`;
  }
}

async function handlePickupHandover(s) {
  const defaultReceiver = s.customer_name ? `${s.customer_name} (Kurir / PIC)` : 'Customer';
  const receiver = prompt(`Konfirmasi Penyerahan Barang di Loket J23:\nNo. SJ: ${s.sj_number}\nPelanggan: ${s.customer_name}\n\nMasukkan Nama Penerima Barang / Kurir:`, defaultReceiver);
  if (!receiver) return;

  try {
    const res = await fetch(`${API}/api/shipments/${s.id}/pickup-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiverName: receiver,
        handledBy: state.currentUser?.name || 'Petugas Loket J23'
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Barang ${s.sj_number} berhasil diserahkan ke ${receiver} di Loket J23!`, 'success');
      loadData();
    } else {
      showToast(result.message || 'Gagal menyimpan status pickup', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi server', 'error');
  }
}

// ==============================================================
// TAB 4: CHECKER DOKUMEN
// ==============================================================
function renderCheckerTable() {
  const tbody = document.getElementById('checker-tbody');
  if (!tbody) return;

  const list = state.shipments.filter(s => !isPickupShipment(s)).slice(0, 6);
  tbody.innerHTML = '';

  list.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="sj-number">${escapeHtml(s.sj_number)}</div>
        <div class="po-number">PO: ${escapeHtml(s.po_number || '-')}</div>
      </td>
      <td>
        <div class="customer-name">${escapeHtml(s.customer_name)}</div>
      </td>
      <td>
        <span class="driver-pill ${getDriverClass(s.assigned_driver)}">${escapeHtml(s.assigned_driver || 'Munir')}</span>
      </td>
      <td>
        <div style="font-weight:600; font-size:12px;">Customer Receiver</div>
      </td>
      <td>
        <label style="margin-right:8px; font-size:12px; cursor:pointer;"><input type="checkbox" checked> SJ Asli</label>
        <label style="margin-right:8px; font-size:12px; cursor:pointer;"><input type="checkbox" checked> PO</label>
        <label style="margin-right:8px; font-size:12px; cursor:pointer;"><input type="checkbox"> TTB</label>
        <label style="font-size:12px; cursor:pointer;"><input type="checkbox"> Faktur</label>
      </td>
      <td style="text-align:center;">
        <button type="button" class="btn btn-success btn-sm btn-chk-verify">
          Verifikasi
        </button>
      </td>
    `;

    const btn = tr.querySelector('.btn-chk-verify');
    btn.addEventListener('click', () => {
      btn.textContent = 'Terverifikasi';
      btn.disabled = true;
      btn.className = 'btn btn-outline btn-sm';
      showToast(`Dokumen SJ ${s.sj_number} berhasil diverifikasi!`, 'success');
    });

    tbody.appendChild(tr);
  });
}

// ==============================================================
// TAB 5: PERSERTUJUAN URGENT (KEPALA OPS)
// ==============================================================
function renderUrgentTable() {
  const tbody = document.getElementById('urgent-tbody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td><strong>TRIP-URG-01</strong></td>
      <td>${new Date().toISOString().split('T')[0]}</td>
      <td><span class="zone-badge">Zona FR</span></td>
      <td>Kebutuhan mesin mati di Sampoerna Rungkut — Barang susulan mepet</td>
      <td><span class="driver-pill agus">Agus — Gran Max</span></td>
      <td style="text-align:center;">
        <button type="button" class="btn btn-primary btn-sm btn-approve-urg">
          Setujui
        </button>
      </td>
    </tr>
  `;

  const btn = tbody.querySelector('.btn-approve-urg');
  if (btn) {
    btn.addEventListener('click', () => {
      btn.textContent = 'Disetujui';
      btn.disabled = true;
      btn.className = 'btn btn-outline btn-sm';
      showToast('Trip urgent berhasil disetujui Kepala Operasional!', 'success');
      setBadge('badge-tab-urgent', 0);
    });
  }
}

// ==============================================================
// TAB 6: ADMIN — KELOLA USER & PERMISSION
// ==============================================================
async function renderAdminTable() {
  const tbody = document.getElementById('admin-tbody');
  if (!tbody) return;

  try {
    const res = await fetch(`${API}/api/admin/users`);
    const data = await res.json();
    if (!data.success || !data.data) return;

    let users = data.data;
    if (state.adminSearch) {
      const q = state.adminSearch;
      users = users.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        (u.department && u.department.toLowerCase().includes(q))
      );
    }

    tbody.innerHTML = '';

    users.forEach(u => {
      const tr = document.createElement('tr');
      const perms = (u.permissions || []).slice(0, 3);
      const moreCount = (u.permissions || []).length - 3;

      tr.innerHTML = `
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:28px; height:28px; border-radius:50%; background:${u.color_code || '#64748b'}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">
              ${(u.name || 'U').substr(0, 2).toUpperCase()}
            </div>
            <div>
              <div style="font-weight:700;">${escapeHtml(u.name)}</div>
              <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(u.phone || '-')}</div>
            </div>
          </div>
        </td>
        <td><code>${escapeHtml(u.username)}</code></td>
        <td><span class="user-role-badge" style="font-size:11px;">${escapeHtml(u.role)}</span></td>
        <td>${escapeHtml(u.department || '-')}</td>
        <td>
          <div style="display:flex; flex-wrap:wrap; gap:2px;">
            ${perms.map(p => `<span class="perm-pill">${p.replace('tab.', '').replace('action.', '')}</span>`).join('')}
            ${moreCount > 0 ? `<span class="perm-pill">+${moreCount} lainnya</span>` : ''}
          </div>
        </td>
        <td>
          <span class="status-pill ${u.is_active ? 'terkirim' : 'gagal'}" style="font-size:10px;">
            ${u.is_active ? 'Aktif' : 'Nonaktif'}
          </span>
        </td>
        <td style="text-align:center;">
          <button type="button" class="btn btn-outline btn-sm btn-edit-user" data-id="${u.id}">
            Edit
          </button>
        </td>
      `;

      const btnEdit = tr.querySelector('.btn-edit-user');
      btnEdit.addEventListener('click', () => {
        openUserModal(u);
      });

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Admin users load error:', err);
  }
}

// ==============================================================
// MODALS
// ==============================================================
function initModals() {
  // Modal: Schedule Date (Marketing)
  const modalMkt = document.getElementById('modal-schedule-date');
  const btnCloseMkt = document.getElementById('btn-close-mkt-modal');
  const btnCancelMkt = document.getElementById('btn-cancel-mkt-modal');
  const formMkt = document.getElementById('form-schedule-date');

  [btnCloseMkt, btnCancelMkt].forEach(btn => {
    if (btn) btn.addEventListener('click', () => closeModal(modalMkt));
  });

  if (formMkt) {
    formMkt.addEventListener('submit', async (e) => {
      e.preventDefault();
      const planDate = document.getElementById('mkt-plan-date').value;
      const ids = Array.from(state.selectedMktIds);

      if (ids.length === 0 || !planDate) {
        showToast('Pilih minimal 1 SJ dan tentukan tanggal kirim', 'warning');
        return;
      }

      try {
        const res = await fetch(`${API}/api/shipments/schedule-date`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shipmentIds: ids,
            planDate,
            scheduledBy: state.currentUser?.name || 'Marketing'
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Berhasil menjadwalkan ${ids.length} SJ ke tanggal ${planDate}!`, 'success');
          state.selectedMktIds.clear();
          closeModal(modalMkt);
          await loadData();
        } else {
          showToast(data.message || 'Gagal menjadwalkan tanggal', 'error');
        }
      } catch (err) {
        showToast('Gagal menghubungi server', 'error');
      }
    });
  }

  // Modal: Assign Driver (Dispatcher)
  const modalDisp = document.getElementById('modal-assign-driver');
  const btnCloseDisp = document.getElementById('btn-close-disp-modal');
  const btnCancelDisp = document.getElementById('btn-cancel-disp-modal');
  const formDisp = document.getElementById('form-assign-driver');

  [btnCloseDisp, btnCancelDisp].forEach(btn => {
    if (btn) btn.addEventListener('click', () => closeModal(modalDisp));
  });

  // Intelligent Driver <-> Vehicle sync in Dispatcher modal
  const selDriver = document.getElementById('disp-driver');
  const selVehicle = document.getElementById('disp-vehicle');

  if (selDriver && selVehicle) {
    selDriver.addEventListener('change', () => {
      const dName = selDriver.value;
      if (DRIVER_VEHICLE_MAP[dName]) {
        selVehicle.value = DRIVER_VEHICLE_MAP[dName].vehicle;
      }
      validateSimAndVehicle();
    });

    selVehicle.addEventListener('change', () => {
      const vType = selVehicle.value;
      if (VEHICLE_DEFAULT_DRIVER[vType]) {
        selDriver.value = VEHICLE_DEFAULT_DRIVER[vType];
      }
      validateSimAndVehicle();
    });
  }

  if (formDisp) {
    formDisp.addEventListener('submit', async (e) => {
      e.preventDefault();
      const shipmentId = document.getElementById('disp-shipment-id').value;
      const driver = document.getElementById('disp-driver').value;
      const vehicleType = document.getElementById('disp-vehicle').value;
      const tasBingkisan = document.getElementById('disp-tas').value;
      const notes = document.getElementById('disp-notes').value;

      // 1 Mobil = 1 Zona Validation
      const currentShipment = state.shipments.find(s => s.id === shipmentId);
      if (vehicleType !== 'MOTOR' && currentShipment && currentShipment.zone_code) {
        const pDate = currentShipment.plan_date || new Date().toISOString().split('T')[0];
        try {
          const chkRes = await fetch(`${API}/api/zone-locks/check?date=${pDate}&zone=${currentShipment.zone_code}&vehicleType=${vehicleType}`);
          const chkData = await chkRes.json();
          if (chkData.success && !chkData.available) {
            showToast(`DILARANG: ${chkData.message}`, 'error', 6000);
            return;
          }
        } catch (e) {}
      }

      try {
        const res = await fetch(`${API}/api/shipments/assign-driver`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shipmentId,
            driver,
            vehicleType,
            tasBingkisan,
            assignedBy: state.currentUser?.name || 'Dispatcher',
            notes
          })
        });
        const data = await res.json();
        if (data.success) {
          // If vehicle is a car, lock the zone
          if (vehicleType !== 'MOTOR' && currentShipment && currentShipment.zone_code) {
            const pDate = currentShipment.plan_date || new Date().toISOString().split('T')[0];
            fetch(`${API}/api/zone-locks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                planDate: pDate,
                zoneCode: currentShipment.zone_code,
                vehicleId: vehicleType,
                vehicleType,
                driverId: driver,
                lockedBy: state.currentUser?.name || 'Dispatcher'
              })
            }).catch(() => {});
          }

          showToast(`Surat Jalan berhasil ditugaskan ke ${driver} (${vehicleType})!`, 'success');
          closeModal(modalDisp);
          await loadData();
        } else {
          showToast(data.message || 'Gagal menugaskan driver', 'error');
        }
      } catch (err) {
        showToast('Gagal menghubungi server', 'error');
      }
    });
  }

  // Modal: User CRUD (Admin)
  const modalUser = document.getElementById('modal-user');
  const btnCloseUser = document.getElementById('btn-close-user-modal');
  const btnCancelUser = document.getElementById('btn-cancel-user-modal');
  const btnAddUser = document.getElementById('btn-add-user');
  const formUser = document.getElementById('form-user');

  [btnCloseUser, btnCancelUser].forEach(btn => {
    if (btn) btn.addEventListener('click', () => closeModal(modalUser));
  });

  if (btnAddUser) {
    btnAddUser.addEventListener('click', () => {
      openUserModal(null);
    });
  }

  if (formUser) {
    formUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = document.getElementById('edit-user-id').value;
      const name = document.getElementById('user-name').value.trim();
      const username = document.getElementById('user-username').value.trim();
      const role = document.getElementById('user-role').value;
      const department = document.getElementById('user-dept').value.trim();
      const license_type = document.getElementById('user-license').value.trim();
      const color_code = document.getElementById('user-color').value;

      const checkedPerms = Array.from(document.querySelectorAll('.chk-perm:checked')).map(c => c.value);

      const payload = { name, username, role, department, license_type, color_code, permissions: checkedPerms };

      try {
        const url = userId ? `${API}/api/admin/users/${userId}` : `${API}/api/admin/users`;
        const method = userId ? 'PATCH' : 'POST';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message || 'User berhasil disimpan!', 'success');
          closeModal(modalUser);
          renderAdminTable();
        } else {
          showToast(data.message || 'Gagal menyimpan user', 'error');
        }
      } catch (err) {
        showToast('Gagal menghubungi server', 'error');
      }
    });
  }

  // Init Sejalur Route Optimizer Modal
  initSejalurModal();
}

// ==============================================================
// FITUR SEJALUR: CORRIDOR ROUTE OPTIMIZER (J23 & J40)
// ==============================================================
let currentSejalurResult = null;

function initSejalurModal() {
  const btnOpen = document.getElementById('btn-open-sejalur');
  const modal = document.getElementById('modal-sejalur');
  const btnClose = document.getElementById('btn-close-sejalur');
  const btnCancel = document.getElementById('btn-cancel-sejalur');
  const selTarget = document.getElementById('sejalur-target-sj');
  const selDriver = document.getElementById('sejalur-driver');
  const chkSelectAll = document.getElementById('sejalur-select-all');
  const btnConfirm = document.getElementById('btn-confirm-sejalur-trip');

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      openSejalurModal();
    });
  }

  [btnClose, btnCancel].forEach(b => {
    if (b) b.addEventListener('click', () => closeModal(modal));
  });

  if (selTarget) {
    selTarget.addEventListener('change', () => {
      const targetId = selTarget.value;
      if (targetId) {
        runSejalurAnalysis(targetId);
      } else {
        const card = document.getElementById('sejalur-route-card');
        const cont = document.getElementById('sejalur-stops-container');
        const btn = document.getElementById('btn-confirm-sejalur-trip');
        if (card) card.style.display = 'none';
        if (cont) cont.style.display = 'none';
        if (btn) btn.style.display = 'none';
      }
    });
  }

  if (selDriver) {
    selDriver.addEventListener('change', () => {
      updateSejalurConfirmButton();
    });
  }

  if (chkSelectAll) {
    chkSelectAll.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.sejalur-stop-chk');
      checkboxes.forEach(c => { c.checked = e.target.checked; });
      updateSejalurConfirmButton();
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => {
      confirmSejalurTrip();
    });
  }

  // Modal: Edit Alamat & Titik Koordinat (Marketing)
  const modalEditAddr = document.getElementById('modal-edit-address');
  const btnCloseEditAddr = document.getElementById('btn-close-edit-addr');
  const btnCancelEditAddr = document.getElementById('btn-cancel-edit-addr');
  const formEditAddr = document.getElementById('form-edit-address');
  const presetSel = document.getElementById('edit-addr-preset');
  const btnParseCoords = document.getElementById('btn-parse-coords');
  const coordsInput = document.getElementById('edit-addr-coords-input');
  const inputLat = document.getElementById('edit-addr-lat');
  const inputLng = document.getElementById('edit-addr-lng');
  const inputZone = document.getElementById('edit-addr-zone');
  const previewLink = document.getElementById('edit-addr-preview-link');

  [btnCloseEditAddr, btnCancelEditAddr].forEach(btn => {
    if (btn) btn.addEventListener('click', () => closeModal(modalEditAddr));
  });

  function updatePreviewLink() {
    const lat = parseFloat(inputLat.value);
    const lng = parseFloat(inputLng.value);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      previewLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
      previewLink.style.display = 'inline-flex';
      previewLink.textContent = `Buka Titik (${lat.toFixed(4)}, ${lng.toFixed(4)}) di Google Maps`;
    } else {
      previewLink.style.display = 'none';
    }
  }

  if (inputLat && inputLng) {
    inputLat.addEventListener('input', updatePreviewLink);
    inputLng.addEventListener('input', updatePreviewLink);
  }

  if (presetSel) {
    presetSel.addEventListener('change', () => {
      const val = presetSel.value;
      if (!val) return;
      const parts = val.split(',');
      if (parts.length >= 2) {
        inputLat.value = parts[0];
        inputLng.value = parts[1];
        if (coordsInput) coordsInput.value = `${parts[0]}, ${parts[1]}`;
        if (parts[2] && inputZone) inputZone.value = parts[2];
        updatePreviewLink();
      }
    });
  }

  function parseAndSetCoordinates(raw) {
    if (!raw) return;
    raw = raw.trim();
    let lat = null, lng = null;
    const urlMatch = raw.match(/[@?&]q?=?(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (urlMatch) {
      lat = parseFloat(urlMatch[1]);
      lng = parseFloat(urlMatch[2]);
    } else {
      const parts = raw.split(/[,\s]+/).map(p => parseFloat(p.trim())).filter(p => !isNaN(p));
      if (parts.length >= 2) {
        lat = parts[0];
        lng = parts[1];
      }
    }

    if (lat !== null && lng !== null) {
      inputLat.value = lat;
      inputLng.value = lng;
      updatePreviewLink();
      showToast(`Koordinat GPS terdeteksi: ${lat}, ${lng}`, 'success');
    } else {
      showToast('Format koordinat tidak dikenali. Gunakan contoh: -7.2415, 112.6842', 'warning');
    }
  }

  if (btnParseCoords && coordsInput) {
    btnParseCoords.addEventListener('click', () => {
      parseAndSetCoordinates(coordsInput.value);
    });
    coordsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        parseAndSetCoordinates(coordsInput.value);
      }
    });
  }

  // Auto-pick coordinates from address using silent background Google Maps service
  const btnAutoPick = document.getElementById('btn-edit-addr-auto-pick');
  const pickStatus = document.getElementById('edit-addr-pick-status');
  const editAddrInput = document.getElementById('edit-addr-text');

  if (btnAutoPick && editAddrInput) {
    btnAutoPick.addEventListener('click', async () => {
      const address = editAddrInput.value.trim();
      if (!address) {
        showToast('Masukkan alamat pengiriman terlebih dahulu', 'warning');
        return;
      }

      btnAutoPick.disabled = true;
      if (pickStatus) {
        pickStatus.style.display = 'inline-block';
        pickStatus.style.color = '#2563eb';
        pickStatus.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s infinite linear;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Mencari titik koordinat di Google Maps...</span>`;
      }

      try {
        const res = await fetch(`${API}/api/geocode/pick-coordinates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address })
        });
        const data = await res.json();

        if (data.success && data.data) {
          const coord = data.data;
          const latVal = Number(coord.lat).toFixed(6);
          const lngVal = Number(coord.lng).toFixed(6);
          inputLat.value = latVal;
          inputLng.value = lngVal;
          if (coordsInput) coordsInput.value = `${latVal}, ${lngVal}`;
          if (coord.zoneCode && inputZone) {
            inputZone.value = coord.zoneCode;
          }
          updatePreviewLink();

          if (pickStatus) {
            pickStatus.style.color = '#15803d';
            pickStatus.innerHTML = `✅ Ditemukan: ${Number(coord.lat).toFixed(5)}, ${Number(coord.lng).toFixed(5)} (${coord.zoneName || 'Zona ' + coord.zoneCode})`;
          }
          showToast(`Titik koordinat berhasil diambil (${Number(coord.lat).toFixed(4)}, ${Number(coord.lng).toFixed(4)}) - ${coord.zoneName || 'Zona ' + coord.zoneCode}`, 'success');
        } else {
          if (pickStatus) {
            pickStatus.style.color = '#b45309';
            pickStatus.textContent = '⚠️ Alamat tidak ditemukan di Google Maps. Coba lengkapi nama jalan/kota atau gunakan Map Picker.';
          }
          showToast(data.message || 'Alamat tidak ditemukan di Google Maps', 'warning');
        }
      } catch (err) {
        if (pickStatus) {
          pickStatus.style.color = '#dc2626';
          pickStatus.textContent = 'Gagal menghubungi server.';
        }
        showToast('Gagal mengambil titik koordinat', 'error');
      } finally {
        btnAutoPick.disabled = false;
      }
    });
  }

  if (formEditAddr) {
    formEditAddr.addEventListener('submit', async (e) => {
      e.preventDefault();
      const shipmentId = document.getElementById('edit-addr-shipment-id').value;
      const destination_address = document.getElementById('edit-addr-text').value;
      const destination_lat = inputLat.value ? parseFloat(inputLat.value) : null;
      const destination_lng = inputLng.value ? parseFloat(inputLng.value) : null;
      const zone_code = inputZone.value;
      const notes = document.getElementById('edit-addr-notes').value;

      try {
        const res = await fetch(`${API}/api/shipments/${shipmentId}/address`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination_address,
            destination_lat,
            destination_lng,
            zone_code,
            notes
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message || 'Alamat dan titik koordinat berhasil disimpan!', 'success');
          closeModal(modalEditAddr);
          await loadData();
        } else {
          showToast(data.message || 'Gagal menyimpan alamat', 'error');
        }
      } catch (err) {
        showToast('Gagal menghubungi server', 'error');
      }
    });
  }
}

window.openEditAddressModal = function(shipmentId) {
  const modal = document.getElementById('modal-edit-address');
  if (!modal) return;

  const s = state.shipments.find(x => x.id === shipmentId);
  if (!s) {
    showToast('Data Surat Jalan tidak ditemukan', 'error');
    return;
  }

  document.getElementById('edit-addr-shipment-id').value = s.id;
  document.getElementById('edit-addr-subtitle').textContent = `${s.sj_number} • ${s.customer_name}`;
  document.getElementById('edit-addr-text').value = s.destination_address || '';
  document.getElementById('edit-addr-lat').value = (s.destination_lat !== null && s.destination_lat !== undefined) ? s.destination_lat : '';
  document.getElementById('edit-addr-lng').value = (s.destination_lng !== null && s.destination_lng !== undefined) ? s.destination_lng : '';
  document.getElementById('edit-addr-zone').value = s.zone_code || 'FR';
  document.getElementById('edit-addr-notes').value = s.notes || '';
  document.getElementById('edit-addr-coords-input').value = (s.destination_lat && s.destination_lng) ? `${s.destination_lat}, ${s.destination_lng}` : '';
  document.getElementById('edit-addr-preset').value = '';

  const pickStatus = document.getElementById('edit-addr-pick-status');
  if (pickStatus) {
    pickStatus.style.display = 'none';
    pickStatus.textContent = '';
  }

  const previewLink = document.getElementById('edit-addr-preview-link');
  if (previewLink) {
    if (s.destination_lat && s.destination_lng) {
      previewLink.href = `https://www.google.com/maps?q=${s.destination_lat},${s.destination_lng}`;
      previewLink.style.display = 'inline-flex';
      previewLink.textContent = `Buka Titik (${Number(s.destination_lat).toFixed(4)}, ${Number(s.destination_lng).toFixed(4)}) di Google Maps`;
    } else {
      previewLink.style.display = 'none';
    }
  }

  openModal(modal);
};

function openSejalurModal() {
  switchTab('tab-otomasi-rute');
}

async function runSejalurAnalysis(targetId) {
  const card = document.getElementById('sejalur-route-card');
  const container = document.getElementById('sejalur-stops-container');
  const titleEl = document.getElementById('sejalur-corridor-title');
  const statsEl = document.getElementById('sejalur-corridor-stats');
  const gmapsBtn = document.getElementById('btn-sejalur-gmaps');
  const tbody = document.getElementById('sejalur-stops-tbody');
  const countBadge = document.getElementById('sejalur-count-badge');
  const excludedBox = document.getElementById('sejalur-excluded-box');
  const excludedList = document.getElementById('sejalur-excluded-list');

  if (statsEl) statsEl.textContent = 'Menganalisis lintasan koridor rute dari J40/J23...';
  if (card) card.style.display = 'block';

  try {
    const res = await fetch(`${API}/api/routing/find-sejalur`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetShipmentId: targetId })
    });
    const result = await res.json();
    if (!result.success || !result.data) {
      showToast(result.message || 'Gagal menghitung rute sejalur', 'error');
      return;
    }

    const data = result.data;
    currentSejalurResult = data;

    // Route Card
    if (titleEl) {
      titleEl.innerHTML = `Gudang Surabaya → ${escapeHtml(data.target.customer_name)} <span class="zone-badge">Zona ${data.target.zone_code || '-'}</span>`;
    }

    const hours = Math.floor(data.totalEstimatedMinutes / 60);
    const mins = data.totalEstimatedMinutes % 60;
    if (statsEl) {
      statsEl.innerHTML = `
        <strong>${data.totalStops} Titik Antar Sejalur</strong> • 
        Total Jarak: <strong>${data.totalDistanceKm} km</strong> • 
        Est. Selesai: <strong>${hours} jam ${mins} menit</strong> (Berangkat jam 08:00 dari J40)
      `;
    }

    if (gmapsBtn) {
      gmapsBtn.href = data.googleMapsUrl || '#';
    }

    // Stops Table (Urut otomatis terdekat dari J40/J23 ke tujuan akhir)
    if (tbody) {
      tbody.innerHTML = '';
      data.orderedStops.forEach(st => {
        const s = st.shipment;
        const tr = document.createElement('tr');
        const isTarget = st.sequence === data.orderedStops.length;

        tr.innerHTML = `
          <td style="text-align:center;">
            <input type="checkbox" class="sejalur-stop-chk" data-id="${s.id}" checked>
          </td>
          <td style="text-align:center;">
            <span class="seq-badge" style="${isTarget ? 'background:var(--success);' : ''}">${st.sequence}</span>
          </td>
          <td>
            <div class="sj-number">${escapeHtml(s.sj_number)}</div>
            <div class="po-number">PO: ${escapeHtml(s.po_number || '-')}</div>
          </td>
          <td>
            <div class="customer-name">${escapeHtml(s.customer_name)}</div>
            <div class="customer-address">${escapeHtml(s.destination_address || '-')}</div>
            <span class="zone-badge" style="margin-top:2px;">Zona ${s.zone_code || '-'}</span>
          </td>
          <td>
            <div style="font-weight:700; color:var(--text-main); font-size:12px;">+${st.leg_distance_km} km</div>
            <div style="font-size:11px; color:var(--text-muted);">Total: ${st.cumulative_km} km</div>
          </td>
          <td>
            <span class="date-badge" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;">
              ${st.eta_time}
            </span>
          </td>
          <td>
            <span class="status-pill ${st.shipment.sejalur_class === 'primary' ? 'siap' : st.shipment.sejalur_class === 'success' ? 'terkirim' : 'jalan'}" style="font-size:10px;">
              ${st.shipment.sejalur_label}
            </span>
          </td>
        `;

        const chk = tr.querySelector('.sejalur-stop-chk');
        chk.addEventListener('change', () => {
          updateSejalurConfirmButton();
        });

        tbody.appendChild(tr);
      });
    }

    if (countBadge) {
      countBadge.textContent = `${data.orderedStops.length} pesanan searah koridor`;
    }

    // Excluded / Off-route shipments
    if (excludedBox && excludedList) {
      if (data.otherShipments && data.otherShipments.length > 0) {
        excludedBox.style.display = 'block';
        excludedList.innerHTML = data.otherShipments.map(s => `
          <span style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:4px; font-size:11px;">
            <strong>${escapeHtml(s.sj_number)}</strong> — ${escapeHtml(s.customer_name)} (${s.sejalur_label})
          </span>
        `).join('');
      } else {
        excludedBox.style.display = 'none';
      }
    }

    if (container) container.style.display = 'block';
    updateSejalurConfirmButton();
  } catch (err) {
    console.error('Sejalur error:', err);
    showToast('Gagal memproses analisis rute sejalur', 'error');
  }
}

function updateSejalurConfirmButton() {
  const btn = document.getElementById('btn-confirm-sejalur-trip');
  const selDriver = document.getElementById('sejalur-driver');
  if (!btn || !selDriver) return;

  const checkedCount = document.querySelectorAll('.sejalur-stop-chk:checked').length;
  const driverName = selDriver.value;
  const vehicle = DRIVER_VEHICLE_MAP[driverName]?.label || 'Armada';

  if (checkedCount > 0) {
    btn.style.display = 'inline-flex';
    btn.textContent = `Tugaskan ${checkedCount} SJ Sejalur ke ${driverName} (${vehicle})`;
  } else {
    btn.style.display = 'none';
  }
}

async function confirmSejalurTrip() {
  const selDriver = document.getElementById('sejalur-driver');
  const modal = document.getElementById('modal-sejalur');
  if (!selDriver) return;

  const checked = Array.from(document.querySelectorAll('.sejalur-stop-chk:checked')).map(c => c.getAttribute('data-id'));
  if (checked.length === 0) {
    showToast('Pilih minimal 1 Surat Jalan untuk ditugaskan', 'warning');
    return;
  }

  const driverName = selDriver.value;
  const vehicleType = DRIVER_VEHICLE_MAP[driverName]?.vehicle || 'TRAGA';
  const today = new Date().toISOString().split('T')[0];

  try {
    const res = await fetch(`${API}/api/routing/assign-sejalur-trip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driverName,
        vehicleType,
        shipmentIds: checked,
        planDate: today,
        assignedBy: state.currentUser?.name || 'Dispatcher',
        tasBingkisan: 'BESAR'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Sukses! ${checked.length} SJ sejalur berhasil ditugaskan ke ${driverName} (${vehicleType})!`, 'success');
      closeModal(modal);
      await loadData();
      switchTab('tab-jadwal-harian');
    } else {
      showToast(data.message || 'Gagal menugaskan trip sejalur', 'error');
    }
  } catch (err) {
    showToast('Gagal menghubungi server', 'error');
  }
}


function openScheduleDateModal(ids = []) {
  const modal = document.getElementById('modal-schedule-date');
  const listEl = document.getElementById('mkt-selected-list');
  const dateInput = document.getElementById('mkt-plan-date');
  if (!modal) return;

  state.selectedMktIds = new Set(ids);

  const selectedShips = state.shipments.filter(s => state.selectedMktIds.has(s.id));
  if (listEl) {
    listEl.innerHTML = selectedShips.map(s => `
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <strong>${escapeHtml(s.sj_number)}</strong>
        <span>${escapeHtml(s.customer_name)}</span>
      </div>
    `).join('');
  }

  // Default date to today
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  openModal(modal);
}

function openAssignDriverModal(shipment) {
  const modal = document.getElementById('modal-assign-driver');
  if (!modal) return;

  document.getElementById('disp-shipment-id').value = shipment.id;

  const infoEl = document.getElementById('disp-sj-info');
  if (infoEl) {
    infoEl.innerHTML = `
      <div><strong>${escapeHtml(shipment.sj_number)}</strong> — ${escapeHtml(shipment.customer_name)}</div>
      <div style="font-size:12px; margin-top:2px;">${escapeHtml(shipment.destination_address || '-')} • <span class="zone-badge">Zona ${shipment.zone_code || '-'}</span></div>
      ${shipment.plan_date ? `<div style="font-size:12px; color:var(--primary); font-weight:600; margin-top:2px;">Tanggal Kirim: ${shipment.plan_date}</div>` : ''}
    `;
  }

  // SKU Muat Info
  const muatEl = document.getElementById('disp-muat-info');
  if (muatEl) {
    const badge = getMuatBadge(shipment.muat_category || 'KECIL');
    let extra = '';
    if (shipment.muat_category === 'BESAR') {
      extra = `<span style="font-size:12px; color:var(--danger); font-weight:600;">Wajib Mobil (Item Besar dalam SJ)</span>`;
    } else if (shipment.muat_category === 'SEDANG') {
      extra = `<span style="font-size:12px; color:var(--warning); font-weight:600;">Rekomendasi: Dispatcher dapat memilih Motor atau Mobil</span>`;
    } else {
      extra = `<span style="font-size:12px; color:var(--success); font-weight:600;">Muat Motor</span>`;
    }
    muatEl.innerHTML = `${badge} ${extra}`;
  }

  // Defaults
  const selVehicle = document.getElementById('disp-vehicle');
  const selDriver = document.getElementById('disp-driver');
  const selTas = document.getElementById('disp-tas');
  const notesInput = document.getElementById('disp-notes');

  if (selVehicle) {
    if (shipment.assigned_vehicle_type) {
      selVehicle.value = shipment.assigned_vehicle_type;
    } else if (shipment.muat_category === 'BESAR') {
      selVehicle.value = 'TRAGA';
    } else {
      selVehicle.value = 'MOTOR';
    }
  }

  if (selDriver) {
    if (shipment.assigned_driver) {
      selDriver.value = shipment.assigned_driver;
    } else if (selVehicle && VEHICLE_DEFAULT_DRIVER[selVehicle.value]) {
      selDriver.value = VEHICLE_DEFAULT_DRIVER[selVehicle.value];
    }
  }

  if (selTas) {
    selTas.value = shipment.tas_size === 'BESAR' ? 'BESAR' : 'KECIL';
  }

  if (notesInput) {
    notesInput.value = shipment.notes || '';
  }

  validateSimAndVehicle();
  openModal(modal);
}

function validateSimAndVehicle() {
  const selDriver = document.getElementById('disp-driver');
  const selVehicle = document.getElementById('disp-vehicle');
  const warningEl = document.getElementById('disp-sim-warning');
  if (!selDriver || !selVehicle || !warningEl) return;

  const driver = selDriver.value;
  const vehicle = selVehicle.value;
  const sims = DRIVER_SIM_MAP[driver] || ['C'];

  if (vehicle !== 'MOTOR' && !sims.includes('A') && !sims.includes('B1')) {
    warningEl.innerHTML = `<strong>PERINGATAN:</strong> Driver ${driver} hanya memiliki SIM ${sims.join(',')}! Tidak diizinkan mengemudikan Mobil.`;
    warningEl.className = 'form-warning visible';
  } else {
    warningEl.innerHTML = '';
    warningEl.className = 'form-warning';
  }
}

function openUserModal(user = null) {
  const modal = document.getElementById('modal-user');
  const title = document.getElementById('modal-user-title');
  const permsContainer = document.getElementById('perm-checkboxes');
  if (!modal) return;

  document.getElementById('edit-user-id').value = user ? user.id : '';
  document.getElementById('user-name').value = user ? user.name : '';
  document.getElementById('user-username').value = user ? user.username : '';
  document.getElementById('user-role').value = user ? user.role : 'DRIVER';
  document.getElementById('user-dept').value = user ? user.department || '' : '';
  document.getElementById('user-license').value = user ? user.license_type || '' : 'C';
  document.getElementById('user-color').value = user ? user.color_code || '#2563eb' : '#2563eb';

  if (title) title.textContent = user ? `Edit User: ${user.name}` : 'Tambah User Baru';

  // Render permission checkboxes
  if (permsContainer) {
    permsContainer.innerHTML = ALL_AVAILABLE_PERMS.map(p => {
      const isChecked = user && (user.permissions || []).includes(p.id);
      return `
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" class="chk-perm" value="${p.id}" ${isChecked ? 'checked' : ''}>
          <span>${p.label}</span>
        </label>
      `;
    }).join('');
  }

  openModal(modal);
}

function openModal(el) {
  if (el) {
    el.classList.add('open');
    el.style.display = 'flex';
  }
}

function closeModal(el) {
  if (el) {
    el.classList.remove('open');
    el.style.display = 'none';
  }
}

// ==============================================================
// HELPERS
// ==============================================================
function getVehicleInfo(type) {
  const map = {
    'MOTOR': { cls: 'motor', label: 'Motor' },
    'CARRY': { cls: 'carry', label: 'Carry' },
    'MOBIL_CARRY': { cls: 'carry', label: 'Carry' },
    'TRAGA': { cls: 'traga', label: 'Traga' },
    'GRANMAX': { cls: 'granmax', label: 'Gran Max' },
    'AVANZA': { cls: 'avanza', label: 'Avanza' },
    'TRUK': { cls: 'truk', label: 'Truk' }
  };
  return map[type] || map['MOTOR'];
}

function getDriverClass(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('munir')) return 'munir';
  if (n.includes('cahyo')) return 'cahyono';
  if (n.includes('adi')) return 'adi';
  if (n.includes('angga')) return 'angga';
  if (n.includes('dani')) return 'dani';
  return 'backup';
}

function getStatusInfo(status) {
  const map = {
    'DRAFT': { cls: 'siap', label: 'Draft' },
    'UNSCHEDULED': { cls: 'siap', label: 'Belum Dijadwalkan' },
    'SCHEDULED': { cls: 'jalan', label: 'Terjadwal' },
    'ASSIGNED': { cls: 'siap', label: 'Siap Kirim' },
    'IN_TRANSIT': { cls: 'jalan', label: 'Di Jalan' },
    'DELIVERED': { cls: 'terkirim', label: 'Terkirim' },
    'FAILED': { cls: 'gagal', label: 'Gagal' }
  };
  return map[status] || { cls: 'siap', label: status || 'Siap' };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==============================================================
// MODAL DETAIL PRODUK SURAT JALAN & REKOMENDASI MUATAN
// ==============================================================
window.openSjDetailModal = async function(shipmentId) {
  const modal = document.getElementById('modal-sj-detail');
  if (!modal) return;

  const title = document.getElementById('modal-sj-title');
  const subtitle = document.getElementById('modal-sj-subtitle');
  const banner = document.getElementById('modal-sj-banner');
  const custEl = document.getElementById('modal-sj-customer');
  const poEl = document.getElementById('modal-sj-po');
  const addrEl = document.getElementById('modal-sj-address');
  const tbody = document.getElementById('modal-sj-items-tbody');

  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Memuat produk...</td></tr>';
  openModal(modal);

  try {
    const res = await fetch(`${API}/api/shipments/${shipmentId}/detail`);
    const data = await res.json();
    if (!data.success || !data.data) {
      showToast('Gagal memuat detail produk Surat Jalan', 'error');
      closeModal(modal);
      return;
    }

    const { shipment, items, besarCount, sedangCount, kecilCount } = data.data;

    title.textContent = `Detail Produk — ${shipment.sj_number}`;
    subtitle.textContent = `Total ${items.length} item produk • Status: ${shipment.status}`;
    custEl.textContent = shipment.customer_name || '-';
    poEl.textContent = `${shipment.po_number || '-'} (SO: ${shipment.so_ref || '-'})`;
    addrEl.textContent = shipment.destination_address || '-';

    const btnModalEditAddr = document.getElementById('btn-modal-edit-addr');
    if (btnModalEditAddr) {
      btnModalEditAddr.onclick = () => {
        closeModal(modal);
        openEditAddressModal(shipmentId);
      };
    }

    const btnSyncSj = document.getElementById('btn-sync-current-sj-items');
    if (btnSyncSj) {
      if (shipment.accurate_id) {
        btnSyncSj.style.display = 'inline-flex';
        btnSyncSj.onclick = async () => {
          btnSyncSj.disabled = true;
          btnSyncSj.textContent = 'Menarik dari Accurate...';
          try {
            const syncRes = await fetch(`${API}/api/shipments/${shipmentId}/sync-items`, { method: 'POST' });
            const syncData = await syncRes.json();
            if (syncData.success) {
              showToast(syncData.message, 'success');
              openSjDetailModal(shipmentId);
              loadData();
            } else {
              showToast(syncData.message || 'Gagal sinkronisasi produk', 'error');
            }
          } catch (e) {
            showToast('Gagal menghubungi Accurate', 'error');
          } finally {
            btnSyncSj.disabled = false;
            btnSyncSj.textContent = 'Tarik Ulang dari Accurate';
          }
        };
      } else {
        btnSyncSj.style.display = 'none';
      }
    }

    // Banner Rekomendasi Muatan:
    // Jika ada minimal 1 barang BESAR -> Wajib Mobil (Traga / Carry)
    // Jika ada barang SEDANG -> Saran Motor / Evaluasi (bisa diakali jika sedikit)
    // Jika semua barang KECIL -> Muat Motor
    if (shipment.muat_category === 'BESAR' || besarCount > 0) {
      banner.className = 'muat-banner banner-besar';
      banner.innerHTML = `
        <div style="font-weight:800; font-size:14px; margin-bottom:4px;">WAJIB MOBIL / TRAGA (Terdapat ${besarCount} Item Besar)</div>
        <div>${escapeHtml(shipment.muat_reason || 'Dalam Surat Jalan ini terdapat produk berukuran besar, sehingga wajib dimuat menggunakan mobil box/pick-up (Carry / Traga).')}</div>
      `;
    } else if (shipment.muat_category === 'SEDANG' || sedangCount > 0) {
      banner.className = 'muat-banner banner-sedang';
      banner.innerHTML = `
        <div style="font-weight:800; font-size:14px; margin-bottom:4px;">SARAN: BISA DIAKALI MOTOR / EVALUASI DISPATCHER (${sedangCount} Item Sedang)</div>
        <div>${escapeHtml(shipment.muat_reason || 'Terdapat produk berukuran sedang. Jika kuantitas sedikit dapat diakali menggunakan motor, atau gunakan mobil jika kapasitas motor tidak memungkinkan.')}</div>
      `;
    } else {
      banner.className = 'muat-banner banner-kecil';
      banner.innerHTML = `
        <div style="font-weight:800; font-size:14px; margin-bottom:4px;">MUAT MOTOR AMAN (Semua ${items.length} Item Kecil)</div>
        <div>${escapeHtml(shipment.muat_reason || 'Semua produk berukuran kecil, aman untuk diangkut menggunakan motor reguler.')}</div>
      `;
    }

    tbody.innerHTML = '';
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Tidak ada rincian line item untuk Surat Jalan ini.</td></tr>';
    } else {
      items.forEach((it, idx) => {
        const tr = document.createElement('tr');
        let sizeBadge = `<span class="badge-kecil">KECIL</span>`;
        if (it.size_class === 'BESAR') sizeBadge = `<span class="badge-besar">BESAR</span>`;
        else if (it.size_class === 'SEDANG') sizeBadge = `<span class="badge-sedang">SEDANG</span>`;

        tr.innerHTML = `
          <td style="text-align:center; font-weight:700;">${idx + 1}</td>
          <td><code style="font-weight:700; color:#1e293b;">${escapeHtml(it.item_no || '-')}</code></td>
          <td>
            <div style="font-weight:600; color:var(--text-main);">${escapeHtml(it.item_name || '-')}</div>
            ${it.master_notes ? `<div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">${escapeHtml(it.master_notes)}</div>` : ''}
          </td>
          <td style="text-align:center; font-weight:700;">${it.quantity} ${escapeHtml(it.unit_name || 'PCS')}</td>
          <td style="text-align:center;">${sizeBadge}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error('Error opening SJ detail:', err);
    showToast('Gagal mengambil data detail produk Surat Jalan', 'error');
  }
};

// ==============================================================
// TAB: MASTER KATEGORI SKU (Besar / Sedang / Kecil)
// ==============================================================
async function loadSkuItems(page = 1) {
  state.skuPage = page;
  const tbody = document.getElementById('sku-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">Memuat katalog SKU...</td></tr>';
  }

  try {
    const params = new URLSearchParams({
      page: state.skuPage,
      limit: state.skuLimit || 50
    });
    if (state.skuSearch) params.set('search', state.skuSearch);
    if (state.skuFilterSize) params.set('size_class', state.skuFilterSize);

    const res = await fetch(`${API}/api/items?${params.toString()}`);
    const data = await res.json();

    if (data.success) {
      state.skuItems = data.data || [];
      state.skuStats = data.stats || { total: 0, besar: 0, sedang: 0, kecil: 0 };
      state.skuTotalPages = data.pagination?.totalPages || 1;
      updateSkuStatsUI();
      renderSkuTable(data.pagination);
    }
  } catch (err) {
    console.error('Error loading SKU items:', err);
    showToast('Gagal memuat data Master SKU', 'error');
  }
}

function updateSkuStatsUI() {
  const elTotal = document.getElementById('sku-stat-total');
  const elBesar = document.getElementById('sku-stat-besar');
  const elSedang = document.getElementById('sku-stat-sedang');
  const elKecil = document.getElementById('sku-stat-kecil');
  if (elTotal) elTotal.textContent = state.skuStats.total.toLocaleString();
  if (elBesar) elBesar.textContent = state.skuStats.besar.toLocaleString();
  if (elSedang) elSedang.textContent = state.skuStats.sedang.toLocaleString();
  if (elKecil) elKecil.textContent = state.skuStats.kecil.toLocaleString();
}

function renderSkuTable(pagination = {}) {
  const tbody = document.getElementById('sku-tbody');
  const paginationInfo = document.getElementById('sku-pagination-info');
  const curPageEl = document.getElementById('sku-current-page');
  const selectAll = document.getElementById('sku-select-all');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (state.skuItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-state-icon">${getSvgIcon('box', 'svg-icon-hero', 42)}</div>
            <h3>Tidak Ada SKU yang Sesuai Filter</h3>
            <p>Klik tombol <strong>"Tarik Master SKU dari Accurate"</strong> untuk menyinkronkan data katalog produk dari Accurate Online.</p>
          </div>
        </td>
      </tr>
    `;
    if (paginationInfo) paginationInfo.textContent = '0 SKU';
    return;
  }

  state.skuItems.forEach(it => {
    const tr = document.createElement('tr');
    const isSelected = state.skuSelectedIds.has(it.id);

    const isKecil = it.size_class === 'KECIL';
    const isSedang = it.size_class === 'SEDANG';
    const isBesar = it.size_class === 'BESAR';

    tr.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" class="sku-row-chk" data-id="${it.id}" ${isSelected ? 'checked' : ''}>
      </td>
      <td>
        <code style="font-weight:700; color:#1e293b; font-size:12px;">${escapeHtml(it.sku)}</code>
      </td>
      <td>
        <div style="font-weight:600; color:var(--text-main); font-size:13px;">${escapeHtml(it.name)}</div>
      </td>
      <td style="text-align:center; font-weight:600; color:var(--text-secondary); font-size:12px;">
        ${escapeHtml(it.unit_name || 'PCS')}
      </td>
      <td style="text-align:center;">
        <div class="sku-cat-toggle">
          <button type="button" class="sku-cat-btn ${isKecil ? 'active-kecil' : ''}" onclick="quickSetSkuCategory('${it.id}', 'KECIL')" title="Barang Kecil (Motor)">Kecil</button>
          <button type="button" class="sku-cat-btn ${isSedang ? 'active-sedang' : ''}" onclick="quickSetSkuCategory('${it.id}', 'SEDANG')" title="Barang Sedang (Bisa diakali motor jika sedikit)">Sedang</button>
          <button type="button" class="sku-cat-btn ${isBesar ? 'active-besar' : ''}" onclick="quickSetSkuCategory('${it.id}', 'BESAR')" title="Barang Besar (Wajib Mobil)">Besar</button>
        </div>
      </td>
      <td>
        <div style="font-size:12px; color:var(--text-secondary);">${escapeHtml(it.category_notes || '-')}</div>
      </td>
    `;

    const chk = tr.querySelector('.sku-row-chk');
    chk.addEventListener('change', (e) => {
      if (e.target.checked) state.skuSelectedIds.add(it.id);
      else state.skuSelectedIds.delete(it.id);
      updateSkuBatchBar();
    });

    tbody.appendChild(tr);
  });

  if (paginationInfo) {
    const total = pagination.total || state.skuItems.length;
    const start = (state.skuPage - 1) * state.skuLimit + 1;
    const end = Math.min(start + state.skuItems.length - 1, total);
    paginationInfo.textContent = `Menampilkan ${start} - ${end} dari total ${total.toLocaleString()} SKU`;
  }
  if (curPageEl) {
    curPageEl.textContent = `${state.skuPage} / ${state.skuTotalPages}`;
  }

  if (selectAll) {
    selectAll.checked = state.skuItems.length > 0 && state.skuItems.every(i => state.skuSelectedIds.has(i.id));
  }

  updateSkuBatchBar();
}

function updateSkuBatchBar() {
  const bar = document.getElementById('sku-batch-bar');
  const countEl = document.getElementById('sku-selected-count');
  const count = state.skuSelectedIds.size;
  if (!bar) return;
  if (count > 0) {
    bar.style.display = 'flex';
    if (countEl) countEl.textContent = count;
  } else {
    bar.style.display = 'none';
  }
}

window.quickSetSkuCategory = async function(itemId, newSize) {
  try {
    const res = await fetch(`${API}/api/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size_class: newSize, updated_by: state.currentUser?.name || 'Tim ATS' })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      // Update item in local list
      const item = state.skuItems.find(i => i.id === itemId);
      if (item) item.size_class = newSize;
      loadSkuItems(state.skuPage);
      // Reload shipments so that load recommendations update immediately
      loadData();
    } else {
      showToast(data.message || 'Gagal mengubah kategori', 'error');
    }
  } catch (err) {
    showToast('Gagal menghubungi server', 'error');
  }
};

async function bulkSetSkuCategory(sizeClass) {
  const ids = Array.from(state.skuSelectedIds);
  if (ids.length === 0) {
    showToast('Pilih minimal 1 SKU', 'warning');
    return;
  }

  try {
    const res = await fetch(`${API}/api/items/bulk-categorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds: ids, sizeClass, updatedBy: state.currentUser?.name || 'Tim ATS' })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      state.skuSelectedIds.clear();
      loadSkuItems(state.skuPage);
      loadData();
    } else {
      showToast(data.message || 'Gagal mengubah kategori massal', 'error');
    }
  } catch (err) {
    showToast('Gagal menghubungi server', 'error');
  }
}

async function syncSkuFromAccurate() {
  const btn = document.getElementById('btn-sync-sku-accurate');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menarik SKU Accurate...';
  }

  try {
    const res = await fetch(`${API}/api/accurate/sync-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxPages: 5, pageSize: 100 })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Berhasil menarik ${data.saved || 0} SKU dari Accurate Online! Total katalog Accurate: ${data.totalRowsInAccurate || 0} SKU.`, 'success');
      loadSkuItems(1);
    } else {
      showToast(data.error || 'Gagal sinkronisasi katalog Accurate', 'error');
    }
  } catch (err) {
    showToast('Gagal menghubungi server Accurate', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Tarik Master SKU dari Accurate';
    }
  }
}

async function recalculateAllMuat() {
  const btn = document.getElementById('btn-recalc-all-muat');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menghitung Ulang...';
  }

  try {
    await fetch(`${API}/api/items/bulk-categorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds: [], sizeClass: 'KECIL' }) // Triggers recalculateAllShipmentsMuat
    });
    showToast('Muatan seluruh Surat Jalan berhasil dihitung ulang!', 'success');
    loadData();
  } catch (err) {
    showToast('Gagal menghitung ulang muatan', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Hitung Ulang Muatan Semua SJ';
    }
  }
}

// ==============================================================
// TAB: OTOMASI JALUR RUTE (Kategorisasi Rute A, B, C, D... & Google Maps Waypoints)
// ==============================================================

const OPERATIONAL_DRIVERS = [
  { name: 'Munir', vehicle: 'MOBIL', label: 'Munir — Isuzu Traga (Mobil)' },
  { name: 'Dani', vehicle: 'MOBIL', label: 'Dani — Suzuki Carry (Mobil)' },
  { name: 'Agus', vehicle: 'MOBIL', label: 'Agus — Gran Max (Mobil)' },
  { name: 'Arifin', vehicle: 'MOBIL', label: 'Arifin — Avanza (Mobil)' },
  { name: 'Angga', vehicle: 'MOTOR', label: 'Angga — Motor Reguler' },
  { name: 'Hendrik', vehicle: 'MOTOR', label: 'Hendrik — Motor Reguler' },
  { name: 'Markus', vehicle: 'MOTOR', label: 'Markus — Motor Reguler' },
  { name: 'Zahril', vehicle: 'MOTOR', label: 'Zahril — Motor Reguler' },
  { name: 'Aldi', vehicle: 'MOTOR', label: 'Aldi — Motor Reguler' },
  { name: 'Cahyono', vehicle: 'MOBIL', label: 'Cahyono — Truk (Mobil)' },
  { name: 'Pak Adi', vehicle: 'MOBIL', label: 'Pak Adi — Mobil' }
];

state.categorizedRoutesByContainer = {};
state.draggedStopData = null;

function rebuildRouteGoogleMapsUrl(origin, stops) {
  if (!stops || stops.length === 0) return '';
  const originStr = encodeURIComponent(origin || 'Jl. Semolowaru Timur II No.19, RT.006/RW.002, Semolowaru, Kec. Sukolilo, Surabaya, Jawa Timur 60119');
  const destParts = stops.map(s => encodeURIComponent(s.address || s.customerName || 'Surabaya'));
  return `https://www.google.com/maps/dir/${originStr}/${destParts.join('/')}`;
}

async function loadCategorizedRoutes(containerId, dateParam, periodParam) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center; padding:36px; color:var(--text-muted); grid-column: 1 / -1;">
      <div style="font-weight:700; font-size:14px; margin-bottom:6px;">Mengelompokkan Surat Jalan ke Koridor Rute A, B, C, D...</div>
      <div style="font-size:12px;">Menyusun waypoint terdekat dari Gudang J40...</div>
    </div>
  `;

  try {
    const params = new URLSearchParams();
    if (dateParam) params.set('date', dateParam);
    if (periodParam) params.set('period', periodParam);

    const res = await fetch(`${API}/api/routing/categorized-routes?${params.toString()}`);
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1; background:#fff; padding:30px; border:1px solid var(--border-color); border-radius:8px;">
          <h4>Gagal Memuat Rute Terkategori</h4>
          <p>${escapeHtml(data.message || 'Terjadi kesalahan')}</p>
        </div>
      `;
      return;
    }

    state.categorizedRoutesByContainer[containerId] = data.routes || [];
    renderCategorizedRoutes(containerId, data.routes || [], data.date || dateParam);
  } catch (err) {
    console.error('Error loading categorized routes:', err);
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1; background:#fff; padding:30px; border:1px solid var(--border-color); border-radius:8px;">
        <h4>Gagal Menghubungi Server</h4>
        <p>Silakan coba beberapa saat lagi.</p>
      </div>
    `;
  }
}

function renderCategorizedRoutes(containerId, routes, date) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  if (!routes || routes.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1; background:#fff; border:1px solid var(--border-color); border-radius:var(--radius-md); padding:40px; text-align:center;">
        <div class="empty-state-icon">${getSvgIcon('navigation', 'svg-icon-hero', 42)}</div>
        <h3 style="margin-top:10px;">Tidak Ada Surat Jalan Pengiriman pada Jadwal Ini</h3>
        <p style="color:var(--text-secondary); max-width:500px; margin:8px auto;">
          Surat Jalan dengan status pengiriman (bukan Ambil di J23) yang dijadwalkan pada tanggal ini akan otomatis dikelompokkan ke dalam koridor Rute A, B, C, D...
        </p>
      </div>
    `;
    return;
  }

  routes.forEach(r => {
    // Normalize route properties
    r.id = r.id || r.routeId || `route-${Math.random()}`;
    r.name = r.name || r.routeName || 'Rute Pengiriman';
    r.corridorKey = r.corridorKey || r.routeLetter || '';
    r.description = r.description || r.corridorTitle || r.corridorArea || '';
    r.estimatedKm = r.estimatedKm || r.totalKm || 0;
    r.estimatedMinutes = r.estimatedMinutes || r.totalMinutes || 0;
    r.assignedDriver = r.assignedDriver || r.assigned_driver || '';
    r.assignedVehicleType = r.assignedVehicleType || r.assigned_vehicle_type || r.assignedVehicle || '';
    r.isAssigned = r.isAssigned || Boolean(r.assignedDriver);
    if (!r.googleMapsUrl && r.stops) {
      r.googleMapsUrl = rebuildRouteGoogleMapsUrl('Jl. Semolowaru Timur II No.19, RT.006/RW.002, Semolowaru, Kec. Sukolilo, Surabaya, Jawa Timur 60119', r.stops);
    }

    // Normalize stops
    (r.stops || []).forEach((st, idx) => {
      st.shipmentId = st.shipmentId || st.shipment_id || (st.shipment && st.shipment.id);
      st.sjNumber = st.sjNumber || st.sj_number || (st.shipment && st.shipment.sj_number) || '-';
      st.customerName = st.customerName || st.customer_name || (st.shipment && st.shipment.customer_name) || 'Customer';
      st.address = st.address || st.destination_address || (st.shipment && st.shipment.destination_address) || '-';
      st.poNumber = st.poNumber || st.po_number || (st.shipment && st.shipment.po_number) || '';
      st.zoneCode = st.zoneCode || st.zone_code || (st.shipment && st.shipment.zone_code) || '-';
      st.muatCategory = st.muatCategory || st.muat_category || (st.shipment && st.shipment.muat_category) || 'KECIL';
      st.legDistanceKm = st.legDistanceKm !== undefined ? st.legDistanceKm : (st.leg_distance_km !== undefined ? st.leg_distance_km : 2.5);
      st.legMinutes = st.legMinutes !== undefined ? st.legMinutes : (st.leg_minutes !== undefined ? st.leg_minutes : 15);
      st.cumulativeKm = st.cumulativeKm !== undefined ? st.cumulativeKm : (st.cumulative_km !== undefined ? st.cumulative_km : 0);
      st.etaTime = st.etaTime || st.eta_time || '';
    });

    const card = document.createElement('div');
    card.className = 'route-cluster-card';
    card.id = `route-card-${containerId}-${r.id}`;

    // Has any item requiring Mobil?
    const hasBesar = (r.stops || []).some(st => st.muatCategory === 'BESAR');
    const defaultVeh = r.assignedVehicleType || (hasBesar ? 'MOBIL' : 'MOTOR');
    const defaultDriver = r.assignedDriver || (defaultVeh === 'MOBIL' ? 'Munir' : 'Angga');

    // Build Driver Options
    const driverOptsHtml = OPERATIONAL_DRIVERS.map(d => {
      const isSel = (r.assignedDriver ? r.assignedDriver === d.name : defaultDriver === d.name);
      return `<option value="${escapeHtml(d.name)}" data-veh="${d.vehicle}" ${isSel ? 'selected' : ''}>${escapeHtml(d.label)}</option>`;
    }).join('');

    // Waypoints HTML in Google Maps multi-stop style
    const stopsTimelineHtml = (r.stops || []).map((st, idx) => {
      const isLast = idx === r.stops.length - 1;
      const legMins = st.legMinutes || 15;
      const legKm = st.legDistanceKm || 2.5;

      return `
        <!-- Travel Leg indicator like Google Maps -->
        <div class="gmaps-leg-indicator">
          <span>⏱️ ~${legMins} mnt</span>
          <span>•</span>
          <span>+${legKm} km</span>
        </div>

        <div class="gmaps-timeline-item" id="stop-item-${containerId}-${r.id}-${idx}">
          <div class="gmaps-timeline-left">
            <span class="gmaps-timeline-dot ${isLast ? 'dest-dot' : ''}"></span>
            ${!isLast ? '<span class="gmaps-timeline-line"></span>' : ''}
          </div>
          <div class="gmaps-stop-card"
               draggable="true"
               ondragstart="window.onDragStopStart(event, '${r.id}', ${idx}, '${containerId}')"
               ondragend="window.onDragStopEnd(event)"
               ondragover="window.onDragStopOver(event)"
               ondragleave="window.onDragStopLeave(event)"
               ondrop="window.onDropStop(event, '${r.id}', ${idx}, '${containerId}')"
               title="Tarik untuk menyusun ulang">
            <div class="gmaps-drag-handle" title="Tarik untuk menyusun ulang">:::</div>
            <div class="gmaps-stop-info">
              <div class="gmaps-stop-customer">
                <span style="display:inline-block; width:18px; height:18px; line-height:18px; text-align:center; background:#1e293b; color:#fff; border-radius:50%; font-size:10px; margin-right:4px;">${idx + 1}</span>
                ${escapeHtml(st.customerName)}
              </div>
              <div class="gmaps-stop-address" title="${escapeHtml(st.address)}">${escapeHtml(st.address)}</div>
              <div class="gmaps-stop-sub">
                <span class="clickable-sj" onclick="openSjDetailModal('${st.shipmentId}')" title="Klik untuk rincian produk">${escapeHtml(st.sjNumber)}</span>
                ${st.poNumber ? `<span style="color:#64748b;">(PO: ${escapeHtml(st.poNumber)})</span>` : ''}
                ${getMuatBadge(st.muatCategory || 'KECIL')}
                <span style="color:#2563eb; font-weight:700;">Zona ${escapeHtml(st.zoneCode || '-')}</span>
                <span style="color:#64748b;">• Kumulatif: ${st.cumulativeKm} km</span>
              </div>
              <div style="margin-top:6px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:11px; color:#475569; font-weight:600;">Pindah Rute:</span>
                <select class="select-filter" style="font-size:11px; padding:2px 8px; height:24px; border-radius:4px; max-width:210px; border-color:#93c5fd; background:#eff6ff;" onchange="window.handleTransferStopToRoute('${st.shipmentId}', this.value, '${containerId}')">
                  <option value="">Pilih Rute Tujuan...</option>
                  ${(state.masterRoutes && state.masterRoutes.length > 0
                    ? state.masterRoutes.filter(mr => mr.is_active).map(mr => `<option value="${mr.route_code}">${escapeHtml(mr.route_name)} (${escapeHtml((mr.destination_area || '').split(',')[0])})</option>`).join('')
                    : `
                      <option value="A">Rute A (Gresik / Margomulyo)</option>
                      <option value="B">Rute B (Sidoarjo / Waru)</option>
                      <option value="C">Rute C (Buduran / Gedangan)</option>
                      <option value="D">Rute D (Pasuruan / PIER)</option>
                      <option value="E">Rute E (Mojokerto / Ngoro)</option>
                      <option value="F">Rute F (Surabaya Timur / SIER)</option>
                    `
                  )}
                </select>
              </div>
            </div>
            <div class="gmaps-stop-actions">
              <button class="btn-gmaps-reorder" type="button" title="Pindah ke atas" onclick="window.moveRouteStop('${r.id}', ${idx}, -1, '${containerId}')" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>▲</button>
              <button class="btn-gmaps-reorder" type="button" title="Pindah ke bawah" onclick="window.moveRouteStop('${r.id}', ${idx}, 1, '${containerId}')" ${isLast ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>▼</button>
              <button class="btn-gmaps-remove" type="button" title="Keluarkan dari rute ini" onclick="window.removeStopFromRoute('${r.id}', ${idx}, '${containerId}')">&times;</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <!-- Route Header -->
      <div class="route-cluster-header">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="route-cluster-tag" style="background:${r.color || '#2563eb'}; color:white;">${escapeHtml(r.corridorKey ? 'RUTE ' + r.corridorKey : r.name)}</span>
            <div class="route-cluster-title">${escapeHtml(r.name)}</div>
          </div>
          <div style="font-size:12px; color:#475569; margin-top:4px;">
            📍 Arah: <strong>${escapeHtml(r.corridorArea || r.description || 'Sesuai Master Rute')}</strong>
            <button type="button" class="btn btn-outline btn-xs" onclick="window.openEditRouteByCode('${r.routeCode || r.routeLetter || r.corridorKey}')" style="margin-left:6px; font-size:11px; padding:1px 6px; border-color:#93c5fd; color:#2563eb; cursor:pointer;" title="Edit arah tujuan dan kata kunci rute ini">
              ✏️ Edit Arah Rute
            </button>
          </div>
          <div class="route-cluster-meta" style="margin-top:2px;">
            ${escapeHtml(r.description || 'Koridor Pengiriman')} • <strong>${(r.stops || []).length}</strong> Surat Jalan
          </div>
        </div>
        <div style="text-align:right;">
          ${r.isAssigned
            ? `<span class="status-badge" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; font-weight:700; font-size:11px;">✓ ${escapeHtml(r.assignedDriver)} (${escapeHtml(r.assignedVehicleType)})</span>`
            : `<span class="status-badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-weight:600; font-size:11px;">Belum Ditugaskan</span>`
          }
          <div style="margin-top:6px;">
            <a href="${r.googleMapsUrl || '#'}" target="_blank" class="btn btn-outline btn-sm" style="text-decoration:none; padding:3px 8px; font-size:11px; display:inline-flex; align-items:center; gap:4px;">
              ${getSvgIcon('navigation', '', 12)} Buka di Maps
            </a>
          </div>
        </div>
      </div>

      <!-- Tim Operasional Assignment Box -->
      <div class="route-cluster-ops-box">
        <div class="route-cluster-ops-title">
          <span>Tim Operasional Menentukan Dibawa Siapa:</span>
          ${hasBesar ? '<span style="color:#b91c1c; font-size:11px; font-weight:700;">⚠️ Muatan BESAR: Wajib Mobil</span>' : '<span style="color:#15803d; font-size:11px; font-weight:600;">✓ Muatan Kecil/Sedang: Aman Motor</span>'}
        </div>
        <div class="route-ops-controls">
          <div>
            <label style="font-size:11px; font-weight:600; color:#475569; display:block; margin-bottom:2px;">Pengemudi (Driver):</label>
            <select class="select-filter" id="driver-sel-${containerId}-${r.id}" style="width:100%; font-size:12px; padding:6px;" onchange="window.onRouteDriverSelectChange('${r.id}', '${containerId}')">
              ${driverOptsHtml}
            </select>
          </div>
          <div>
            <label style="font-size:11px; font-weight:600; color:#475569; display:block; margin-bottom:2px;">Armada / Kendaraan:</label>
            <select class="select-filter" id="veh-sel-${containerId}-${r.id}" style="width:100%; font-size:12px; padding:6px;">
              <option value="MOBIL" ${defaultVeh === 'MOBIL' ? 'selected' : ''}>MOBIL (Carry / Traga / Gran Max)</option>
              <option value="MOTOR" ${defaultVeh === 'MOTOR' ? 'selected' : ''}>MOTOR (Reguler)</option>
            </select>
          </div>
          <div style="align-self:flex-end;">
            <button class="btn btn-primary btn-sm" onclick="window.handleAssignRoute('${r.id}', '${containerId}')" type="button" style="white-space:nowrap;">
              Tugaskan Rute Ini
            </button>
          </div>
        </div>
      </div>

      <!-- Google Maps Multi-Stop Waypoints UI -->
      <div class="gmaps-stops-container">
        <div class="gmaps-travel-summary">
          <div class="gmaps-travel-pill">
            ${getSvgIcon('navigation', '', 14)}
            <span>Total: ~${r.estimatedKm || 0} km</span>
          </div>
          <div style="font-size:11px; color:#64748b;">
            Est. Waktu Tempuh: <strong>~${r.estimatedMinutes || 0} menit</strong> (Mulai dari Gudang J40)
          </div>
        </div>

        <div class="gmaps-stop-timeline">
          <!-- Titik Awal: Gudang J40 -->
          <div class="gmaps-timeline-item">
            <div class="gmaps-timeline-left">
              <span class="gmaps-timeline-dot origin-dot"></span>
              <span class="gmaps-timeline-line"></span>
            </div>
            <div class="gmaps-stop-card" style="background:#f0fdf4; border-color:#86efac; cursor:default;">
              <div class="gmaps-stop-info">
                <div class="gmaps-stop-customer" style="color:#166534; font-weight:800;">
                  🏢 Titik Awal: Gudang J40 Surabaya
                </div>
                <div class="gmaps-stop-address">Jl. Semolowaru Timur II No.19, RT.006/RW.002, Sukolilo, Surabaya</div>
              </div>
            </div>
          </div>

          <!-- Waypoints List -->
          ${stopsTimelineHtml}
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

function onRouteDriverSelectChange(routeId, containerId) {
  const driverSel = document.getElementById(`driver-sel-${containerId}-${routeId}`);
  const vehSel = document.getElementById(`veh-sel-${containerId}-${routeId}`);
  if (!driverSel || !vehSel) return;
  const opt = driverSel.options[driverSel.selectedIndex];
  const autoVeh = opt.getAttribute('data-veh');
  if (autoVeh) {
    vehSel.value = autoVeh;
  }
}

function moveRouteStop(routeId, stopIndex, direction, containerId) {
  const routes = state.categorizedRoutesByContainer[containerId];
  if (!routes) return;
  const route = routes.find(r => r.id === routeId || r.routeId === routeId);
  if (!route || !route.stops) return;

  const newIndex = stopIndex + direction;
  if (newIndex < 0 || newIndex >= route.stops.length) return;

  const temp = route.stops[stopIndex];
  route.stops[stopIndex] = route.stops[newIndex];
  route.stops[newIndex] = temp;

  route.stops.forEach((st, idx) => {
    st.stepIndex = idx + 1;
  });

  // Persist order to backend
  const orderedIds = route.stops.map(st => st.shipmentId).filter(Boolean);
  if (orderedIds.length > 0) {
    fetch(`${API}/api/routing/reorder-stops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedShipmentIds: orderedIds })
    }).catch(e => console.error('Error persisting route sequence:', e));
  }

  route.googleMapsUrl = rebuildRouteGoogleMapsUrl('Jl. Semolowaru Timur II No.19, RT.006/RW.002, Semolowaru, Kec. Sukolilo, Surabaya, Jawa Timur 60119', route.stops);

  renderCategorizedRoutes(containerId, routes, state.currentCategorizedDate);
  showToast(`Urutan stop dipindahkan ke nomor ${newIndex + 1}`, 'info', 1500);
}

window.handleTransferStopToRoute = async function(shipmentId, targetRouteKey, containerId) {
  if (!targetRouteKey || !shipmentId) return;
  try {
    const res = await fetch(`${API}/api/routing/move-stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId, targetRouteKey })
    });
    const json = await res.json();
    if (json.success) {
      showToast(json.message || `Surat Jalan berhasil dipindahkan ke Rute ${targetRouteKey}!`, 'success');
      loadCategorizedRoutes(containerId, state.currentCategorizedDate);
    } else {
      showToast(json.message || 'Gagal memindahkan rute', 'error');
    }
  } catch (err) {
    showToast('Gagal memindahkan rute: ' + err.message, 'error');
  }
};

function onDragStopStart(e, routeId, index, containerId) {
  state.draggedStopData = { routeId, index, containerId };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify({ routeId, index, containerId }));
  e.currentTarget.classList.add('dragging');
}

function onDragStopEnd(e) {
  e.currentTarget.classList.remove('dragging');
}

function onDragStopOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const card = e.currentTarget.closest('.gmaps-stop-card');
  if (card) card.classList.add('drag-over');
}

function onDragStopLeave(e) {
  const card = e.currentTarget.closest('.gmaps-stop-card');
  if (card) card.classList.remove('drag-over');
}

function onDropStop(e, targetRouteId, targetIndex, containerId) {
  e.preventDefault();
  const card = e.currentTarget.closest('.gmaps-stop-card');
  if (card) card.classList.remove('drag-over');

  const data = state.draggedStopData;
  if (!data || data.containerId !== containerId || (data.routeId !== targetRouteId && data.routeId !== targetRouteId.replace('route-', ''))) return;

  const sourceIndex = data.index;
  if (sourceIndex === targetIndex) return;

  const routes = state.categorizedRoutesByContainer[containerId];
  if (!routes) return;
  const route = routes.find(r => r.id === targetRouteId || r.routeId === targetRouteId);
  if (!route || !route.stops) return;

  const [movedItem] = route.stops.splice(sourceIndex, 1);
  route.stops.splice(targetIndex, 0, movedItem);

  route.stops.forEach((st, idx) => {
    st.stepIndex = idx + 1;
  });

  route.googleMapsUrl = rebuildRouteGoogleMapsUrl('Jl. Semolowaru Timur II No.19, RT.006/RW.002, Semolowaru, Kec. Sukolilo, Surabaya, Jawa Timur 60119', route.stops);

  renderCategorizedRoutes(containerId, routes, state.currentCategorizedDate);
  showToast(`Stop berhasil dipindahkan ke urutan ${targetIndex + 1}!`, 'success', 2000);
}

function removeStopFromRoute(routeId, stopIndex, containerId) {
  const routes = state.categorizedRoutesByContainer[containerId];
  if (!routes) return;
  const route = routes.find(r => r.id === routeId || r.routeId === routeId);
  if (!route || !route.stops) return;

  const removed = route.stops.splice(stopIndex, 1)[0];
  route.stops.forEach((st, idx) => {
    st.stepIndex = idx + 1;
  });
  route.googleMapsUrl = rebuildRouteGoogleMapsUrl('Jl. Semolowaru Timur II No.19, RT.006/RW.002, Semolowaru, Kec. Sukolilo, Surabaya, Jawa Timur 60119', route.stops);

  renderCategorizedRoutes(containerId, routes, state.currentCategorizedDate);
  showToast(`Surat Jalan ${removed.sjNumber || removed.sj_number} dikeluarkan dari ${route.name}`, 'warning', 2500);
}

async function handleAssignRoute(routeId, containerId) {
  const routes = state.categorizedRoutesByContainer[containerId];
  if (!routes) return;
  const route = routes.find(r => r.id === routeId || r.routeId === routeId);
  if (!route) return;

  const selDriver = document.getElementById(`driver-sel-${containerId}-${route.id}`)?.value;
  const selVehicle = document.getElementById(`veh-sel-${containerId}-${route.id}`)?.value;

  if (!selDriver) {
    showToast('Pilih Driver terlebih dahulu!', 'warning');
    return;
  }

  const shipmentIds = (route.stops || []).map(st => st.shipmentId);
  if (shipmentIds.length === 0) {
    showToast('Rute ini tidak memiliki Surat Jalan!', 'warning');
    return;
  }

  try {
    const res = await fetch(`${API}/api/routing/assign-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeName: route.name,
        driver: selDriver,
        vehicleType: selVehicle || 'MOBIL',
        shipmentIds: shipmentIds,
        date: state.currentCategorizedDate || route.date || '2026-10-01'
      })
    });

    const result = await res.json();
    if (!result.success) {
      showToast(result.message || 'Gagal menugaskan rute', 'error');
      return;
    }

    showToast(`✓ ${route.name} berhasil ditugaskan ke ${selDriver} (${selVehicle})!`, 'success');

    route.isAssigned = true;
    route.assignedDriver = selDriver;
    route.assignedVehicleType = selVehicle;

    renderCategorizedRoutes(containerId, routes, state.currentCategorizedDate);
    loadData();

    if (state.activeTab === 'tab-hari-ini') {
      loadTodayDashboard(state.todayDate);
    }
  } catch (err) {
    console.error('Assign route error:', err);
    showToast('Gagal menugaskan rute: ' + err.message, 'error');
  }
}

async function loadJalurOverview() {
  const dateInput = document.getElementById('jalur-filter-date');
  const planDate = state.jalurFilterDate !== undefined ? state.jalurFilterDate : '';
  const period = state.jalurFilterPeriod || 'all';
  state.currentCategorizedDate = planDate;
  await loadCategorizedRoutes('jalur-cards-container', planDate, period);
}

function initRouteTabModule() {
  const btnToday = document.getElementById('btn-route-date-today');
  const btnTomorrow = document.getElementById('btn-route-date-tomorrow');
  const btnAll = document.getElementById('btn-route-date-all');
  const dateInput = document.getElementById('jalur-filter-date');
  const btnRefresh = document.getElementById('btn-refresh-jalur');

  if (btnAll) {
    btnAll.addEventListener('click', () => {
      btnAll.classList.add('btn-primary');
      btnAll.classList.remove('btn-outline');
      btnToday?.classList.remove('btn-primary');
      btnToday?.classList.add('btn-outline');
      btnTomorrow?.classList.remove('btn-primary');
      btnTomorrow?.classList.add('btn-outline');
      state.jalurFilterDate = '';
      state.jalurFilterPeriod = 'all';
      state.currentCategorizedDate = '';
      if (dateInput) dateInput.value = '';
      loadCategorizedRoutes('jalur-cards-container', '', 'all');
    });
  }

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      btnToday.classList.add('btn-primary');
      btnToday.classList.remove('btn-outline');
      btnTomorrow?.classList.remove('btn-primary');
      btnTomorrow?.classList.add('btn-outline');
      btnAll?.classList.remove('btn-primary');
      btnAll?.classList.add('btn-outline');
      if (dateInput) dateInput.value = '2026-10-02';
      state.jalurFilterDate = '2026-10-02';
      state.jalurFilterPeriod = 'today';
      state.currentCategorizedDate = '2026-10-02';
      loadCategorizedRoutes('jalur-cards-container', '2026-10-02', 'today');
    });
  }

  if (btnTomorrow) {
    btnTomorrow.addEventListener('click', () => {
      btnTomorrow.classList.add('btn-primary');
      btnTomorrow.classList.remove('btn-outline');
      btnToday?.classList.remove('btn-primary');
      btnToday?.classList.add('btn-outline');
      btnAll?.classList.remove('btn-primary');
      btnAll?.classList.add('btn-outline');
      if (dateInput) dateInput.value = '2026-10-03';
      state.jalurFilterDate = '2026-10-03';
      state.jalurFilterPeriod = 'tomorrow';
      state.currentCategorizedDate = '2026-10-03';
      loadCategorizedRoutes('jalur-cards-container', '2026-10-03', 'tomorrow');
    });
  }

  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      state.jalurFilterDate = e.target.value;
      state.jalurFilterPeriod = 'custom';
      state.currentCategorizedDate = e.target.value;
      btnToday?.classList.remove('btn-primary');
      btnToday?.classList.add('btn-outline');
      btnTomorrow?.classList.remove('btn-primary');
      btnTomorrow?.classList.add('btn-outline');
      btnAll?.classList.remove('btn-primary');
      btnAll?.classList.add('btn-outline');
      loadCategorizedRoutes('jalur-cards-container', e.target.value, 'custom');
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadCategorizedRoutes('jalur-cards-container', state.jalurFilterDate || '', state.jalurFilterPeriod || 'all');
    });
  }
}

window.moveRouteStop = moveRouteStop;
window.removeStopFromRoute = removeStopFromRoute;
window.handleAssignRoute = handleAssignRoute;
window.onRouteDriverSelectChange = onRouteDriverSelectChange;
window.onDragStopStart = onDragStopStart;
window.onDragStopEnd = onDragStopEnd;
window.onDragStopOver = onDragStopOver;
window.onDragStopLeave = onDragStopLeave;
window.onDropStop = onDropStop;

// ==============================================================
// MODUL: PENGIRIMAN HARI INI (Command Center Khusus Hari Ini)
// ==============================================================
function initTodayModule() {
  const btnToday = document.getElementById('btn-today-date-today');
  const btnTomorrow = document.getElementById('btn-today-date-tomorrow');
  const customDateInput = document.getElementById('today-custom-date');
  const btnRefresh = document.getElementById('btn-refresh-today');
  const searchInput = document.getElementById('today-search');

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      btnToday.classList.add('btn-primary');
      btnToday.classList.remove('btn-outline');
      btnTomorrow?.classList.remove('btn-primary');
      btnTomorrow?.classList.add('btn-outline');
      state.todayDate = '2026-10-01';
      if (customDateInput) customDateInput.value = state.todayDate;
      loadTodayDashboard(state.todayDate);
    });
  }

  if (btnTomorrow) {
    btnTomorrow.addEventListener('click', () => {
      btnTomorrow.classList.add('btn-primary');
      btnTomorrow.classList.remove('btn-outline');
      btnToday?.classList.remove('btn-primary');
      btnToday?.classList.add('btn-outline');
      state.todayDate = '2026-10-02';
      if (customDateInput) customDateInput.value = state.todayDate;
      loadTodayDashboard(state.todayDate);
    });
  }

  if (customDateInput) {
    customDateInput.addEventListener('change', (e) => {
      state.todayDate = e.target.value;
      btnToday?.classList.remove('btn-primary');
      btnToday?.classList.add('btn-outline');
      btnTomorrow?.classList.remove('btn-primary');
      btnTomorrow?.classList.add('btn-outline');
      loadTodayDashboard(state.todayDate);
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadTodayDashboard(state.todayDate);
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.todaySearch = e.target.value.toLowerCase();
      renderTodayShipmentsTable();
    });
  }
}

async function loadTodayDashboard(date) {
  try {
    const targetDate = date || state.todayDate || '2026-10-02';
    const res = await fetch(`${API}/api/dashboard/today?date=${targetDate}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Gagal memuat dashboard hari ini');

    state.todayData = json;
    renderTodayDashboard(json);
  } catch (err) {
    console.error('[Today Dashboard Error]:', err);
    showToast('Gagal memuat dashboard hari ini: ' + err.message, 'error');
  }
}

function renderTodayDashboard(data) {
  const stats = data.stats || {};
  const dateEl = document.getElementById('today-stat-date-label');
  if (dateEl) {
    const parts = (data.date || '').split('-');
    const formatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : data.date;
    dateEl.textContent = `Tanggal: ${formatted}`;
  }

  const elTotal = document.getElementById('today-stat-total');
  if (elTotal) elTotal.textContent = stats.total_shipments || 0;

  const elVeh = document.getElementById('today-stat-vehicles');
  if (elVeh) elVeh.textContent = `${stats.mobil_count || 0} Mobil / ${stats.motor_count || 0} Motor`;

  const elCap = document.getElementById('today-stat-capacity');
  if (elCap) elCap.textContent = `${stats.avg_load || 0} SJ / Driver`;

  const elPickup = document.getElementById('today-stat-pickup');
  if (elPickup) elPickup.textContent = `${stats.pickup_count || 0} SJ`;

  renderTodayDriverLoads(data.driver_loads || []);
  renderTodayJalurs(data.jalurs || []);
  renderTodayShipmentsTable();
}

function renderTodayDriverLoads(loads) {
  const container = document.getElementById('today-driver-capacity-cards');
  if (!container) return;

  if (loads.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding:30px;">
        <div class="empty-state-icon">${getSvgIcon('truck', 'svg-icon-hero', 40)}</div>
        <div style="font-weight:700; margin-top:10px;">Belum Ada Pengemudi yang Ditugaskan Hari Ini</div>
        <div style="font-size:12px; color:var(--text-muted);">Buka tab Penugasan Driver untuk membagi muatan armada.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = loads.map(d => {
    const statusClass = d.capacity_status === 'ideal' ? 'ideal' : (d.capacity_status === 'under' ? 'under' : 'over');
    const statusText = d.capacity_status === 'ideal' ? 'Kapasitas Ideal (8-10 SJ)' : (d.capacity_status === 'under' ? 'Muatan Ringan' : 'Overload (>10 SJ)');
    const avatarInitials = d.driver_name.slice(0, 2).toUpperCase();

    return `
      <div class="driver-capacity-card">
        <div class="driver-card-top">
          <div class="driver-info-main">
            <div class="driver-avatar-sq">${avatarInitials}</div>
            <div>
              <div class="driver-meta-name">${escapeHtml(d.driver_name)}</div>
              <div class="driver-meta-vehicle">Armada: <strong>${escapeHtml(d.vehicle_type)}</strong></div>
            </div>
          </div>
          <span class="capacity-status-pill ${statusClass}">${statusText}</span>
        </div>

        <div class="capacity-meter-box">
          <div class="capacity-meter-labels">
            <span>Muatan: <strong>${d.sj_count} / ${d.target_capacity} SJ</strong></span>
            <span>${d.capacity_percentage}%</span>
          </div>
          <div class="capacity-bar-track">
            <div class="capacity-bar-fill ${statusClass}" style="width: ${d.capacity_percentage}%;"></div>
          </div>
        </div>

        <div class="driver-corridor-box">
          <div><strong>Rute & Koridor:</strong> ${escapeHtml(d.corridor)}</div>
          <div style="margin-top:4px; font-size:11px; color:var(--text-muted);">
            Total Berat: <strong>${d.total_weight_kg} kg</strong> • Total Points: <strong>${d.total_points}</strong>
          </div>
        </div>

        <div style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn btn-outline btn-sm btn-block" type="button" onclick="filterTodayByDriver('${escapeHtml(d.driver_name)}')">
            Lihat ${d.sj_count} SJ
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderTodayJalurs(jalurs) {
  const container = document.getElementById('today-routes-container');
  if (!container) return;

  if (jalurs.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:24px;">
        <div style="font-weight:700;">Belum Ada Rute Jalur Tersusun</div>
        <div style="font-size:12px; color:var(--text-muted);">Rute otomasi tersusun setelah driver ditugaskan pada jadwal kirim.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = jalurs.map(j => {
    const stopsList = (j.stops || []).map((st) => `
      <div class="today-waypoint-row">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="susunan-sj-badge">Stop ${st.seq}</span>
          <div>
            <div style="font-weight:700; font-size:13px;">${escapeHtml(st.customer_name)} <span style="font-size:11px; font-weight:400; color:#2563eb;">(${escapeHtml(st.sj_number)})</span></div>
            <div style="font-size:11px; color:var(--text-secondary);">${escapeHtml(st.address || 'Alamat Customer')}</div>
            ${st.notes ? `<div style="font-size:11px; color:#b45309; font-style:italic; margin-top:2px;">Catatan: ${escapeHtml(st.notes)}</div>` : ''}
          </div>
        </div>
        <div>
          <span class="sku-badge ${(st.muat_category || 'KECIL').toLowerCase()}">${st.muat_category || 'KECIL'}</span>
        </div>
      </div>
    `).join('');

    return `
      <div class="today-route-card">
        <div class="today-route-top">
          <div>
            <h4 style="margin:0; font-size:15px; font-weight:700; color:var(--text-primary);">${escapeHtml(j.name)}</h4>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
              Pengemudi: <strong>${escapeHtml(j.driver_name)}</strong> • Kendaraan: <strong>${escapeHtml(j.vehicle_type)}</strong>
            </div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="status-badge" style="background:#f1f5f9; color:#1e293b; font-size:11px;">
              ${j.sj_count} Surat Jalan
            </span>
            <span class="status-badge" style="background:#f1f5f9; color:#1e293b; font-size:11px;">
              Total Jarak: ${j.total_km} km (${j.est_hours})
            </span>
            <a href="${j.google_maps_url}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
              ${getSvgIcon('navigation', '', 14)}
              <span>Buka di Google Maps</span>
            </a>
          </div>
        </div>

        <div style="font-size:12px; font-weight:600; color:#475569; margin-bottom:8px;">
          📍 Urutan Pengiriman dari Gudang J40/J23:
        </div>
        <div class="today-waypoints-timeline">
          ${stopsList}
        </div>
      </div>
    `;
  }).join('');
}

function renderTodayShipmentsTable() {
  const tbody = document.getElementById('today-shipments-tbody');
  if (!tbody) return;

  const data = state.todayData;
  if (!data || !data.shipments || data.shipments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">Tidak ada pengiriman pada tanggal ini.</td></tr>`;
    return;
  }

  const query = state.todaySearch || '';
  const filtered = data.shipments.filter(s => {
    if (!query) return true;
    const matchSj = (s.sj_number || '').toLowerCase().includes(query);
    const matchPo = (s.po_number || '').toLowerCase().includes(query);
    const matchCust = (s.customer_name || '').toLowerCase().includes(query);
    const matchAddr = (s.destination_address || '').toLowerCase().includes(query);
    const matchDrv = (s.assigned_driver || '').toLowerCase().includes(query);
    const matchNotes = (s.notes || '').toLowerCase().includes(query);
    return matchSj || matchPo || matchCust || matchAddr || matchDrv || matchNotes;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">Tidak ada hasil untuk pencarian "${escapeHtml(query)}"</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((s, idx) => {
    const isPickup = isPickupShipment(s);
    let catBadges = '';
    if (s.notes) {
      const up = s.notes.toUpperCase();
      if (up.includes('KAWASAN BERIKAT') || up.includes('BC')) {
        catBadges += `<span class="spreadsheet-catatan-tag catatan-berikat">KAWASAN BERIKAT</span>`;
      }
      if (up.includes('LUNAS') || up.includes('INV LUNAS')) {
        catBadges += `<span class="spreadsheet-catatan-tag catatan-lunas">INV LUNAS</span>`;
      }
      if (up.includes('TUNGGU')) {
        catBadges += `<span class="spreadsheet-catatan-tag catatan-tunggu">TUNGGU KABEL</span>`;
      }
    }

    return `
      <tr>
        <td style="text-align:center; font-family:monospace; font-weight:700; color:#64748b;">${s.index_no || (idx + 1)}</td>
        <td>
          <span class="clickable-sj" onclick="openSjDetailModal('${escapeHtml(s.id)}')">${escapeHtml(s.sj_number)}</span>
          ${isPickup ? '<br><span class="badge-pickup">AMBIL DI J23</span>' : ''}
        </td>
        <td style="font-size:12px; font-family:monospace; font-weight:600;">${escapeHtml(s.po_number || '-')}</td>
        <td>
          <div style="font-weight:700;">${escapeHtml(s.customer_name)}</div>
          <div style="font-size:11px; color:var(--text-secondary); line-height:1.3;">${escapeHtml(s.destination_address || '-')}</div>
        </td>
        <td>
          ${catBadges}
          <div style="font-size:11px; color:#334155; margin-top:2px;">${escapeHtml(s.notes || '-')}</div>
        </td>
        <td>
          <div style="font-weight:700; font-size:13px;">${escapeHtml(s.assigned_driver || 'Belum Ditugaskan')}</div>
          <div style="font-size:11px; color:var(--text-secondary);">${escapeHtml(s.assigned_vehicle_type || s.required_vehicle_type || 'MOTOR')}</div>
        </td>
        <td style="text-align:center;">
          <span class="status-badge ${s.status.toLowerCase()}">${s.status}</span>
        </td>
        <td style="text-align:center;">
          <button class="btn btn-outline btn-sm" type="button" style="padding:3px 8px; font-size:11px;" onclick="openSjDetailModal('${escapeHtml(s.id)}')">
            Detail
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterTodayByDriver(driverName) {
  const searchInput = document.getElementById('today-search');
  if (searchInput) {
    searchInput.value = driverName;
    state.todaySearch = driverName.toLowerCase();
    renderTodayShipmentsTable();
  }
}

// ==============================================================
// MODUL: RIWAYAT SEMUA PENGIRIMAN (Format Ekspedisi Spreadsheet Manual)
// ==============================================================
function initHistoryModule() {
  const searchInput = document.getElementById('hist-search');
  const periodSelect = document.getElementById('hist-filter-period');
  const customBox = document.getElementById('hist-custom-date-box');
  const startDate = document.getElementById('hist-start-date');
  const endDate = document.getElementById('hist-end-date');
  const vehicleSelect = document.getElementById('hist-filter-vehicle');
  const driverSelect = document.getElementById('hist-filter-driver');
  const statusSelect = document.getElementById('hist-filter-status');
  const btnPrev = document.getElementById('hist-prev-page');
  const btnNext = document.getElementById('hist-next-page');
  const btnExport = document.getElementById('btn-export-excel-history');
  const btnPrint = document.getElementById('btn-print-history');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.histSearch = e.target.value;
      state.histPage = 1;
      loadShipmentHistory();
    });
  }

  if (periodSelect) {
    periodSelect.addEventListener('change', (e) => {
      state.histPeriod = e.target.value;
      if (customBox) {
        customBox.style.display = state.histPeriod === 'custom' ? 'flex' : 'none';
      }
      state.histPage = 1;
      loadShipmentHistory();
    });
  }

  if (startDate) {
    startDate.addEventListener('change', (e) => {
      state.histStartDate = e.target.value;
      if (state.histEndDate) {
        state.histPage = 1;
        loadShipmentHistory();
      }
    });
  }

  if (endDate) {
    endDate.addEventListener('change', (e) => {
      state.histEndDate = e.target.value;
      if (state.histStartDate) {
        state.histPage = 1;
        loadShipmentHistory();
      }
    });
  }

  if (vehicleSelect) {
    vehicleSelect.addEventListener('change', (e) => {
      state.histVehicle = e.target.value;
      state.histPage = 1;
      loadShipmentHistory();
    });
  }

  if (driverSelect) {
    driverSelect.addEventListener('change', (e) => {
      state.histDriver = e.target.value;
      state.histPage = 1;
      loadShipmentHistory();
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      state.histStatus = e.target.value;
      state.histPage = 1;
      loadShipmentHistory();
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (state.histPage > 1) {
        state.histPage--;
        loadShipmentHistory();
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      state.histPage++;
      loadShipmentHistory();
    });
  }

  if (btnExport) {
    btnExport.addEventListener('click', exportHistoryToCsv);
  }

  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  // Quick filter pills
  document.querySelectorAll('.hist-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.hist-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const veh = pill.getAttribute('data-filter-veh');
      if (veh === 'DELIVERED') {
        state.histStatus = 'DELIVERED';
        state.histVehicle = 'all';
      } else {
        state.histVehicle = veh;
        state.histStatus = 'all';
      }
      if (vehicleSelect) vehicleSelect.value = state.histVehicle;
      if (statusSelect) statusSelect.value = state.histStatus;
      state.histPage = 1;
      loadShipmentHistory();
    });
  });
}

async function loadShipmentHistory() {
  try {
    const params = new URLSearchParams({
      search: state.histSearch || '',
      period: state.histPeriod || 'all',
      vehicle: state.histVehicle || 'all',
      driver: state.histDriver || 'all',
      status: state.histStatus || 'all',
      page: state.histPage || 1,
      limit: state.histLimit || 50
    });

    if (state.histPeriod === 'custom' && state.histStartDate && state.histEndDate) {
      params.set('startDate', state.histStartDate);
      params.set('endDate', state.histEndDate);
    }

    const res = await fetch(`${API}/api/shipments/history?${params.toString()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Gagal memuat riwayat');

    renderShipmentHistory(json);
  } catch (err) {
    console.error('[Shipment History Error]:', err);
    showToast('Gagal memuat riwayat pengiriman: ' + err.message, 'error');
  }
}

function renderShipmentHistory(json) {
  const tbody = document.getElementById('hist-tbody');
  if (!tbody) return;

  const stats = json.stats || {};
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setEl('hist-stat-total', stats.total || 0);
  setEl('hist-stat-mobil', stats.mobil || 0);
  setEl('hist-stat-motor', stats.motor || 0);
  setEl('hist-stat-pickup', stats.pickup || 0);
  setEl('hist-stat-delivered', stats.delivered || 0);

  // Update drivers dropdown if empty
  const driverSel = document.getElementById('hist-filter-driver');
  if (driverSel && driverSel.options.length <= 1 && Array.isArray(state.users)) {
    const drivers = state.users.filter(u => u.role === 'DRIVER' || u.is_backup_driver);
    drivers.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.name;
      opt.textContent = `${d.name} (${d.department || 'Operasional'})`;
      driverSel.appendChild(opt);
    });
  }

  const rows = json.data || [];
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-muted);">Tidak ada riwayat pengiriman yang cocok dengan filter.</td></tr>`;
    return;
  }

  // Update banner text
  const dayBanner = document.getElementById('hist-day-banner');
  if (dayBanner && rows.length > 0 && rows[0].day_name) {
    dayBanner.textContent = `${rows[0].day_name} — REKAP PENGIRIMAN ATS`;
  }

  tbody.innerHTML = rows.map((r) => {
    let catBadges = '';
    if (r.notes) {
      const up = r.notes.toUpperCase();
      if (up.includes('KAWASAN BERIKAT') || up.includes('BC')) {
        catBadges += `<span class="spreadsheet-catatan-tag catatan-berikat">KAWASAN BERIKAT</span>`;
      }
      if (up.includes('LUNAS') || up.includes('INV LUNAS')) {
        catBadges += `<span class="spreadsheet-catatan-tag catatan-lunas">ADA INV LUNAS</span>`;
      }
      if (up.includes('TUNGGU')) {
        catBadges += `<span class="spreadsheet-catatan-tag catatan-tunggu">TUNGGU KABEL</span>`;
      }
    }

    return `
      <tr>
        <td class="spreadsheet-row-index">${r.index_no}</td>
        <td style="font-size:12px; font-weight:600; white-space:nowrap;">
          <div>${escapeHtml(r.plan_date_formatted || '-')}</div>
          <div style="font-size:10px; color:var(--text-muted);">${escapeHtml(r.day_name || '')}</div>
        </td>
        <td>
          <div style="font-weight:700; color:var(--text-primary);">${escapeHtml(r.customer_name)}</div>
        </td>
        <td style="text-align:center; font-weight:800; font-size:11px;">
          ${r.vehicle_display === 'MOBIL' ? '<span style="color:#b91c1c;">MOBIL</span>' : (r.vehicle_display === 'PICKUP J23' ? '<span style="color:#0284c7;">PICKUP J23</span>' : '<span style="color:#16a34a;">MOTOR</span>')}
        </td>
        <td style="font-family:monospace; font-weight:600; font-size:12px;">${escapeHtml(r.po_number || '-')}</td>
        <td>
          <span class="clickable-sj" onclick="openSjDetailModal('${escapeHtml(r.id)}')">${escapeHtml(r.sj_number)}</span>
        </td>
        <td>
          ${catBadges}
          <div style="font-size:11px; color:#1e293b; font-weight:500;">${escapeHtml(r.notes || r.destination_address || '-')}</div>
          ${r.destination_address && r.notes !== r.destination_address ? `<div style="font-size:10px; color:var(--text-muted); margin-top:2px;">📍 ${escapeHtml(r.destination_address)}</div>` : ''}
        </td>
        <td>
          <div style="font-weight:600; font-size:12px;">${escapeHtml(r.assigned_driver || '-')}</div>
        </td>
        <td style="text-align:center;">
          <span class="status-badge ${r.status.toLowerCase()}">${r.status}</span>
        </td>
        <td style="text-align:center;" class="no-print">
          <div style="display:flex; gap:4px; justify-content:center;">
            <button class="btn btn-outline btn-sm" type="button" style="padding:2px 6px; font-size:11px;" onclick="openSjDetailModal('${escapeHtml(r.id)}')" title="Lihat Rincian Item Produk">
              Rincian
            </button>
            <button class="btn btn-outline btn-sm" type="button" style="padding:2px 6px; font-size:11px;" onclick="openEditAddressModal('${escapeHtml(r.id)}')" title="Edit Alamat & Koordinat">
              📍
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Pagination info
  const pInfo = document.getElementById('hist-pagination-info');
  if (pInfo && json.pagination) {
    pInfo.textContent = `Menampilkan halaman ${json.pagination.page} dari ${json.pagination.totalPages || 1} (${json.pagination.total} Surat Jalan)`;
  }
  const curPage = document.getElementById('hist-current-page');
  if (curPage && json.pagination) curPage.textContent = json.pagination.page;
}

function exportHistoryToCsv() {
  fetch(`${API}/api/shipments/history?limit=1000`)
    .then(r => r.json())
    .then(res => {
      const rows = res.data || [];
      if (rows.length === 0) {
        showToast('Tidak ada data untuk diekspor', 'error');
        return;
      }

      let csv = '\uFEFF'; // UTF-8 BOM
      csv += 'No,Tanggal,Hari,Customer,Armada,No PO,No Surat Jalan,Catatan Khusus & Alamat,Driver,Status\n';

      rows.forEach(r => {
        const clean = (val) => `"${String(val || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        csv += [
          r.index_no,
          clean(r.plan_date_formatted),
          clean(r.day_name),
          clean(r.customer_name),
          clean(r.vehicle_display),
          clean(r.po_number),
          clean(r.sj_number),
          clean(r.notes || r.destination_address),
          clean(r.assigned_driver),
          clean(r.status)
        ].join(',') + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rekap_Pengiriman_ATS_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('File Excel/CSV berhasil diunduh!', 'success');
    })
    .catch(err => {
      showToast('Gagal ekspor Excel: ' + err.message, 'error');
    });
}

// ==============================================================
// MODUL: ITEM DI SJ TERJADWAL KIRIM (Fokus Kategori Tim Marketing/Gudang)
// ==============================================================
function initScheduledSkuModule() {
  const periodSel = document.getElementById('sku-scheduled-period');
  const btnRefresh = document.getElementById('btn-refresh-scheduled-sku');
  const searchInput = document.getElementById('sku-sch-search');
  const filterSize = document.getElementById('sku-sch-filter-size');
  const btnRecalc = document.getElementById('btn-recalc-all-muat');

  state.skuScheduledPeriod = 'upcoming';

  if (periodSel) {
    periodSel.value = 'upcoming';
    periodSel.addEventListener('change', (e) => {
      state.skuScheduledPeriod = e.target.value;
      loadScheduledSkuItems();
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadScheduledSkuItems();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.skuSchSearch = e.target.value.toLowerCase().trim();
      filterAndRenderScheduledSkus();
    });
  }

  if (filterSize) {
    filterSize.addEventListener('change', (e) => {
      state.skuSchFilterSize = e.target.value;
      filterAndRenderScheduledSkus();
    });
  }

  if (btnRecalc) {
    btnRecalc.addEventListener('click', async () => {
      try {
        btnRecalc.disabled = true;
        btnRecalc.textContent = 'Menghitung...';
        const res = await fetch(`${API}/api/shipments/recalculate-muat`, { method: 'POST' });
        const json = await res.json();
        showToast(json.message || 'Muatan semua Surat Jalan berhasil dihitung ulang!', 'success');
        loadScheduledSkuItems();
      } catch (err) {
        showToast('Gagal hitung ulang muatan: ' + err.message, 'error');
      } finally {
        btnRecalc.disabled = false;
        btnRecalc.textContent = 'Hitung Ulang Muatan Semua SJ';
      }
    });
  }
}

async function loadScheduledSkuItems() {
  try {
    const period = state.skuScheduledPeriod || 'upcoming';
    const res = await fetch(`${API}/api/items/scheduled?period=${period}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Gagal memuat item terjadwal');

    state.scheduledSkuRawData = json;
    filterAndRenderScheduledSkus();
  } catch (err) {
    console.error('[Scheduled SKU Error]:', err);
    showToast('Gagal memuat SKU terjadwal: ' + err.message, 'error');
  }
}

function filterAndRenderScheduledSkus() {
  const data = state.scheduledSkuRawData;
  if (!data) return;

  const q = state.skuSchSearch || '';
  const filterSize = state.skuSchFilterSize || '';

  let filtered = (data.items || []).slice();

  if (q) {
    filtered = filtered.filter(it => {
      const matchSku = (it.sku || '').toLowerCase().includes(q);
      const matchName = (it.name || '').toLowerCase().includes(q);
      const matchNotes = (it.category_notes || '').toLowerCase().includes(q);
      const matchSj = (it.sjs || []).some(s => 
        (s.sj_number || '').toLowerCase().includes(q) || 
        (s.customer_name || '').toLowerCase().includes(q)
      );
      return matchSku || matchName || matchNotes || matchSj;
    });
  }

  if (filterSize) {
    if (filterSize === 'UNCONFIRMED') {
      filtered = filtered.filter(it => !it.is_categorized);
    } else {
      filtered = filtered.filter(it => it.size_class === filterSize);
    }
  }

  renderScheduledSkuItems({
    ...data,
    items: filtered
  });
}

function renderScheduledSkuItems(data) {
  const tbody = document.getElementById('sku-scheduled-tbody');
  if (!tbody) return;

  const rawData = state.scheduledSkuRawData || data;
  const stats = rawData.stats || {};
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setEl('sku-sch-stat-total', stats.total_items || 0);
  setEl('sku-sch-stat-besar', stats.besar_count || 0);
  setEl('sku-sch-stat-sedang', stats.sedang_count || 0);
  setEl('sku-sch-stat-kecil', stats.kecil_count || 0);

  const sjCountEl = document.getElementById('sku-sch-stat-sj-count');
  if (sjCountEl) sjCountEl.textContent = `Dari ${rawData.scheduled_sj_count || 0} Surat Jalan`;

  const badgeEl = document.getElementById('badge-scheduled-items');
  if (badgeEl) badgeEl.textContent = stats.total_items || 0;

  const summaryEl = document.getElementById('sku-table-summary');
  if (summaryEl) {
    summaryEl.textContent = `Menampilkan ${data.items ? data.items.length : 0} dari ${stats.total_items || 0} SKU terjadwal`;
  }

  const items = data.items || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:36px; color:var(--text-muted); font-size:13px;">Tidak ada item pada jadwal kirim yang dipilih. Surat Jalan yang dijadwalkan marketing otomatis memuat SKU di sini.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((it, idx) => {
    const isKecil = it.size_class === 'KECIL';
    const isSedang = it.size_class === 'SEDANG';
    const isBesar = it.size_class === 'BESAR';

    const sjListHtml = (it.sjs || []).map(s => `
      <div style="font-size:11px; margin-bottom:3px; display:inline-block; margin-right:6px;">
        <span class="clickable-sj" onclick="openSjDetailModal('${escapeHtml(s.shipment_id)}')" style="font-weight:700; color:#2563eb; cursor:pointer;">${escapeHtml(s.sj_number)}</span>
        <span style="color:var(--text-muted);">(${escapeHtml(s.customer_name)}: <strong>${s.quantity}</strong> ${escapeHtml(s.unit_name || 'PCS')})</span>
      </div>
    `).join('');

    return `
      <tr>
        <td style="text-align:center; font-family:monospace; color:#64748b;">${idx + 1}</td>
        <td>
          <span style="font-family:monospace; font-weight:700; color:#2563eb; font-size:12px;">${escapeHtml(it.sku)}</span>
        </td>
        <td>
          <div style="font-weight:700; font-size:13px; color:var(--text-primary);">${escapeHtml(it.name)}</div>
          ${it.category_notes ? `<div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">Catatan: ${escapeHtml(it.category_notes)}</div>` : ''}
        </td>
        <td style="text-align:center; font-weight:700; font-size:13px;">
          ${it.total_qty} <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">${escapeHtml(it.unit_name || 'PCS')}</span>
        </td>
        <td>
          ${sjListHtml}
        </td>
        <td style="text-align:center;">
          <div style="display:inline-flex; gap:4px; background:#f1f5f9; padding:4px; border-radius:6px;">
            <button class="sku-pill-btn pill-kecil ${isKecil ? 'active' : ''}" type="button" onclick="quickSetSkuSize('${escapeHtml(it.master_id)}', '${escapeHtml(it.sku)}', 'KECIL', '${escapeHtml(it.name)}', '${escapeHtml(it.unit_name || 'PCS')}')" title="Muat Motor Reguler">
              Kecil (Motor)
            </button>
            <button class="sku-pill-btn pill-sedang ${isSedang ? 'active' : ''}" type="button" onclick="quickSetSkuSize('${escapeHtml(it.master_id)}', '${escapeHtml(it.sku)}', 'SEDANG', '${escapeHtml(it.name)}', '${escapeHtml(it.unit_name || 'PCS')}')" title="Sedang - Evaluasi kuantitas">
              Sedang
            </button>
            <button class="sku-pill-btn pill-besar ${isBesar ? 'active' : ''}" type="button" onclick="quickSetSkuSize('${escapeHtml(it.master_id)}', '${escapeHtml(it.sku)}', 'BESAR', '${escapeHtml(it.name)}', '${escapeHtml(it.unit_name || 'PCS')}')" title="Besar - Wajib Mobil Carry / Traga">
              Besar (Mobil)
            </button>
          </div>
        </td>
        <td style="text-align:center;">
          ${it.is_categorized ? '<span class="status-badge" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; font-size:11px;">Terkonfirmasi</span>' : '<span class="status-badge" style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; font-size:11px;">⚠️ Cek Ukuran</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

async function quickSetSkuSize(masterId, sku, newSize, name = '', unitName = 'PCS') {
  try {
    const res = await fetch(`${API}/api/items/${encodeURIComponent(masterId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        size_class: newSize, 
        sku, 
        name, 
        unit_name: unitName, 
        updated_by: state.currentUser?.name || 'Tim Gudang' 
      })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Gagal update kategori');

    showToast(`SKU ${sku} diubah menjadi ${newSize}! Rekomendasi armada Surat Jalan otomatis diperbarui.`, 'success');
    await loadScheduledSkuItems();
    if (state.activeTab === 'tab-hari-ini') {
      loadTodayDashboard(state.todayDate);
    }
  } catch (err) {
    console.error('[Quick Set SKU Error]:', err);
    showToast('Gagal update ukuran SKU: ' + err.message, 'error');
  }
}

window.filterTodayByDriver = filterTodayByDriver;
window.quickSetSkuSize = quickSetSkuSize;

// ==============================================================
// TAB: MASTER RUTE (Edit Arah & Area Tujuan Rute A, B, C, D, E, dst.)
// ==============================================================
async function loadMasterRoutes() {
  const tbody = document.getElementById('master-routes-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">Memuat daftar Master Rute...</td></tr>';
  }

  try {
    const res = await fetch(`${API}/api/master-routes`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Gagal memuat Master Rute');

    state.masterRoutes = json.data || [];
    renderMasterRoutes(state.masterRoutes);
  } catch (err) {
    console.error('[Load Master Routes Error]:', err);
    showToast('Gagal memuat master rute: ' + err.message, 'error');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#b91c1c;">Gagal memuat data: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

function renderMasterRoutes(routes) {
  const tbody = document.getElementById('master-routes-tbody');
  if (!tbody) return;

  if (routes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">
          Belum ada Master Rute yang tersimpan. Klik <strong>+ Tambah Rute Baru</strong> atau <strong>Reset Default (A - F)</strong>.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = routes.map((r, idx) => {
    const kwBadges = (r.keywords || '')
      .split(/[,;\n]+/)
      .map(k => k.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map(k => `<span class="status-pill draft" style="font-size:10px; padding:2px 6px; margin:2px 2px; display:inline-block; font-family:monospace;">${escapeHtml(k)}</span>`)
      .join('');

    const moreKw = (r.keywords || '').split(/[,;\n]+/).filter(Boolean).length > 8 ? '<span style="font-size:10px; color:#64748b;">+more</span>' : '';

    return `
      <tr>
        <td style="text-align:center;">
          <span class="badge" style="background:${r.color || '#2563eb'}; color:#ffffff; font-size:13px; font-weight:800; padding:6px 12px; border-radius:6px; display:inline-block; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
            ${escapeHtml(r.route_code)}
          </span>
          <div style="font-size:10px; color:#64748b; margin-top:4px;">Urutan #${r.sequence || (idx + 1)}</div>
        </td>
        <td>
          <div style="font-weight:700; font-size:14px; color:#0f172a;">${escapeHtml(r.route_name)}</div>
          <div style="font-size:12px; color:#475569; margin-top:2px;">${escapeHtml(r.title)}</div>
        </td>
        <td>
          <div style="font-weight:600; color:#1e293b; font-size:13px; line-height:1.4;">
            📍 ${escapeHtml(r.destination_area)}
          </div>
          ${r.description ? `<div style="font-size:11px; color:#64748b; margin-top:3px; font-style:italic;">${escapeHtml(r.description)}</div>` : ''}
        </td>
        <td>
          <div style="display:flex; flex-wrap:wrap; gap:2px; max-width:320px;">
            ${kwBadges} ${moreKw}
          </div>
        </td>
        <td style="text-align:center;">
          <span class="zone-badge" style="font-size:11px;">Zona ${escapeHtml(r.zone_code || '-')}</span>
        </td>
        <td style="text-align:center;">
          <span class="status-pill ${r.is_active ? 'siap' : 'draft'}" style="font-size:11px;">
            ${r.is_active ? 'Aktif' : 'Non-aktif'}
          </span>
        </td>
        <td style="text-align:center;">
          <div style="display:flex; gap:4px; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="btn btn-outline btn-xs" onclick="window.openEditMasterRouteModal('${r.id}')" title="Edit Arah & Aturan Rute" style="font-weight:600; color:#2563eb; border-color:#93c5fd;">
              ✏️ Edit
            </button>
            <button type="button" class="btn btn-outline btn-xs" onclick="window.deleteMasterRoute('${r.id}', '${escapeHtml(r.route_name)}')" title="Hapus Rute" style="color:#b91c1c; border-color:#fca5a5;">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.openAddMasterRouteModal = function() {
  const modal = document.getElementById('modal-master-route');
  if (!modal) return;

  document.getElementById('modal-master-route-title').textContent = 'Tambah Master Rute Baru';
  document.getElementById('modal-master-route-subtitle').textContent = 'Tentukan huruf rute, nama koridor, arah tujuan, dan kata kunci alamat';
  document.getElementById('route-form-mode').value = 'add';
  document.getElementById('route-form-id').value = '';

  document.getElementById('route-form-code').value = '';
  document.getElementById('route-form-code').disabled = false;
  document.getElementById('route-form-name').value = '';
  document.getElementById('route-form-title').value = '';
  document.getElementById('route-form-area').value = '';
  document.getElementById('route-form-keywords').value = '';
  document.getElementById('route-form-zone').value = 'A';
  document.getElementById('route-form-color').value = '#2563eb';
  document.getElementById('route-form-sequence').value = (state.masterRoutes?.length || 0) + 1;
  document.getElementById('route-form-active').checked = true;
  document.getElementById('route-form-desc').value = '';

  const previewBadge = document.getElementById('route-form-color-preview');
  if (previewBadge) {
    previewBadge.style.background = '#2563eb';
    previewBadge.textContent = 'Preview Rute';
  }

  openModal(modal);
};

window.openEditMasterRouteModal = function(routeId) {
  const modal = document.getElementById('modal-master-route');
  if (!modal) return;

  const r = (state.masterRoutes || []).find(item => item.id === routeId);
  if (!r) {
    showToast('Data rute tidak ditemukan', 'error');
    return;
  }

  document.getElementById('modal-master-route-title').textContent = `Edit ${r.route_name}`;
  document.getElementById('modal-master-route-subtitle').textContent = `Ubah arah tujuan ke mana rute ini berjalan, kata kunci wilayah, atau zona`;
  document.getElementById('route-form-mode').value = 'edit';
  document.getElementById('route-form-id').value = r.id;

  const codeInput = document.getElementById('route-form-code');
  codeInput.value = r.route_code;
  codeInput.disabled = false;

  document.getElementById('route-form-name').value = r.route_name;
  document.getElementById('route-form-title').value = r.title;
  document.getElementById('route-form-area').value = r.destination_area;
  document.getElementById('route-form-keywords').value = r.keywords;
  document.getElementById('route-form-zone').value = r.zone_code || 'A';
  document.getElementById('route-form-color').value = r.color || '#2563eb';
  document.getElementById('route-form-sequence').value = r.sequence || 1;
  document.getElementById('route-form-active').checked = Boolean(r.is_active);
  document.getElementById('route-form-desc').value = r.description || '';

  const previewBadge = document.getElementById('route-form-color-preview');
  if (previewBadge) {
    previewBadge.style.background = r.color || '#2563eb';
    previewBadge.textContent = r.route_name || `Rute ${r.route_code}`;
  }

  openModal(modal);
};

window.openEditRouteByCode = function(code) {
  if (!code) return;
  const cleanCode = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const match = (state.masterRoutes || []).find(r => r.route_code.toUpperCase() === cleanCode || r.id === `route-${cleanCode}`);
  if (match) {
    window.openEditMasterRouteModal(match.id);
  } else {
    loadMasterRoutes().then(() => {
      const found = (state.masterRoutes || []).find(r => r.route_code.toUpperCase() === cleanCode || r.id === `route-${cleanCode}`);
      if (found) window.openEditMasterRouteModal(found.id);
      else window.openAddMasterRouteModal();
    });
  }
};

window.deleteMasterRoute = async function(id, name) {
  if (!confirm(`Apakah Anda yakin ingin menghapus Master ${name}?\n\nSurat Jalan yang ada akan otomatis dikelompokkan ke rute lain.`)) {
    return;
  }

  try {
    const res = await fetch(`${API}/api/master-routes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Gagal menghapus rute');

    showToast(`✅ ${name} berhasil dihapus!`, 'success');
    await loadMasterRoutes();
    if (state.activeTab === 'tab-otomasi-rute') {
      loadJalurOverview();
    }
  } catch (err) {
    console.error('[Delete Route Error]:', err);
    showToast('Gagal menghapus rute: ' + err.message, 'error');
  }
};

window.resetDefaultRoutes = async function() {
  if (!confirm('Apakah Anda yakin ingin mereset Master Rute kembali ke standar default ATS (Rute A s/d F)?\n\nPerubahan rute kustom Anda akan diatur ulang.')) {
    return;
  }

  try {
    const res = await fetch(`${API}/api/master-routes/reset-default`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Gagal mereset rute');

    showToast('✅ Master Rute berhasil di-reset ke standar default!', 'success');
    await loadMasterRoutes();
    if (state.activeTab === 'tab-otomasi-rute') {
      loadJalurOverview();
    }
  } catch (err) {
    console.error('[Reset Routes Error]:', err);
    showToast('Gagal reset rute: ' + err.message, 'error');
  }
};

function initMasterRouteEvents() {
  const btnAdd = document.getElementById('btn-add-new-master-route');
  const btnRefresh = document.getElementById('btn-refresh-master-routes');
  const btnReset = document.getElementById('btn-reset-default-routes');
  const btnCloseModal = document.getElementById('btn-close-master-route-modal');
  const btnCancelModal = document.getElementById('btn-cancel-master-route-modal');
  const form = document.getElementById('form-master-route');
  const colorInput = document.getElementById('route-form-color');
  const codeInput = document.getElementById('route-form-code');
  const nameInput = document.getElementById('route-form-name');

  if (btnAdd) btnAdd.onclick = () => window.openAddMasterRouteModal();
  if (btnRefresh) btnRefresh.onclick = () => loadMasterRoutes();
  if (btnReset) btnReset.onclick = () => window.resetDefaultRoutes();

  [btnCloseModal, btnCancelModal].forEach(b => {
    if (b) b.onclick = () => closeModal(document.getElementById('modal-master-route'));
  });

  if (colorInput) {
    colorInput.addEventListener('input', (e) => {
      const preview = document.getElementById('route-form-color-preview');
      if (preview) preview.style.background = e.target.value;
    });
  }

  if (codeInput && nameInput) {
    codeInput.addEventListener('input', (e) => {
      const mode = document.getElementById('route-form-mode')?.value;
      if (mode === 'add' && (!nameInput.value || nameInput.value.startsWith('Rute '))) {
        nameInput.value = `Rute ${e.target.value.toUpperCase()}`;
      }
    });
  }

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const mode = document.getElementById('route-form-mode').value;
      const id = document.getElementById('route-form-id').value;
      const routeCode = document.getElementById('route-form-code').value.toUpperCase().trim();
      const routeName = document.getElementById('route-form-name').value.trim();
      const title = document.getElementById('route-form-title').value.trim();
      const destinationArea = document.getElementById('route-form-area').value.trim();
      const keywords = document.getElementById('route-form-keywords').value.trim();
      const zoneCode = document.getElementById('route-form-zone').value.trim();
      const color = document.getElementById('route-form-color').value;
      const sequence = parseInt(document.getElementById('route-form-sequence').value, 10) || 1;
      const isActive = document.getElementById('route-form-active').checked;
      const description = document.getElementById('route-form-desc').value.trim();

      const btnSave = document.getElementById('btn-save-master-route');
      if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = '⏳ Menyimpan...';
      }

      try {
        const url = mode === 'edit' ? `${API}/api/master-routes/${encodeURIComponent(id)}` : `${API}/api/master-routes`;
        const method = mode === 'edit' ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route_code: routeCode,
            route_name: routeName,
            title,
            destination_area: destinationArea,
            keywords,
            zone_code: zoneCode,
            color,
            sequence,
            is_active: isActive,
            description
          })
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Gagal menyimpan Master Rute');

        showToast(`✅ ${json.message || 'Master Rute berhasil disimpan!'}`, 'success');
        closeModal(document.getElementById('modal-master-route'));
        await loadMasterRoutes();

        // Also refresh optimization view if active
        if (state.activeTab === 'tab-otomasi-rute') {
          loadJalurOverview();
        }
      } catch (err) {
        console.error('[Save Route Error]:', err);
        showToast('Gagal menyimpan rute: ' + err.message, 'error');
      } finally {
        if (btnSave) {
          btnSave.disabled = false;
          btnSave.textContent = 'Simpan Rute';
        }
      }
    };
  }
}

window.loadMasterRoutes = loadMasterRoutes;



