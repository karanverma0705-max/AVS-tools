/**
 * AVS TOOLS - Industrial Hand Tools Client Application
 * Database-Connected Single Page Architecture
 */

// Application State
const state = {
  products: [],
  categories: [],
  cart: JSON.parse(localStorage.getItem('avs_quote_cart') || '[]'),
  activeCategory: 'all',
  searchQuery: '',
  sortBy: 'featured',
  selectedProduct: null,
  dbHealth: null
};

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  setupEventListeners();
  updateCartBadge();
  await Promise.all([
    checkDatabaseHealth(),
    loadCategories(),
    loadProducts()
  ]);
}

// ============================================================================
// API Calls
// ============================================================================
async function checkDatabaseHealth() {
  try {
    const res = await fetch('/api/db/health');
    if (!res.ok) throw new Error('Database ping failed');
    const data = await res.json();
    state.dbHealth = data;

    // Update UI indicators
    const statusPill = document.getElementById('headerDbStatus');
    if (statusPill) {
      statusPill.innerHTML = `
        <span class="pulse-dot"></span>
        <span class="status-label">SQLite: ${data.tables.products} Tools Active</span>
      `;
    }

    const catalogDbInfo = document.getElementById('catalogDbInfo');
    if (catalogDbInfo) {
      catalogDbInfo.textContent = `${data.tables.products} Products • ${data.tables.quotes} RFQs • ${data.fileSizeKb} KB`;
    }

    const dbWidgetCount = document.getElementById('dbWidgetCount');
    if (dbWidgetCount) {
      dbWidgetCount.innerHTML = `Total Records: <strong>${data.tables.products + data.tables.quotes + data.tables.inquiries + data.tables.reviews}</strong>`;
    }

    return data;
  } catch (err) {
    console.error('DB Health Error:', err);
    const statusPill = document.getElementById('headerDbStatus');
    if (statusPill) {
      statusPill.innerHTML = `
        <span class="pulse-dot" style="background:#ef4444;box-shadow:0 0 8px #ef4444"></span>
        <span class="status-label" style="color:#f87171">DB Reconnecting</span>
      `;
    }
  }
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) throw new Error('Failed to fetch categories');
    const categories = await res.json();
    state.categories = categories;

    renderCategoryPills(categories);
    populateCategoryDropdowns(categories);
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

async function loadProducts() {
  try {
    const params = new URLSearchParams();
    if (state.activeCategory && state.activeCategory !== 'all') {
      params.append('category', state.activeCategory);
    }
    if (state.searchQuery) {
      params.append('search', state.searchQuery);
    }
    if (state.sortBy) {
      params.append('sort', state.sortBy);
    }

    const res = await fetch(`/api/products?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load products');
    const products = await res.json();
    state.products = products;

    renderProductsGrid(products);
    updateTotalCounter(products.length);
  } catch (err) {
    console.error('Error loading products:', err);
    showToast('Failed to connect to database', 'error');
  }
}

async function fetchProductDetails(id) {
  try {
    const res = await fetch(`/api/products/${id}`);
    if (!res.ok) throw new Error('Product not found');
    return await res.json();
  } catch (err) {
    console.error('Error fetching product details:', err);
    showToast('Could not load product details', 'error');
    return null;
  }
}

// ============================================================================
// UI Renderers
// ============================================================================
function renderCategoryPills(categories) {
  const container = document.getElementById('categoryPillsContainer');
  if (!container) return;

  const totalCount = categories.reduce((sum, c) => sum + (c.product_count || 0), 0);

  let html = `
    <button class="cat-pill ${state.activeCategory === 'all' ? 'active' : ''}" data-category="all">
      <i class="fa-solid fa-layer-group"></i> All Tools <span class="pill-count">${totalCount}</span>
    </button>
  `;

  categories.forEach(cat => {
    const isActive = state.activeCategory === cat.name || state.activeCategory === cat.slug;
    html += `
      <button class="cat-pill ${isActive ? 'active' : ''}" data-category="${cat.name}">
        <i class="fa-solid ${cat.icon || 'fa-wrench'}"></i> ${cat.name} 
        <span class="pill-count">${cat.product_count || 0}</span>
      </button>
    `;
  });

  container.innerHTML = html;

  // Add click handlers
  container.querySelectorAll('.cat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeCategory = btn.getAttribute('data-category');
      
      const select = document.getElementById('filterCategorySelect');
      if (select) select.value = state.activeCategory;

      loadProducts();
    });
  });
}

function populateCategoryDropdowns(categories) {
  const select = document.getElementById('filterCategorySelect');
  if (select) {
    let options = '<option value="all">All Categories</option>';
    categories.forEach(c => {
      options += `<option value="${c.name}">${c.name} (${c.product_count})</option>`;
    });
    select.innerHTML = options;
  }
}

function renderProductsGrid(products) {
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyState');
  if (!grid) return;

  if (!products || products.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  grid.innerHTML = products.map(prod => `
    <div class="product-card" data-id="${prod.id}">
      <div class="product-media">
        <img src="${prod.image_url}" alt="${escapeHtml(prod.name)}" class="product-img" loading="lazy">
        ${prod.badge ? `<span class="product-badge">${escapeHtml(prod.badge)}</span>` : ''}
        <span class="product-stock-tag"><i class="fa-solid fa-check"></i> In Stock (${prod.stock})</span>
      </div>

      <div class="product-card-body">
        <div class="product-meta-row">
          <span class="product-sku">${escapeHtml(prod.sku)}</span>
          <span class="product-rating">
            <i class="fa-solid fa-star"></i> ${prod.rating || 4.8}
            <span style="color:var(--text-dim);font-weight:400;">(${prod.reviews_count || 0})</span>
          </span>
        </div>

        <h3 class="product-name" title="${escapeHtml(prod.name)}">${escapeHtml(prod.name)}</h3>

        <div class="product-specs-pills">
          <span class="spec-pill material"><i class="fa-solid fa-shield"></i> ${escapeHtml(prod.material)}</span>
          <span class="spec-pill"><i class="fa-solid fa-ruler-horizontal"></i> ${escapeHtml(prod.size)}</span>
        </div>

        <div class="product-pricing">
          <div>
            <span class="price-current">₹${formatCurrency(prod.price)}</span>
            ${prod.mrp && prod.mrp > prod.price ? `<span class="price-mrp">₹${formatCurrency(prod.mrp)}</span>` : ''}
          </div>
          <div class="price-wholesale-tag">
            <i class="fa-solid fa-tag"></i> B2B Wholesale Tier
          </div>
        </div>

        <div class="product-card-actions">
          <button class="btn btn-view quick-view-btn" data-id="${prod.id}">
            <i class="fa-solid fa-eye"></i> Specs
          </button>
          <button class="btn btn-add-quote add-to-quote-btn" data-id="${prod.id}">
            <i class="fa-solid fa-cart-plus"></i> Add to Quote
          </button>
        </div>
      </div>
    </div>
  `).join('');

  // Attach button events
  grid.querySelectorAll('.quick-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openProductModal(btn.getAttribute('data-id'));
    });
  });

  grid.querySelectorAll('.add-to-quote-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.getAttribute('data-id'), 10);
      addToCart(id, 1);
    });
  });

  // Card click opens modal
  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openProductModal(card.getAttribute('data-id'));
    });
  });
}

function updateTotalCounter(count) {
  const pillCountAll = document.getElementById('pillCountAll');
  if (pillCountAll) pillCountAll.textContent = count;
}

// ============================================================================
// Product Detail Modal
// ============================================================================
async function openProductModal(id) {
  const modal = document.getElementById('productModal');
  const content = document.getElementById('productModalContent');
  if (!modal || !content) return;

  content.innerHTML = '<div style="padding:40px;text-align:center;"><i class="fa-solid fa-spinner fa-spin fa-2x text-accent"></i><p style="margin-top:12px;">Querying SQLite database...</p></div>';
  modal.style.display = 'flex';

  const product = await fetchProductDetails(id);
  if (!product) {
    modal.style.display = 'none';
    return;
  }

  state.selectedProduct = product;

  // Render specs list table
  const specsEntries = Object.entries(product.specs || {});
  const specsHtml = specsEntries.length ? `
    <table class="modal-specs-table">
      <tbody>
        ${specsEntries.map(([k, v]) => `
          <tr>
            <td>${escapeHtml(k)}</td>
            <td>${escapeHtml(v)}</td>
          </tr>
        `).join('')}
        <tr>
          <td>Hardness Rating</td>
          <td>${escapeHtml(product.hardness || '50-55 HRC')}</td>
        </tr>
        <tr>
          <td>Finish / Coating</td>
          <td>${escapeHtml(product.finish || 'Satin Chrome Plated')}</td>
        </tr>
        <tr>
          <td>Mechanical Warranty</td>
          <td><strong class="text-accent">Lifetime Guarantee Against Breakage</strong></td>
        </tr>
      </tbody>
    </table>
  ` : '';

  // Render features
  const featuresHtml = (product.features || []).map(f => `
    <li style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;font-size:0.85rem;color:var(--text-secondary);">
      <i class="fa-solid fa-check-circle" style="color:var(--success);margin-top:3px;"></i>
      <span>${escapeHtml(f)}</span>
    </li>
  `).join('');

  // Render reviews
  const reviewsHtml = (product.reviews || []).map(r => `
    <div class="review-item">
      <div class="review-header">
        <span class="review-author">${escapeHtml(r.author)} <span style="font-weight:400;color:var(--text-dim);font-size:0.75rem;">• ${escapeHtml(r.company_or_trade || 'Trade Pro')}</span></span>
        <span style="color:#fbbf24;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
      </div>
      <div style="font-weight:700;font-size:0.85rem;margin-bottom:4px;color:#ffffff;">${escapeHtml(r.headline || '')}</div>
      <div class="review-comment">${escapeHtml(r.comment)}</div>
    </div>
  `).join('') || '<p style="color:var(--text-muted);font-size:0.85rem;">No reviews yet for this product. Be the first contractor to write one!</p>';

  content.innerHTML = `
    <div class="product-detail-layout">
      <!-- Media Col -->
      <div>
        <div class="modal-product-gallery">
          <img src="${product.image_url}" alt="${escapeHtml(product.name)}" class="modal-product-img">
        </div>
        <div style="margin-top:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;">
          <h4 style="font-size:0.85rem;color:var(--accent-light);margin-bottom:8px;"><i class="fa-solid fa-tags"></i> Wholesale Volume Pricing Tiers</h4>
          <div style="font-size:0.78rem;color:var(--text-secondary);display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;justify-content:space-between;"><span>1 - 9 Units:</span> <strong>₹${formatCurrency(product.price)} / unit</strong></div>
            <div style="display:flex;justify-content:space-between;color:#34d399;"><span>10 - 49 Units (15% Off):</span> <strong>₹${formatCurrency(product.price * 0.85)} / unit</strong></div>
            <div style="display:flex;justify-content:space-between;color:#38bdf8;"><span>50+ Master Lots (25% Off):</span> <strong>₹${formatCurrency(product.price * 0.75)} / unit</strong></div>
          </div>
        </div>
      </div>

      <!-- Specs & Purchase Col -->
      <div>
        <div class="modal-meta-row">
          <span>SKU: <code>${escapeHtml(product.sku)}</code></span>
          <span>Brand: <strong>${escapeHtml(product.brand)}</strong></span>
          <span style="color:#fbbf24;"><i class="fa-solid fa-star"></i> ${product.rating} (${product.reviews_count} reviews)</span>
        </div>

        <h2 class="modal-product-title">${escapeHtml(product.name)}</h2>

        <div class="modal-price-box">
          <span class="modal-price">₹${formatCurrency(product.price)}</span>
          ${product.mrp ? `<span class="price-mrp" style="font-size:1.1rem;">₹${formatCurrency(product.mrp)}</span>` : ''}
          <span class="badge-success" style="margin-left:auto;"><i class="fa-solid fa-box"></i> ${product.stock} Ready in Stock</span>
        </div>

        <p class="modal-desc">${escapeHtml(product.description || '')}</p>

        <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;color:#ffffff;">Key Features</h4>
        <ul style="list-style:none;margin-bottom:20px;">
          ${featuresHtml}
        </ul>

        <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;color:#ffffff;">Technical Specifications</h4>
        ${specsHtml}

        <!-- Add to Quote Controls -->
        <div class="modal-actions-row">
          <div class="quantity-control">
            <button class="qty-btn" id="modalQtyMinus">-</button>
            <input type="number" class="qty-input" id="modalQtyInput" value="1" min="1" max="999">
            <button class="qty-btn" id="modalQtyPlus">+</button>
          </div>
          <button class="btn btn-primary" id="modalAddToCartBtn" style="flex:1;">
            <i class="fa-solid fa-cart-plus"></i> Add to Quote Cart
          </button>
        </div>

        <!-- Reviews Section -->
        <div class="reviews-section">
          <div class="reviews-header">
            <h4 style="font-size:1rem;font-weight:700;"><i class="fa-solid fa-comments"></i> Contractor Reviews (${(product.reviews || []).length})</h4>
            <button class="btn btn-xs btn-outline-accent" id="toggleReviewFormBtn">Write a Review</button>
          </div>

          <!-- Add Review Form -->
          <div id="addReviewFormContainer" style="display:none;background:rgba(255,255,255,0.04);border:1px solid var(--border-medium);border-radius:var(--radius-md);padding:14px;margin-bottom:16px;">
            <h5 style="margin-bottom:8px;font-size:0.85rem;">Submit Verified Review</h5>
            <form id="submitReviewForm">
              <input type="hidden" id="revProductId" value="${product.id}">
              <div class="form-row">
                <div class="form-group" style="margin-bottom:8px;">
                  <label style="font-size:0.75rem;">Your Name *</label>
                  <input type="text" id="revAuthor" required placeholder="e.g. Vikram Singh" style="padding:6px 10px;font-size:0.8rem;">
                </div>
                <div class="form-group" style="margin-bottom:8px;">
                  <label style="font-size:0.75rem;">Company / Workshop</label>
                  <input type="text" id="revCompany" placeholder="e.g. Singh Mechanics" style="padding:6px 10px;font-size:0.8rem;">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group" style="margin-bottom:8px;">
                  <label style="font-size:0.75rem;">Rating *</label>
                  <select id="revRating" class="select-styled" style="height:34px;padding:0 8px;font-size:0.8rem;">
                    <option value="5">★★★★★ (5 Stars - Industrial Grade)</option>
                    <option value="4">★★★★☆ (4 Stars - Very Good)</option>
                    <option value="3">★★★☆☆ (3 Stars - Average)</option>
                    <option value="2">★★☆☆☆ (2 Stars - Below Expectation)</option>
                    <option value="1">★☆☆☆☆ (1 Star - Poor)</option>
                  </select>
                </div>
                <div class="form-group" style="margin-bottom:8px;">
                  <label style="font-size:0.75rem;">Headline</label>
                  <input type="text" id="revHeadline" placeholder="Summary of experience" style="padding:6px 10px;font-size:0.8rem;">
                </div>
              </div>
              <div class="form-group" style="margin-bottom:8px;">
                <label style="font-size:0.75rem;">Your Review / Performance Feedback *</label>
                <textarea id="revComment" required rows="2" placeholder="How did this tool perform under torque or continuous usage?" style="padding:6px 10px;font-size:0.8rem;"></textarea>
              </div>
              <button type="submit" class="btn btn-primary btn-xs" id="revSubmitBtn">
                <i class="fa-solid fa-check"></i> Post Review to Database
              </button>
            </form>
          </div>

          <div class="reviews-list">
            ${reviewsHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  // Qty stepper
  const qtyInput = document.getElementById('modalQtyInput');
  document.getElementById('modalQtyMinus')?.addEventListener('click', () => {
    let val = parseInt(qtyInput.value, 10) || 1;
    if (val > 1) qtyInput.value = val - 1;
  });
  document.getElementById('modalQtyPlus')?.addEventListener('click', () => {
    let val = parseInt(qtyInput.value, 10) || 1;
    qtyInput.value = val + 1;
  });

  // Add to cart
  document.getElementById('modalAddToCartBtn')?.addEventListener('click', () => {
    const qty = parseInt(qtyInput.value, 10) || 1;
    addToCart(product.id, qty);
    modal.style.display = 'none';
  });

  // Toggle Review Form
  const toggleReviewBtn = document.getElementById('toggleReviewFormBtn');
  const reviewFormBox = document.getElementById('addReviewFormContainer');
  toggleReviewBtn?.addEventListener('click', () => {
    reviewFormBox.style.display = reviewFormBox.style.display === 'none' ? 'block' : 'none';
  });

  // Submit Review Form
  document.getElementById('submitReviewForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      product_id: product.id,
      author: document.getElementById('revAuthor').value.trim(),
      company_or_trade: document.getElementById('revCompany').value.trim(),
      rating: parseInt(document.getElementById('revRating').value, 10),
      headline: document.getElementById('revHeadline').value.trim(),
      comment: document.getElementById('revComment').value.trim()
    };

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to submit review');
      showToast('Review submitted to database!', 'success');
      // Refresh modal
      openProductModal(product.id);
      loadProducts(); // refresh rating on catalog
    } catch (err) {
      console.error(err);
      showToast('Error saving review to database', 'error');
    }
  });
}

// ============================================================================
// Cart & RFQ Drawer Operations
// ============================================================================
function addToCart(productId, quantity = 1) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  const existingIndex = state.cart.findIndex(item => item.id === productId);
  if (existingIndex > -1) {
    state.cart[existingIndex].quantity += quantity;
  } else {
    state.cart.push({
      id: prod.id,
      name: prod.name,
      sku: prod.sku,
      price: prod.price,
      image_url: prod.image_url,
      material: prod.material,
      size: prod.size,
      quantity: quantity
    });
  }

  saveCart();
  updateCartBadge();
  showToast(`Added ${quantity}x "${prod.name.slice(0, 24)}..." to Quote Cart`, 'success');
}

function updateCartQuantity(productId, newQty) {
  const item = state.cart.find(i => i.id === productId);
  if (!item) return;

  if (newQty <= 0) {
    removeFromCart(productId);
  } else {
    item.quantity = newQty;
    saveCart();
    renderCartDrawer();
    updateCartBadge();
  }
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(i => i.id !== productId);
  saveCart();
  renderCartDrawer();
  updateCartBadge();
  showToast('Item removed from quotation list', 'warning');
}

function saveCart() {
  localStorage.setItem('avs_quote_cart', JSON.stringify(state.cart));
}

function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function openCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  if (!drawer) return;
  renderCartDrawer();
  drawer.style.display = 'flex';
}

function closeCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  if (drawer) drawer.style.display = 'none';
}

function renderCartDrawer() {
  const listContainer = document.getElementById('cartItemsList');
  const totalItemsEl = document.getElementById('drawerTotalItems');
  const totalAmountEl = document.getElementById('drawerTotalAmount');
  const checkoutSection = document.getElementById('cartCheckoutSection');

  if (!listContainer) return;

  if (state.cart.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align:center;padding:40px 10px;color:var(--text-muted);">
        <i class="fa-solid fa-clipboard-list" style="font-size:2.5rem;color:var(--text-dim);margin-bottom:12px;"></i>
        <h4 style="color:#ffffff;margin-bottom:6px;">Your Quotation Cart is Empty</h4>
        <p style="font-size:0.85rem;">Browse the hand tools catalog and click "Add to Quote" to assemble your wholesale or retail requirement.</p>
      </div>
    `;
    if (checkoutSection) checkoutSection.style.display = 'none';
    return;
  }

  if (checkoutSection) checkoutSection.style.display = 'block';

  let totalQty = 0;
  let totalSum = 0;

  listContainer.innerHTML = state.cart.map(item => {
    totalQty += item.quantity;
    totalSum += item.price * item.quantity;

    return `
      <div class="cart-item">
        <img src="${item.image_url}" alt="${escapeHtml(item.name)}" class="cart-item-img">
        <div class="cart-item-details">
          <div class="cart-item-title">${escapeHtml(item.name)}</div>
          <div class="cart-item-price">₹${formatCurrency(item.price)} × ${item.quantity} = ₹${formatCurrency(item.price * item.quantity)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
            <div class="quantity-control" style="height:28px;">
              <button class="qty-btn" onclick="updateCartQuantity(${item.id}, ${item.quantity - 1})">-</button>
              <input type="text" readonly class="qty-input" value="${item.quantity}" style="width:34px;font-size:0.8rem;">
              <button class="qty-btn" onclick="updateCartQuantity(${item.id}, ${item.quantity + 1})">+</button>
            </div>
            <button class="cart-item-remove" onclick="removeFromCart(${item.id})" title="Remove item">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (totalItemsEl) totalItemsEl.textContent = `${totalQty} Units (${state.cart.length} Tool Models)`;
  if (totalAmountEl) totalAmountEl.textContent = `₹${formatCurrency(totalSum)}`;
}

// Make cart functions accessible globally for onclick handlers
window.updateCartQuantity = updateCartQuantity;
window.removeFromCart = removeFromCart;

// ============================================================================
// Forms Handling (Quotes, Inquiries, Search)
// ============================================================================
function setupEventListeners() {
  // Mobile nav toggle
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const mainNav = document.getElementById('mainNav');
  mobileBtn?.addEventListener('click', () => {
    mainNav.classList.toggle('open');
    if (mainNav.classList.contains('open')) {
      mainNav.style.display = 'flex';
      mainNav.style.flexDirection = 'column';
      mainNav.style.position = 'absolute';
      mainNav.style.top = '80px';
      mainNav.style.left = '0';
      mainNav.style.width = '100%';
      mainNav.style.background = 'var(--bg-surface-elevated)';
      mainNav.style.padding = '20px';
      mainNav.style.borderBottom = '1px solid var(--border-medium)';
    } else {
      mainNav.style.display = '';
    }
  });

  // Header Search Input
  const headerSearch = document.getElementById('headerSearchInput');
  const headerClear = document.getElementById('headerSearchClear');
  headerSearch?.addEventListener('input', debounce((e) => {
    state.searchQuery = e.target.value.trim();
    if (headerClear) headerClear.style.display = state.searchQuery ? 'block' : 'none';
    const catalogSearch = document.getElementById('catalogSearchInput');
    if (catalogSearch) catalogSearch.value = state.searchQuery;
    loadProducts();
  }, 300));

  headerClear?.addEventListener('click', () => {
    headerSearch.value = '';
    state.searchQuery = '';
    headerClear.style.display = 'none';
    const catalogSearch = document.getElementById('catalogSearchInput');
    if (catalogSearch) catalogSearch.value = '';
    loadProducts();
  });

  // Catalog Section Search
  const catalogSearch = document.getElementById('catalogSearchInput');
  catalogSearch?.addEventListener('input', debounce((e) => {
    state.searchQuery = e.target.value.trim();
    if (headerSearch) headerSearch.value = state.searchQuery;
    loadProducts();
  }, 300));

  // Category Filter Dropdown
  const filterCatSelect = document.getElementById('filterCategorySelect');
  filterCatSelect?.addEventListener('change', (e) => {
    state.activeCategory = e.target.value;
    const pills = document.querySelectorAll('.cat-pill');
    pills.forEach(p => {
      if (p.getAttribute('data-category') === state.activeCategory) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });
    loadProducts();
  });

  // Catalog Sort Dropdown
  const sortSelect = document.getElementById('catalogSortSelect');
  sortSelect?.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    loadProducts();
  });

  // Refresh Button
  document.getElementById('refreshCatalogBtn')?.addEventListener('click', () => {
    checkDatabaseHealth();
    loadProducts();
    showToast('Catalog refreshed from SQLite database', 'success');
  });

  // Reset Filters Button
  document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
    state.activeCategory = 'all';
    state.searchQuery = '';
    if (headerSearch) headerSearch.value = '';
    if (catalogSearch) catalogSearch.value = '';
    if (filterCatSelect) filterCatSelect.value = 'all';
    const pills = document.querySelectorAll('.cat-pill');
    pills.forEach(p => p.getAttribute('data-category') === 'all' ? p.classList.add('active') : p.classList.remove('active'));
    loadProducts();
  });

  // Cart Button
  document.getElementById('quoteCartBtn')?.addEventListener('click', openCartDrawer);
  document.getElementById('cartDrawerClose')?.addEventListener('click', closeCartDrawer);
  document.getElementById('cartDrawer')?.addEventListener('click', (e) => {
    if (e.target.id === 'cartDrawer') closeCartDrawer();
  });

  // Product Modal Close
  document.getElementById('productModalClose')?.addEventListener('click', () => {
    const modal = document.getElementById('productModal');
    if (modal) modal.style.display = 'none';
  });
  document.getElementById('productModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'productModal') {
      e.target.style.display = 'none';
    }
  });

  // Drawer RFQ Form Submit (Cart to Database)
  document.getElementById('drawerRfqForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.cart.length === 0) {
      showToast('Please add tools to your cart first', 'warning');
      return;
    }

    const payload = {
      customer_name: document.getElementById('drawerName').value.trim(),
      company_name: document.getElementById('drawerCompany').value.trim(),
      phone: document.getElementById('drawerPhone').value.trim(),
      email: document.getElementById('drawerEmail').value.trim(),
      city: document.getElementById('drawerCity').value.trim(),
      gst_number: document.getElementById('drawerGst').value.trim(),
      notes: document.getElementById('drawerNotes').value.trim(),
      items: state.cart
    };

    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit quote');

      // Success!
      state.cart = [];
      saveCart();
      updateCartBadge();
      closeCartDrawer();
      checkDatabaseHealth();

      showQuoteSuccessModal(data.quoteNo, payload);
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  });

  // B2B Section Quick Quote Form (Homepage form to Database)
  document.getElementById('b2bQuickQuoteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      customer_name: document.getElementById('b2bName').value.trim(),
      company_name: document.getElementById('b2bCompany').value.trim(),
      phone: document.getElementById('b2bPhone').value.trim(),
      email: document.getElementById('b2bEmail').value.trim(),
      city: document.getElementById('b2bCity').value.trim(),
      notes: `${document.getElementById('b2bToolInterest').value} | Volume: ${document.getElementById('b2bVolume').value} | ${document.getElementById('b2bRemarks').value}`,
      items: [{
        name: document.getElementById('b2bToolInterest').value,
        quantity: document.getElementById('b2bVolume').value,
        price: 0
      }]
    };

    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');

      showToast(`Wholesale RFQ Submitted! Ticket: ${data.quoteNo}`, 'success');
      e.target.reset();
      checkDatabaseHealth();
    } catch (err) {
      console.error(err);
      showToast('Could not submit inquiry to database', 'error');
    }
  });

  // General Contact Form (to DB Inquiries table)
  document.getElementById('contactForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('contactName').value.trim(),
      email: document.getElementById('contactEmail').value.trim(),
      phone: document.getElementById('contactPhone').value.trim(),
      subject: document.getElementById('contactSubject').value,
      message: document.getElementById('contactMessage').value.trim(),
      inquiry_type: document.getElementById('contactSubject').value
    };

    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send message');

      showToast('Message sent! Stored in AVS Tools database.', 'success');
      e.target.reset();
      checkDatabaseHealth();
    } catch (err) {
      console.error(err);
      showToast('Error saving message to database', 'error');
    }
  });

  // DB Health Check button in footer
  document.getElementById('dbHealthCheckBtn')?.addEventListener('click', async () => {
    const data = await checkDatabaseHealth();
    if (data) {
      showToast(`Database: ${data.engine} (${data.fileSizeKb} KB, ${data.tables.products} Products)`, 'success');
    }
  });

  // Footer category links
  document.querySelectorAll('.footer-links a[data-cat]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const cat = link.getAttribute('data-cat');
      state.activeCategory = cat;
      const pills = document.querySelectorAll('.cat-pill');
      pills.forEach(p => p.getAttribute('data-category') === cat ? p.classList.add('active') : p.classList.remove('active'));
      loadProducts();
      document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function showQuoteSuccessModal(quoteNo, payload) {
  const modal = document.getElementById('productModal');
  const content = document.getElementById('productModalContent');
  if (!modal || !content) return;

  content.innerHTML = `
    <div style="text-align:center;padding:24px 10px;">
      <div style="width:70px;height:70px;background:rgba(16,185,129,0.15);border:2px solid var(--success);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;color:var(--success);font-size:2rem;">
        <i class="fa-solid fa-check"></i>
      </div>
      <span class="badge-success" style="font-size:0.85rem;padding:4px 12px;margin-bottom:12px;display:inline-block;">DATABASE ENTRY CONFIRMED</span>
      <h2 style="font-family:var(--font-heading);font-size:1.8rem;margin-bottom:8px;">Quotation Request Recorded!</h2>
      <p style="color:var(--text-secondary);font-size:1rem;max-width:550px;margin:0 auto 20px;">
        Thank you <strong>${escapeHtml(payload.customer_name)}</strong>. Your requirement has been logged directly into the AVS Tools enterprise database.
      </p>

      <div style="background:rgba(0,0,0,0.4);border:1px dashed var(--border-accent);border-radius:var(--radius-md);padding:18px;max-width:440px;margin:0 auto 24px;text-align:left;">
        <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:4px;">OFFICIAL RFQ REFERENCE NUMBER:</div>
        <div style="font-family:var(--font-mono);font-size:1.4rem;font-weight:700;color:var(--accent-light);">${quoteNo}</div>
        <div style="font-size:0.82rem;color:var(--text-muted);margin-top:8px;">
          Company: <strong>${escapeHtml(payload.company_name || 'N/A')}</strong><br>
          Mobile: <strong>${escapeHtml(payload.phone)}</strong><br>
          Items Requested: <strong>${payload.items.length} line item(s)</strong>
        </div>
      </div>

      <div style="display:flex;justify-content:center;gap:12px;">
        <button class="btn btn-primary" onclick="document.getElementById('productModal').style.display='none'">
          <i class="fa-solid fa-check"></i> Done
        </button>
        <button class="btn btn-glass" onclick="window.print()">
          <i class="fa-solid fa-print"></i> Print Slip
        </button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}



// ============================================================================
// Toast Notification Utility
// ============================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'warning') icon = 'fa-triangle-exclamation';
  if (type === 'error') icon = 'fa-circle-xmark';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================================
// Helper Utilities
// ============================================================================
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

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
