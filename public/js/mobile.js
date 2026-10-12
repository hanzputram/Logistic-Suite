/**
 * ATS Logistics Suite — Mobile Field Delivery Logic
 * Zero-Friction Field Form • Instant Pre-fill • Strict Rejection Reason Validation
 */

const API = '';

// Application State
const mobileState = {
  driver: 'all',
  date: 'all',
  status: 'ALL',
  searchQuery: '',
  shipments: [],
  selectedShipment: null,
  deliveryResult: 'APPROVED', // 'APPROVED' | 'REJECTED' | 'IN_TRANSIT'
  statusStep: 'DELIVERED', // 'DELIVERED' | 'ARRIVED' | 'IN_TRANSIT'
  rejectionReason: '',
  signatureCanvas: null,
  signatureCtx: null,
  isDrawing: false,
  hasSignature: false,
  driversList: []
};

// Web Audio API tactile feedback
function playChime(type = 'success') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
      osc.frequency.setValueAtTime(164.81, ctx.currentTime + 0.15); // E3
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {
    // Audio context not allowed or supported
  }
}

// Toast notification
function showMobileToast(msg, type = 'info', duration = 3000) {
  const toast = document.getElementById('mobile-toast');
  if (!toast) return;

  toast.textContent = msg;
  toast.className = `mobile-toast ${type} visible`;

  if (window.toastTimer) clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
    toast.className = 'mobile-toast';
  }, duration);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initDrivers();
  initSignaturePad();
  initEventListeners();
  loadMobileShipments();
});

// Fetch active drivers
async function initDrivers() {
  try {
    const res = await fetch(`${API}/api/mobile/drivers`);
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      mobileState.driversList = data.data;
      const select = document.getElementById('driver-select');
      if (select) {
        select.innerHTML = '<option value="all">Semua Driver Armada</option>';
        data.data.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.name;
          opt.textContent = `Driver: ${d.name} (${d.role === 'DRIVER' ? 'Utama' : 'Backup'})`;
          select.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.error('Gagal memuat daftar driver:', err);
  }
}

// Load shipments from server
async function loadMobileShipments() {
  const container = document.getElementById('deliveries-list');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center; padding: 40px 20px; color: var(--text-muted);">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s infinite linear;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      <div style="margin-top: 10px; font-weight:600; font-size:13px;">Memuat jadwal pengiriman...</div>
    </div>
  `;

  try {
    const params = new URLSearchParams();
    if (mobileState.driver && mobileState.driver !== 'all') params.append('driver', mobileState.driver);
    if (mobileState.date && mobileState.date !== 'all') params.append('date', mobileState.date);
    if (mobileState.status && mobileState.status !== 'ALL') params.append('status', mobileState.status);
    if (mobileState.searchQuery) params.append('q', mobileState.searchQuery);

    const res = await fetch(`${API}/api/mobile/shipments?${params.toString()}`);
    const data = await res.json();

    if (data.success) {
      mobileState.shipments = data.data || [];
      updateTabCounters(data.stats);
      renderShipmentsList(mobileState.shipments);
      populateShipmentDropdown(mobileState.shipments);
    } else {
      container.innerHTML = `<div style="padding:30px; text-align:center; color:var(--danger);">${data.message || 'Gagal memuat data'}</div>`;
    }
  } catch (err) {
    console.error('Fetch error:', err);
    container.innerHTML = `<div style="padding:30px; text-align:center; color:var(--danger);">Koneksi terputus ke server.</div>`;
  }
}

// Update counters in tabs
function updateTabCounters(stats) {
  if (!stats) return;
  const cAll = document.getElementById('count-all');
  const cPending = document.getElementById('count-pending');
  const cDelivered = document.getElementById('count-delivered');
  const cRejected = document.getElementById('count-rejected');

  if (cAll) cAll.textContent = stats.allTotal || stats.total || 0;
  if (cPending) cPending.textContent = stats.pending || 0;
  if (cDelivered) cDelivered.textContent = stats.delivered || 0;
  if (cRejected) cRejected.textContent = stats.failed || 0;
}

// Populate modal shipment selector for quick switching
function populateShipmentDropdown(list) {
  const sel = document.getElementById('modal-shipment-select');
  if (!sel) return;

  sel.innerHTML = '';
  if (list.length === 0) {
    sel.innerHTML = '<option value="">Tidak ada surat jalan aktif</option>';
    return;
  }

  list.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    const statLabel = s.status === 'DELIVERED' ? ' [✓ Selesai]' : (s.status === 'FAILED' ? ' [✗ Ditolak]' : '');
    opt.textContent = `${s.sj_number} — ${s.customer_name}${statLabel}`;
    sel.appendChild(opt);
  });
}

// Render delivery cards
function renderShipmentsList(list) {
  const container = document.getElementById('deliveries-list');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="background:var(--bg-card); border-radius:var(--radius-md); padding:40px 20px; text-align:center; border: 1.5px dashed var(--border-color); margin-top:10px;">
        <div style="font-size:36px; margin-bottom:8px;">📦</div>
        <div style="font-weight:700; font-size:15px; color:var(--text-main);">Tidak Ada Pengiriman</div>
        <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Tidak ditemukan Surat Jalan dengan filter yang dipilih.</div>
        <button class="btn-card-util" onclick="resetFilters()" style="margin:16px auto 0 auto;">Reset Filter</button>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  list.forEach((s, idx) => {
    const card = document.createElement('div');
    const isDelivered = s.status === 'DELIVERED';
    const isRejected = s.status === 'FAILED' || s.delivery_result === 'REJECTED';
    const isTransit = s.status === 'IN_TRANSIT';

    let cardStatusClass = 'status-pending';
    let badgePill = '<span class="status-badge-pill pending">⏳ Perlu Kirim</span>';

    if (isDelivered) {
      cardStatusClass = 'status-delivered';
      badgePill = '<span class="status-badge-pill delivered">✅ Disetujui / Selesai</span>';
    } else if (isRejected) {
      cardStatusClass = 'status-rejected';
      badgePill = '<span class="status-badge-pill rejected">❌ Ditolak</span>';
    } else if (isTransit) {
      cardStatusClass = 'status-in-transit';
      badgePill = '<span class="status-badge-pill transit">🚚 Dalam Jalan</span>';
    }

    const driverName = s.assigned_driver || 'Belum Ditugaskan';
    const zoneCode = s.zone_code || s.assigned_route || 'FR';
    const gmapsNavDest = (s.destination_lat && s.destination_lng)
      ? `${s.destination_lat},${s.destination_lng}`
      : encodeURIComponent(s.destination_address || s.customer_name);

    card.className = `delivery-card ${cardStatusClass}`;
    card.setAttribute('data-id', s.id);

    card.innerHTML = `
      <div class="card-header-row">
        <div class="card-sj-group">
          <span class="sj-badge">${escapeHtml(s.sj_number)}</span>
          <span class="zone-badge">Zona ${escapeHtml(zoneCode)}</span>
          ${s.po_number ? `<span style="font-size:11px; color:#64748b; font-weight:600;">PO: ${escapeHtml(s.po_number)}</span>` : ''}
        </div>
        ${badgePill}
      </div>

      <div class="card-customer-name">${escapeHtml(s.customer_name || 'Customer')}</div>

      <div class="card-address-box">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>${escapeHtml(s.destination_address || 'Alamat Belum Diatur')}</span>
      </div>

      <div class="card-items-preview">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <strong>${s.item_count || 1} Item:</strong> ${escapeHtml(s.items_summary || 'Barang Standar')}
        </span>
      </div>

      <!-- KOTAK NAMA PENERIMA / STATUS SERAH TERIMA -->
      ${isDelivered ? `
        <div class="card-receiver-box delivered">
          <div style="display:flex; align-items:center; gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span><strong>Penerima:</strong> ${escapeHtml(s.received_by || s.customer_name)}</span>
          </div>
          <span style="font-size:11px; font-weight:700; color:var(--success-dark);">${s.received_at ? new Date(s.received_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Diterima'}</span>
        </div>
      ` : (isRejected ? `
        <div class="card-receiver-box rejected">
          <div style="display:flex; align-items:center; gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span><strong>Ditolak oleh:</strong> ${escapeHtml(s.received_by || s.customer_name || 'Customer')}</span>
          </div>
          <span style="font-size:11px; font-weight:700; color:var(--danger);">Gagal</span>
        </div>
      ` : `
        <div class="card-receiver-box pending">
          <div style="display:flex; align-items:center; gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span><strong>Target Penerima:</strong> ${escapeHtml(s.customer_name)}</span>
          </div>
          <span style="font-size:11px; color:#64748b; font-weight:600;">Menunggu</span>
        </div>
      `)}

      ${isRejected && s.rejection_reason ? `
        <div class="card-rejection-alert">
          <strong>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            Alasan Ditolak:
          </strong>
          <div>${escapeHtml(s.rejection_reason)}</div>
        </div>
      ` : ''}

      <div class="card-actions-row">
        <a href="https://www.google.com/maps/dir/?api=1&destination=${gmapsNavDest}" target="_blank" class="btn-card-util" title="Navigasi Google Maps">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          Maps
        </a>

        <button type="button" class="btn-card-action-primary" onclick="openUpdateModal('${s.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          ${isDelivered ? 'Ubah Penerima/Status' : (isRejected ? 'Tinjau Penolakan' : 'Update Status Lapangan')}
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

// Reset all search and filters
function resetFilters() {
  mobileState.searchQuery = '';
  mobileState.status = 'ALL';
  mobileState.driver = 'all';
  mobileState.date = 'all';

  const sField = document.getElementById('search-field');
  if (sField) sField.value = '';

  const drvSelect = document.getElementById('driver-select');
  if (drvSelect) drvSelect.value = 'all';

  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.getAttribute('data-status') === 'ALL');
  });

  document.querySelectorAll('.date-btn-tag').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-date') === 'all');
  });

  loadMobileShipments();
}

// Open the Update Modal with Pre-filled data
window.openUpdateModal = function(shipmentId) {
  const shipment = mobileState.shipments.find(s => s.id === shipmentId) || mobileState.shipments[0];
  if (!shipment) {
    showMobileToast('Pilih Surat Jalan terlebih dahulu', 'error');
    return;
  }

  mobileState.selectedShipment = shipment;

  // Set selected in dropdown
  const sel = document.getElementById('modal-shipment-select');
  if (sel) sel.value = shipment.id;

  // Render prefilled summary box
  renderPrefilledBox(shipment);

  // Pre-fill Nama Penerima
  const recInput = document.getElementById('input-receiver-name');
  if (recInput) {
    recInput.value = shipment.received_by || shipment.customer_name || '';
  }

  const rejInput = document.getElementById('input-rejector-name');
  if (rejInput) {
    rejInput.value = (shipment.status === 'FAILED' ? shipment.received_by : '') || '';
  }

  // Set default decision
  if (shipment.status === 'FAILED' || shipment.delivery_result === 'REJECTED') {
    setDeliveryResult('REJECTED');
    if (shipment.rejection_reason) {
      setRejectionReasonText(shipment.rejection_reason);
    }
  } else {
    setDeliveryResult('APPROVED');
  }

  // Clear signature canvas
  clearSignature();

  // Open backdrop
  const modal = document.getElementById('update-modal-backdrop');
  if (modal) modal.classList.add('open');
};

// Render pre-filled shipment info box
function renderPrefilledBox(s) {
  const box = document.getElementById('prefilled-summary-box');
  if (!box) return;

  const currentReceiver = s.received_by || s.customer_name || 'Customer di Lokasi';

  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span class="sj-badge" style="font-size:14px;">${escapeHtml(s.sj_number)}</span>
      <span class="zone-badge">Zona ${escapeHtml(s.zone_code || 'A')}</span>
    </div>
    <div class="prefilled-dest-name">${escapeHtml(s.customer_name || 'Customer')}</div>
    <div class="prefilled-address">${escapeHtml(s.destination_address || '-')}</div>
    <div style="font-size:12.5px; color:#1e3a8a; font-weight:700; background:#dbeafe; padding:4px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:5px; margin-top:2px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span>Penerima: <strong>${escapeHtml(currentReceiver)}</strong></span>
    </div>
    <div class="prefilled-tags">
      <span class="prefilled-tag">Driver: ${escapeHtml(s.assigned_driver || 'Armada ATS')}</span>
      <span class="prefilled-tag">Kendaraan: ${escapeHtml(s.assigned_vehicle_type || 'MOTOR')}</span>
      <span class="prefilled-tag">${s.item_count || 1} SKU (${s.total_weight_kg || 0} kg)</span>
    </div>
  `;
}

// Close Modal
function closeUpdateModal() {
  const modal = document.getElementById('update-modal-backdrop');
  if (modal) modal.classList.remove('open');
}

// Set Decision: APPROVED or REJECTED
function setDeliveryResult(result) {
  mobileState.deliveryResult = result;

  const btnApprove = document.getElementById('btn-decision-approve');
  const btnReject = document.getElementById('btn-decision-reject');
  const formApproved = document.getElementById('subform-approved');
  const formRejected = document.getElementById('subform-rejected');
  const submitBtn = document.getElementById('btn-submit-field-action');

  if (result === 'APPROVED') {
    btnApprove?.classList.add('active');
    btnReject?.classList.remove('active');
    if (formApproved) formApproved.style.display = 'flex';
    if (formRejected) formRejected.style.display = 'none';

    if (submitBtn) {
      submitBtn.className = 'btn-submit-field';
      submitBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        SIMPAN: PENGIRIMAN DISETUJUI
      `;
    }
  } else if (result === 'REJECTED') {
    btnApprove?.classList.remove('active');
    btnReject?.classList.add('active');
    if (formApproved) formApproved.style.display = 'none';
    if (formRejected) formRejected.style.display = 'flex';

    if (submitBtn) {
      submitBtn.className = 'btn-submit-field rejected-theme';
      submitBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        SIMPAN: PENGIRIMAN DITOLAK
      `;
    }
  }
}

// Set Quick Rejection Reason Text
function setRejectionReasonText(reason) {
  mobileState.rejectionReason = reason;
  const textarea = document.getElementById('textarea-rejection-reason');
  if (textarea) {
    textarea.value = reason;
    textarea.classList.remove('error-highlight');
  }

  // Highlight active chip
  document.querySelectorAll('.rejection-chip-item').forEach(chip => {
    chip.classList.toggle('active', chip.getAttribute('data-reason') === reason);
  });
}

// Submit field delivery update
async function submitFieldDelivery() {
  if (!mobileState.selectedShipment) {
    showMobileToast('Pilih Surat Jalan terlebih dahulu', 'error');
    return;
  }

  const shipmentId = mobileState.selectedShipment.id;
  const result = mobileState.deliveryResult; // 'APPROVED' or 'REJECTED'

  // VALIDASI MUTLAK: JIKA DITOLAK HARUS MENGISI ALASAN DITOLAK!
  if (result === 'REJECTED') {
    const textarea = document.getElementById('textarea-rejection-reason');
    const reasonVal = (textarea?.value || mobileState.rejectionReason || '').trim();

    if (!reasonVal) {
      playChime('error');
      showMobileToast('⚠️ Alasan penolakan WAJIB diisi jika pengiriman ditolak!', 'error', 4500);

      if (textarea) {
        textarea.classList.add('error-highlight');
        textarea.focus();
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    mobileState.rejectionReason = reasonVal;
  }

  // Gather form values
  const receiverNameInput = document.getElementById('input-receiver-name');
  const receiverPhoneInput = document.getElementById('input-receiver-phone');
  const notesInput = document.getElementById('input-delivery-notes');

  let receiverName = '';
  if (result === 'APPROVED') {
    receiverName = receiverNameInput?.value?.trim() || mobileState.selectedShipment.customer_name || '';
    if (!receiverName) {
      playChime('error');
      showMobileToast('⚠️ Nama Penerima wajib diisi saat pengiriman disetujui!', 'error', 4000);
      receiverNameInput?.focus();
      return;
    }
  } else if (result === 'REJECTED') {
    const rejInput = document.getElementById('input-rejector-name');
    receiverName = rejInput?.value?.trim() || '';
  }

  const receiverPhone = receiverPhoneInput?.value?.trim() || '';
  const notes = notesInput?.value?.trim() || '';

  // Export signature if drawn
  let signatureUrl = null;
  if (mobileState.hasSignature && mobileState.signatureCanvas) {
    signatureUrl = mobileState.signatureCanvas.toDataURL('image/png');
  }

  const payload = {
    deliveryResult: result,
    rejectionReason: result === 'REJECTED' ? mobileState.rejectionReason : null,
    receiverName,
    receiverPhone,
    notes,
    signatureUrl,
    updatedBy: mobileState.driver !== 'all' ? mobileState.driver : 'Driver Lapangan'
  };

  const submitBtn = document.getElementById('btn-submit-field-action');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s infinite linear;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      Menyimpan Data Lapangan...
    `;
  }

  try {
    const res = await fetch(`${API}/api/mobile/shipments/${shipmentId}/update-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success) {
      playChime('success');
      showMobileToast(data.message || 'Status berhasil disimpan!', 'success', 3500);
      closeUpdateModal();

      // Refresh list immediately
      await loadMobileShipments();
    } else {
      playChime('error');
      showMobileToast(data.message || 'Gagal menyimpan status.', 'error', 4500);
    }
  } catch (err) {
    console.error('Submit error:', err);
    playChime('error');
    showMobileToast('Gagal terhubung ke server', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      setDeliveryResult(mobileState.deliveryResult);
    }
  }
}

// Digital Signature Canvas
function initSignaturePad() {
  const canvas = document.getElementById('signature-canvas');
  if (!canvas) return;

  mobileState.signatureCanvas = canvas;
  const ctx = canvas.getContext('2d');
  mobileState.signatureCtx = ctx;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function startDrawing(e) {
    mobileState.isDrawing = true;
    mobileState.hasSignature = true;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    e.preventDefault();
  }

  function draw(e) {
    if (!mobileState.isDrawing) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    e.preventDefault();
  }

  function stopDrawing() {
    mobileState.isDrawing = false;
  }

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);

  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);
}

function clearSignature() {
  if (mobileState.signatureCtx && mobileState.signatureCanvas) {
    const rect = mobileState.signatureCanvas.getBoundingClientRect();
    mobileState.signatureCtx.clearRect(0, 0, rect.width, rect.height);
    mobileState.hasSignature = false;
  }
}

// Event Listeners setup
function initEventListeners() {
  // Driver switcher
  const drvSelect = document.getElementById('driver-select');
  if (drvSelect) {
    drvSelect.addEventListener('change', (e) => {
      mobileState.driver = e.target.value;
      loadMobileShipments();
    });
  }

  // Date buttons
  document.querySelectorAll('.date-btn-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.date-btn-tag').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mobileState.date = btn.getAttribute('data-date');
      loadMobileShipments();
    });
  });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      mobileState.status = chip.getAttribute('data-status');
      loadMobileShipments();
    });
  });

  // Search input
  const searchField = document.getElementById('search-field');
  const searchClear = document.getElementById('search-clear-btn');
  if (searchField) {
    searchField.addEventListener('input', (e) => {
      mobileState.searchQuery = e.target.value.trim();
      if (searchClear) searchClear.classList.toggle('active', !!mobileState.searchQuery);
      if (window.searchDebounce) clearTimeout(window.searchDebounce);
      window.searchDebounce = setTimeout(() => {
        loadMobileShipments();
      }, 300);
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchField) searchField.value = '';
      mobileState.searchQuery = '';
      searchClear.classList.remove('active');
      loadMobileShipments();
    });
  }

  // Decision buttons
  const btnApprove = document.getElementById('btn-decision-approve');
  const btnReject = document.getElementById('btn-decision-reject');
  if (btnApprove) btnApprove.addEventListener('click', () => setDeliveryResult('APPROVED'));
  if (btnReject) btnReject.addEventListener('click', () => setDeliveryResult('REJECTED'));

  // Quick receiver chips
  document.querySelectorAll('.receiver-chip-tag[data-receiver]').forEach(chip => {
    chip.addEventListener('click', () => {
      const rec = chip.getAttribute('data-receiver');
      const input = document.getElementById('input-receiver-name');
      if (input && mobileState.selectedShipment) {
        if (rec === 'Customer Sendiri') {
          input.value = mobileState.selectedShipment.customer_name;
        } else {
          input.value = `${rec} (${mobileState.selectedShipment.customer_name})`;
        }
      }
      document.querySelectorAll('.receiver-chip-tag[data-receiver]').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });

  // Quick rejector chips
  document.querySelectorAll('.receiver-chip-tag[data-rejector]').forEach(chip => {
    chip.addEventListener('click', () => {
      const rej = chip.getAttribute('data-rejector');
      const input = document.getElementById('input-rejector-name');
      if (input && mobileState.selectedShipment) {
        if (rej === 'Customer Sendiri') {
          input.value = mobileState.selectedShipment.customer_name;
        } else if (rej === 'Tidak Ada Orang') {
          input.value = 'Tidak Ada Orang (Tutup)';
        } else {
          input.value = `${rej} - ${mobileState.selectedShipment.customer_name}`;
        }
      }
      document.querySelectorAll('.receiver-chip-tag[data-rejector]').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });

  // Rejection chips
  document.querySelectorAll('.rejection-chip-item').forEach(chip => {
    chip.addEventListener('click', () => {
      const reason = chip.getAttribute('data-reason');
      setRejectionReasonText(reason);
    });
  });

  // Textarea input clears error
  const textarea = document.getElementById('textarea-rejection-reason');
  if (textarea) {
    textarea.addEventListener('input', () => {
      mobileState.rejectionReason = textarea.value;
      if (textarea.value.trim()) {
        textarea.classList.remove('error-highlight');
      }
    });
  }

  // Modal dropdown change
  const modalSel = document.getElementById('modal-shipment-select');
  if (modalSel) {
    modalSel.addEventListener('change', (e) => {
      const s = mobileState.shipments.find(x => x.id === e.target.value);
      if (s) {
        mobileState.selectedShipment = s;
        renderPrefilledBox(s);
        const recInput = document.getElementById('input-receiver-name');
        if (recInput) recInput.value = s.customer_name || '';
      }
    });
  }

  // Clear signature button
  const clearBtn = document.getElementById('btn-clear-signature');
  if (clearBtn) clearBtn.addEventListener('click', clearSignature);

  // Submit button
  const submitBtn = document.getElementById('btn-submit-field-action');
  if (submitBtn) submitBtn.addEventListener('click', submitFieldDelivery);

  // Close modal buttons
  const closeSheetBtn = document.getElementById('btn-close-sheet');
  const backdrop = document.getElementById('update-modal-backdrop');
  if (closeSheetBtn) closeSheetBtn.addEventListener('click', closeUpdateModal);
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeUpdateModal();
    });
  }

  // FAB button
  const fab = document.getElementById('btn-fab-new-update');
  if (fab) {
    fab.addEventListener('click', () => {
      if (mobileState.shipments.length > 0) {
        openUpdateModal(mobileState.shipments[0].id);
      } else {
        showMobileToast('Tidak ada Surat Jalan tersedia', 'info');
      }
    });
  }
}

// Utility: escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
