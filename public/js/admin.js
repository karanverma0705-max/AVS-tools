/**
 * AVS TOOLS - Dedicated Admin Dashboard Application
 * Manages SQLite database CRUD operations and B2B workflow
 */

const adminState = {
  token: localStorage.getItem('avs_admin_token'),
  user: JSON.parse(localStorage.getItem('avs_admin_user') || 'null'),
  products: [],
  categories: [],
  quotes: [],
  inquiries: [],
  reviews: [],
  activeTab: 'tab-overview'
};

// ============================================================================
// Initialization & Authentication Verification
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await verifyAuthentication();
  setupSidebarNavigation();
  setupTopbar();
  setupForms();
  await loadAllAdminData();
});

async function verifyAuthentication() {
  const authGate = document.getElementById('authGate');
  const adminWrapper = document.getElementById('adminWrapper');

  if (!adminState.token) {
    window.location.href = '/login';
    return;
  }

  try {
    const res = await fetch('/api/admin/verify', {
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });
    const data = await res.json();

    if (!res.ok || !data.authenticated) {
      localStorage.removeItem('avs_admin_token');
      localStorage.removeItem('avs_admin_user');
      window.location.href = '/login';
      return;
    }

    // Success
    adminState.user = data.admin;
    const nameEl = document.getElementById('adminUserName');
    if (nameEl) nameEl.textContent = data.admin.name || 'AVS Administrator';

    authGate.style.display = 'none';
    adminWrapper.style.display = 'flex';
  } catch (err) {
    console.error('Auth verification error:', err);
    window.location.href = '/login';
  }
}

// ============================================================================
// Navigation & Topbar
// ============================================================================
function setupSidebarNavigation() {
  const links = document.querySelectorAll('.sidebar-link');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = link.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Logout button
  document.getElementById('adminLogoutBtn')?.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminState.token}` }
      });
    } catch (_) {}
    localStorage.removeItem('avs_admin_token');
    localStorage.removeItem('avs_admin_user');
    window.location.href = '/login';
  });

  // Topbar add tool
  document.getElementById('topbarAddToolBtn')?.addEventListener('click', () => {
    openAddToolModal();
  });
}

function switchTab(tabId) {
  adminState.activeTab = tabId;

  // Update sidebar active state
  document.querySelectorAll('.sidebar-link').forEach(link => {
    if (link.getAttribute('data-tab') === tabId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Update tab content
  document.querySelectorAll('.admin-tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  const activePane = document.getElementById(tabId);
  if (activePane) activePane.classList.add('active');

  // Update title
  const titles = {
    'tab-overview': 'Dashboard Overview',
    'tab-inventory': 'Hand Tools Inventory (CRUD)',
    'tab-quotes': 'Customer B2B Quotations / RFQ',
    'tab-inquiries': 'Dealer & Distributor Inquiries',
    'tab-reviews': 'Contractor Reviews Moderation',
    'tab-database': 'SQLite Database Engine Status',
    'tab-security': 'Admin Security & Password'
  };
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) titleEl.textContent = titles[tabId] || 'Admin Console';
}

function setupTopbar() {
  const dateEl = document.getElementById('topbarDate');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Ping DB button
  document.getElementById('pingDbBtn')?.addEventListener('click', async () => {
    await loadDbHealth();
    showToast('SQLite database connection verified', 'success');
  });

  document.getElementById('dbHealthCheckFullBtn')?.addEventListener('click', async () => {
    await loadDbHealth();
    showToast('Database diagnostics refreshed', 'success');
  });
}

// Make switchTab available globally
window.switchTab = switchTab;

// ============================================================================
// Data Loaders
// ============================================================================
async function loadAllAdminData() {
  await Promise.all([
    loadOverviewStats(),
    loadCategories(),
    loadInventory(),
    loadQuotes(),
    loadInquiries(),
    loadDbHealth()
  ]);
}

async function loadOverviewStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();

    document.getElementById('metricTotalProducts').textContent = stats.totalProducts || 0;
    document.getElementById('metricTotalStock').textContent = (stats.totalStockUnits || 0).toLocaleString();
    document.getElementById('metricValuation').textContent = `Valuation: ₹${formatCurrency(stats.inventoryValuation)}`;
    document.getElementById('metricTotalQuotes').textContent = stats.totalQuotes || 0;
    document.getElementById('metricPendingQuotes').textContent = `${stats.pendingQuotes || 0} Pending response`;
    document.getElementById('metricTotalInquiries').textContent = stats.totalInquiries || 0;
    document.getElementById('metricUnreadInquiries').textContent = `${stats.unreadInquiries || 0} Unread messages`;

    document.getElementById('sidebarProdCount').textContent = stats.totalProducts || 0;
    document.getElementById('sidebarQuoteCount').textContent = stats.totalQuotes || 0;
    document.getElementById('sidebarInqCount').textContent = stats.totalInquiries || 0;
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const cats = await res.json();
    adminState.categories = cats;

    const select = document.getElementById('adminCatFilter');
    const formCatSelect = document.getElementById('formToolCategory');

    if (select) {
      select.innerHTML = '<option value="all">All Categories</option>' +
        cats.map(c => `<option value="${c.name}">${c.name} (${c.product_count})</option>`).join('');
    }

    if (formCatSelect) {
      formCatSelect.innerHTML = cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

async function loadInventory() {
  const tbody = document.getElementById('inventoryTbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/products');
    const products = await res.json();
    adminState.products = products;

    renderInventoryTable(products);
  } catch (err) {
    console.error('Error loading inventory:', err);
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--danger);">Error loading products from database</td></tr>';
  }
}

function renderInventoryTable(products) {
  const tbody = document.getElementById('inventoryTbody');
  if (!tbody) return;

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted);">No hand tools found in database. Click "Add New Hand Tool" to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(p => `
    <tr>
      <td><code>#${p.id}</code></td>
      <td><img src="${p.image_url}" alt="${escapeHtml(p.name)}" class="table-img"></td>
      <td>
        <strong>${escapeHtml(p.name)}</strong><br>
        <span style="font-size:0.75rem;color:var(--text-dim);font-family:var(--font-mono);">${escapeHtml(p.sku)} • ${escapeHtml(p.brand)}</span>
      </td>
      <td><span class="badge-tag">${escapeHtml(p.category_name)}</span></td>
      <td style="font-size:0.8rem;color:var(--text-secondary);">${escapeHtml(p.material)}</td>
      <td><strong>₹${formatCurrency(p.price)}</strong></td>
      <td><span class="badge-tag success">${p.stock} Units</span></td>
      <td><span style="color:#fbbf24;font-weight:700;">★ ${p.rating}</span></td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-xs btn-outline-accent" onclick="editTool(${p.id})" title="Edit product">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button class="btn btn-xs btn-outline" style="color:var(--danger);border-color:rgba(239,68,68,0.3);" onclick="deleteTool(${p.id})" title="Delete from database">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadQuotes() {
  const tbody = document.getElementById('quotesTbody');
  const overviewTbody = document.getElementById('overviewQuotesTbody');

  try {
    const res = await fetch('/api/quotes');
    const quotes = await res.json();
    adminState.quotes = quotes;

    // Overview recent preview
    if (overviewTbody) {
      if (quotes.length === 0) {
        overviewTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-muted);">No quotations submitted yet.</td></tr>';
      } else {
        overviewTbody.innerHTML = quotes.slice(0, 5).map(q => `
          <tr>
            <td><strong style="color:var(--accent-light);font-family:var(--font-mono);">${escapeHtml(q.quote_no)}</strong></td>
            <td><strong>${escapeHtml(q.customer_name)}</strong><br><span style="font-size:0.75rem;color:var(--text-dim);">${escapeHtml(q.city || 'N/A')}</span></td>
            <td>${q.total_items} units</td>
            <td><strong>₹${formatCurrency(q.total_estimated)}</strong></td>
            <td><span class="badge-tag ${q.status === 'Quoted' ? 'success' : 'warning'}">${escapeHtml(q.status)}</span></td>
          </tr>
        `).join('');
      }
    }

    // Full quotes table
    if (tbody) {
      if (quotes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">No quotations in database.</td></tr>';
        return;
      }

      tbody.innerHTML = quotes.map(q => {
        const itemsSummary = (q.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ');
        return `
          <tr>
            <td><strong style="color:var(--accent-light);font-family:var(--font-mono);">${escapeHtml(q.quote_no)}</strong></td>
            <td style="font-size:0.75rem;color:var(--text-dim);">${new Date(q.created_at).toLocaleDateString()}</td>
            <td>
              <strong>${escapeHtml(q.customer_name)}</strong><br>
              <span style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(q.company_name || 'Individual')} • ${escapeHtml(q.city || '')}</span>
            </td>
            <td style="font-size:0.8rem;">
              <div><i class="fa-solid fa-phone" style="color:var(--accent-primary);font-size:0.75rem;"></i> ${escapeHtml(q.phone)}</div>
              <div style="color:var(--text-dim);">${escapeHtml(q.email)}</div>
            </td>
            <td style="font-size:0.8rem;max-width:240px;color:var(--text-secondary);" title="${escapeHtml(itemsSummary)}">
              ${escapeHtml(itemsSummary.slice(0, 45))}${itemsSummary.length > 45 ? '...' : ''}
            </td>
            <td><strong style="color:#34d399;">₹${formatCurrency(q.total_estimated)}</strong></td>
            <td><span class="badge-tag ${q.status === 'Quoted' ? 'success' : 'warning'}">${escapeHtml(q.status)}</span></td>
            <td>
              <select class="select-styled" style="height:32px;padding:0 8px;font-size:0.78rem;" onchange="updateQuoteStatus(${q.id}, this.value)">
                <option value="Pending" ${q.status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Quoted" ${q.status === 'Quoted' ? 'selected' : ''}>Quoted</option>
                <option value="Approved" ${q.status === 'Approved' ? 'selected' : ''}>Approved</option>
                <option value="Dispatched" ${q.status === 'Dispatched' ? 'selected' : ''}>Dispatched</option>
              </select>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading quotes:', err);
  }
}

async function loadInquiries() {
  const tbody = document.getElementById('inquiriesTbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/inquiries');
    const inqs = await res.json();
    adminState.inquiries = inqs;

    if (inqs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No messages or dealer applications logged yet.</td></tr>';
      return;
    }

    tbody.innerHTML = inqs.map(i => `
      <tr>
        <td><code>#${i.id}</code></td>
        <td style="font-size:0.75rem;color:var(--text-dim);">${new Date(i.created_at).toLocaleDateString()}</td>
        <td>
          <strong>${escapeHtml(i.name)}</strong><br>
          <span style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(i.email)} • ${escapeHtml(i.phone || '')}</span>
        </td>
        <td>
          <span class="badge-tag">${escapeHtml(i.inquiry_type || 'General')}</span><br>
          <strong style="font-size:0.8rem;">${escapeHtml(i.subject || '')}</strong>
        </td>
        <td style="font-size:0.82rem;color:var(--text-secondary);max-width:320px;">
          ${escapeHtml(i.message)}
        </td>
        <td><span class="badge-tag ${i.status === 'Read' ? '' : 'warning'}">${escapeHtml(i.status)}</span></td>
        <td>
          <button class="btn btn-xs btn-outline" onclick="markInquiryRead(${i.id})">
            <i class="fa-solid fa-check"></i> Mark Read
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading inquiries:', err);
  }
}

async function loadDbHealth() {
  try {
    const res = await fetch('/api/db/health');
    const health = await res.json();

    const snapshotEl = document.getElementById('dbSnapshotDetails');
    if (snapshotEl) {
      snapshotEl.textContent = JSON.stringify({
        status: health.status,
        engine: health.engine,
        databaseFile: health.databasePath,
        fileSize: `${health.fileSizeKb} KB`,
        tables: health.tables,
        uptime: `${health.uptimeSeconds}s`
      }, null, 2);
    }

    const pathDisplay = document.getElementById('dbPathDisplay');
    if (pathDisplay) pathDisplay.textContent = health.databasePath;

    const sizeDisplay = document.getElementById('dbFileSizeDisplay');
    if (sizeDisplay) sizeDisplay.textContent = `${health.fileSizeKb} KB`;

    const uptimeDisplay = document.getElementById('dbUptimeDisplay');
    if (uptimeDisplay) uptimeDisplay.textContent = `${health.uptimeSeconds} seconds`;

    const tablesTbody = document.getElementById('dbTablesCountTbody');
    if (tablesTbody) {
      tablesTbody.innerHTML = `
        <tr><td><code>products</code></td><td>Hand tools specifications, inventory, and pricing</td><td><strong>${health.tables.products}</strong></td></tr>
        <tr><td><code>categories</code></td><td>Product taxonomy & tool families</td><td><strong>${health.tables.categories}</strong></td></tr>
        <tr><td><code>quotes</code></td><td>Customer wholesale B2B quotations & RFQ tickets</td><td><strong>${health.tables.quotes}</strong></td></tr>
        <tr><td><code>inquiries</code></td><td>Contractor & dealer contact requests</td><td><strong>${health.tables.inquiries}</strong></td></tr>
        <tr><td><code>reviews</code></td><td>Trade verified feedback & ratings</td><td><strong>${health.tables.reviews}</strong></td></tr>
      `;
    }
  } catch (err) {
    console.error('Error loading db health:', err);
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================
function openAddToolModal() {
  document.getElementById('formToolId').value = '';
  document.getElementById('toolModalTitle').innerHTML = '<i class="fa-solid fa-plus"></i> Add New Hand Tool to SQLite Database';
  document.getElementById('toolForm').reset();
  document.getElementById('toolFormModal').style.display = 'flex';
}

function closeToolModal() {
  document.getElementById('toolFormModal').style.display = 'none';
}

window.openAddToolModal = openAddToolModal;
window.closeToolModal = closeToolModal;

window.editTool = async function(id) {
  try {
    const res = await fetch(`/api/products/${id}`);
    const tool = await res.json();

    document.getElementById('formToolId').value = tool.id;
    document.getElementById('toolModalTitle').innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Tool #${tool.id}: ${escapeHtml(tool.name)}`;
    document.getElementById('formToolName').value = tool.name || '';
    document.getElementById('formToolSku').value = tool.sku || '';
    document.getElementById('formToolBrand').value = tool.brand || '';
    document.getElementById('formToolCategory').value = tool.category_name || 'Spanners & Wrenches';
    document.getElementById('formToolPrice').value = tool.price || '';
    document.getElementById('formToolMrp').value = tool.mrp || '';
    document.getElementById('formToolStock').value = tool.stock || 50;
    document.getElementById('formToolMaterial').value = tool.material || '';
    document.getElementById('formToolSize').value = tool.size || '';
    document.getElementById('formToolHardness').value = tool.hardness || '';
    document.getElementById('formToolImage').value = tool.image_url || '';
    document.getElementById('formToolBadge').value = tool.badge || '';
    document.getElementById('formToolDesc').value = tool.description || '';

    document.getElementById('toolFormModal').style.display = 'flex';
  } catch (err) {
    console.error(err);
    showToast('Failed to load tool details', 'error');
  }
};

window.deleteTool = async function(id) {
  if (!confirm(`Are you sure you want to permanently delete tool #${id} from the SQLite database?`)) return;

  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete');

    showToast('Tool deleted from database', 'warning');
    await loadInventory();
    await loadOverviewStats();
    await loadDbHealth();
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  }
};

window.updateQuoteStatus = async function(id, newStatus) {
  try {
    const res = await fetch(`/api/quotes/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminState.token}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Status update failed');
    showToast(`Quote #${id} marked as ${newStatus}`, 'success');
    loadQuotes();
    loadOverviewStats();
  } catch (err) {
    console.error(err);
    showToast('Failed to update quote status', 'error');
  }
};

window.markInquiryRead = async function(id) {
  try {
    const res = await fetch(`/api/inquiries/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminState.token}`
      },
      body: JSON.stringify({ status: 'Read' })
    });
    if (!res.ok) throw new Error('Failed to update');
    showToast(`Inquiry #${id} marked as Read`, 'success');
    loadInquiries();
    loadOverviewStats();
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  }
};

// ============================================================================
// Forms Handling
// ============================================================================
function setupForms() {
  // Preset photo selector in modal
  document.getElementById('formToolImagePreset')?.addEventListener('change', (e) => {
    if (e.target.value) {
      document.getElementById('formToolImage').value = e.target.value;
    }
  });

  // Tool Form Submit (Add / Edit)
  document.getElementById('toolForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('formToolId').value;
    const isEdit = Boolean(id);
    const saveBtn = document.getElementById('saveToolBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving to DB...';

    const payload = {
      name: document.getElementById('formToolName').value.trim(),
      sku: document.getElementById('formToolSku').value.trim(),
      brand: document.getElementById('formToolBrand').value.trim(),
      category_name: document.getElementById('formToolCategory').value,
      price: parseFloat(document.getElementById('formToolPrice').value),
      mrp: parseFloat(document.getElementById('formToolMrp').value) || 0,
      stock: parseInt(document.getElementById('formToolStock').value, 10) || 50,
      material: document.getElementById('formToolMaterial').value.trim(),
      size: document.getElementById('formToolSize').value.trim(),
      hardness: document.getElementById('formToolHardness').value.trim(),
      image_url: document.getElementById('formToolImage').value.trim(),
      badge: document.getElementById('formToolBadge').value.trim(),
      description: document.getElementById('formToolDesc').value.trim()
    };

    try {
      const url = isEdit ? `/api/products/${id}` : '/api/products';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminState.token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save product');

      showToast(isEdit ? 'Tool updated in SQLite database!' : 'New tool added to database!', 'success');
      closeToolModal();
      await loadInventory();
      await loadOverviewStats();
      await loadDbHealth();
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save to SQLite Database';
    }
  });

  // Inventory search filter
  const searchInput = document.getElementById('adminInventorySearch');
  searchInput?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const cat = document.getElementById('adminCatFilter')?.value || 'all';
    filterInventory(term, cat);
  });

  document.getElementById('adminCatFilter')?.addEventListener('change', (e) => {
    const term = searchInput?.value.toLowerCase().trim() || '';
    filterInventory(term, e.target.value);
  });

  document.getElementById('refreshInventoryBtn')?.addEventListener('click', loadInventory);
  document.getElementById('refreshQuotesBtn')?.addEventListener('click', loadQuotes);
  document.getElementById('refreshInquiriesBtn')?.addEventListener('click', loadInquiries);

  // Change Password Form
  document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPwd = document.getElementById('confirmNewPassword').value;

    if (newPassword !== confirmPwd) {
      showToast('New passwords do not match', 'error');
      return;
    }

    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminState.token}`
        },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');

      showToast('Password changed successfully!', 'success');
      e.target.reset();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function filterInventory(searchTerm, category) {
  let filtered = adminState.products;

  if (category && category !== 'all') {
    filtered = filtered.filter(p => p.category_name === category);
  }

  if (searchTerm) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(searchTerm) ||
      (p.sku && p.sku.toLowerCase().includes(searchTerm)) ||
      (p.material && p.material.toLowerCase().includes(searchTerm)) ||
      (p.brand && p.brand.toLowerCase().includes(searchTerm))
    );
  }

  renderInventoryTable(filtered);
}

// ============================================================================
// Utilities
// ============================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('adminToastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'warning') icon = 'fa-triangle-exclamation';
  if (type === 'error') icon = 'fa-circle-xmark';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function formatCurrency(amount) {
  if (amount === undefined || amount === null) return '0.00';
  return Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
