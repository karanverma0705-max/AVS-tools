const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { db, DB_PATH, hashPassword, verifyPassword } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Active Admin Session Tokens (In-Memory + persistent admin user table in SQLite)
const activeSessions = new Map();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public/
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// -------------------------------------------------------------
// Dedicated Page Routes
// -------------------------------------------------------------
app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.get(['/admin/login', '/login'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

// -------------------------------------------------------------
// API: Admin Authentication
// -------------------------------------------------------------
app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username.trim());
    if (!admin) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isMatch = verifyPassword(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate secure session token
    const token = crypto.randomUUID();
    const sessionData = {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
      loginAt: new Date().toISOString()
    };
    activeSessions.set(token, sessionData);

    res.json({
      success: true,
      token,
      admin: sessionData,
      message: 'Authentication successful'
    });
  } catch (err) {
    res.status(500).json({ error: 'Login error', details: err.message });
  }
});

app.get('/api/admin/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ authenticated: false, error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ authenticated: false, error: 'Session expired or invalid' });
  }

  res.json({ authenticated: true, admin: session });
});

app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

app.post('/api/admin/change-password', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expired' });
  }

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(session.id);
  if (!verifyPassword(oldPassword, admin.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(
    hashPassword(newPassword),
    session.id
  );

  res.json({ success: true, message: 'Password updated successfully' });
});

// -------------------------------------------------------------
// API: Database Health & Diagnostics
// -------------------------------------------------------------
app.get('/api/db/health', (req, res) => {
  try {
    const stats = fs.statSync(DB_PATH);
    const tableCounts = {
      products: db.prepare('SELECT COUNT(*) as c FROM products').get().c,
      categories: db.prepare('SELECT COUNT(*) as c FROM categories').get().c,
      quotes: db.prepare('SELECT COUNT(*) as c FROM quotes').get().c,
      inquiries: db.prepare('SELECT COUNT(*) as c FROM inquiries').get().c,
      reviews: db.prepare('SELECT COUNT(*) as c FROM reviews').get().c,
    };

    res.json({
      status: 'Connected',
      engine: 'SQLite (Node.js Native DatabaseSync)',
      databasePath: DB_PATH,
      fileSizeKb: (stats.size / 1024).toFixed(2),
      lastModified: stats.mtime,
      tables: tableCounts,
      uptimeSeconds: Math.floor(process.uptime())
    });
  } catch (err) {
    res.status(500).json({ error: 'Database check failed', details: err.message });
  }
});

// -------------------------------------------------------------
// API: Dashboard Overall Stats
// -------------------------------------------------------------
app.get('/api/stats', (req, res) => {
  try {
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
    const totalStock = db.prepare('SELECT SUM(stock) as stock, SUM(stock * price) as valuation FROM products').get();
    const totalQuotes = db.prepare('SELECT COUNT(*) as count FROM quotes').get().count;
    const pendingQuotes = db.prepare("SELECT COUNT(*) as count FROM quotes WHERE status = 'Pending'").get().count;
    const totalInquiries = db.prepare('SELECT COUNT(*) as count FROM inquiries').get().count;
    const unreadInquiries = db.prepare("SELECT COUNT(*) as count FROM inquiries WHERE status = 'Unread'").get().count;
    const averageRating = db.prepare('SELECT AVG(rating) as avg_rating FROM products').get().avg_rating || 4.8;

    res.json({
      totalProducts,
      totalStockUnits: totalStock.stock || 0,
      inventoryValuation: Math.round(totalStock.valuation || 0),
      totalQuotes,
      pendingQuotes,
      totalInquiries,
      unreadInquiries,
      averageRating: Number(averageRating.toFixed(1))
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch statistics', details: err.message });
  }
});

// -------------------------------------------------------------
// API: Categories
// -------------------------------------------------------------
app.get('/api/categories', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.display_order ASC
    `).all();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load categories', details: err.message });
  }
});

// -------------------------------------------------------------
// API: Products
// -------------------------------------------------------------
app.get('/api/products', (req, res) => {
  try {
    const { category, search, sort, minPrice, maxPrice, featured } = req.query;

    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category && category !== 'all') {
      query += ' AND (category_id = ? OR category_name = ?)';
      params.push(category, category);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ' AND (name LIKE ? OR brand LIKE ? OR material LIKE ? OR description LIKE ? OR sku LIKE ?)';
      params.push(term, term, term, term, term);
    }

    if (minPrice) {
      query += ' AND price >= ?';
      params.push(Number(minPrice));
    }

    if (maxPrice) {
      query += ' AND price <= ?';
      params.push(Number(maxPrice));
    }

    if (featured === '1' || featured === 'true') {
      query += ' AND is_featured = 1';
    }

    // Sorting
    switch (sort) {
      case 'price_asc':
        query += ' ORDER BY price ASC';
        break;
      case 'price_desc':
        query += ' ORDER BY price DESC';
        break;
      case 'rating':
        query += ' ORDER BY rating DESC';
        break;
      case 'name_asc':
        query += ' ORDER BY name ASC';
        break;
      default:
        query += ' ORDER BY is_featured DESC, id ASC';
    }

    const rows = db.prepare(query).all(...params);

    // Parse features and specs for each row
    const products = rows.map(r => ({
      ...r,
      features: r.features_json ? JSON.parse(r.features_json) : [],
      specs: r.specs_json ? JSON.parse(r.specs_json) : {}
    }));

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products', details: err.message });
  }
});

// Get single product with reviews
app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const reviews = db.prepare(`
      SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    product.features = product.features_json ? JSON.parse(product.features_json) : [];
    product.specs = product.specs_json ? JSON.parse(product.specs_json) : {};
    product.reviews = reviews;

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve product', details: err.message });
  }
});

// Admin: Create product
app.post('/api/products', (req, res) => {
  try {
    const {
      name, sku, brand, category_name, price, mrp, stock,
      material, size, finish, hardness, description,
      features, specs, image_url, badge, is_featured
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    // Find category ID if exists
    let catId = null;
    if (category_name) {
      const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(category_name);
      if (cat) catId = cat.id;
    }

    const generatedSku = sku || `AVS-${Date.now().toString().slice(-6)}`;
    const featuresJson = typeof features === 'object' ? JSON.stringify(features) : (features || '[]');
    const specsJson = typeof specs === 'object' ? JSON.stringify(specs) : (specs || '{}');

    const result = db.prepare(`
      INSERT INTO products (
        name, sku, brand, category_id, category_name, price, mrp, stock,
        material, size, finish, hardness, description, features_json, specs_json,
        image_url, badge, rating, reviews_count, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5.0, 0, ?)
    `).run(
      name,
      generatedSku,
      brand || 'AVS Tools',
      catId,
      category_name || 'Hand Tools',
      Number(price),
      Number(mrp || price * 1.3),
      Number(stock || 50),
      material || 'Drop Forged Alloy Steel',
      size || 'Standard',
      finish || 'Satin Chrome Plated',
      hardness || '50 - 55 HRC',
      description || '',
      featuresJson,
      specsJson,
      image_url || '/images/products/konica-12pc-spanner-set.jpg',
      badge || 'NEW ARRIVAL',
      is_featured ? 1 : 0
    );

    res.status(201).json({ success: true, id: result.lastInsertRowid, message: 'Product added successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create product', details: err.message });
  }
});

// Admin: Update product
app.put('/api/products/:id', (req, res) => {
  try {
    const {
      name, sku, brand, category_name, price, mrp, stock,
      material, size, finish, hardness, description,
      image_url, badge, is_featured
    } = req.body;

    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let catId = existing.category_id;
    if (category_name) {
      const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(category_name);
      if (cat) catId = cat.id;
    }

    db.prepare(`
      UPDATE products SET
        name = ?, sku = ?, brand = ?, category_id = ?, category_name = ?,
        price = ?, mrp = ?, stock = ?, material = ?, size = ?,
        finish = ?, hardness = ?, description = ?, image_url = ?,
        badge = ?, is_featured = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name : existing.name,
      sku !== undefined ? sku : existing.sku,
      brand !== undefined ? brand : existing.brand,
      catId,
      category_name !== undefined ? category_name : existing.category_name,
      price !== undefined ? Number(price) : existing.price,
      mrp !== undefined ? Number(mrp) : existing.mrp,
      stock !== undefined ? Number(stock) : existing.stock,
      material !== undefined ? material : existing.material,
      size !== undefined ? size : existing.size,
      finish !== undefined ? finish : existing.finish,
      hardness !== undefined ? hardness : existing.hardness,
      description !== undefined ? description : existing.description,
      image_url !== undefined ? image_url : existing.image_url,
      badge !== undefined ? badge : existing.badge,
      is_featured !== undefined ? (is_featured ? 1 : 0) : existing.is_featured,
      req.params.id
    );

    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product', details: err.message });
  }
});

// Admin: Delete product
app.delete('/api/products/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product', details: err.message });
  }
});

// -------------------------------------------------------------
// API: Quotations & B2B Orders
// -------------------------------------------------------------
app.post('/api/quotes', (req, res) => {
  try {
    const {
      customer_name, company_name, email, phone,
      city, state, gst_number, items, notes
    } = req.body;

    if (!customer_name || !phone || !email || !items || !items.length) {
      return res.status(400).json({ error: 'Customer name, phone, email, and at least one item are required' });
    }

    const quoteNo = `AVS-RFQ-${Date.now().toString().slice(-6)}`;
    const totalItems = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const totalEstimated = items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);

    const result = db.prepare(`
      INSERT INTO quotes (
        quote_no, customer_name, company_name, email, phone,
        city, state, gst_number, items_json, total_items, total_estimated, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
    `).run(
      quoteNo,
      customer_name,
      company_name || 'Retail Customer / Sole Proprietor',
      email,
      phone,
      city || 'N/A',
      state || 'N/A',
      gst_number || '',
      JSON.stringify(items),
      totalItems,
      totalEstimated,
      notes || ''
    );

    res.status(201).json({
      success: true,
      quoteNo,
      id: result.lastInsertRowid,
      totalEstimated,
      message: 'Quotation request submitted to database successfully'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit quote request', details: err.message });
  }
});

app.get('/api/quotes', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all();
    const quotes = rows.map(q => ({
      ...q,
      items: q.items_json ? JSON.parse(q.items_json) : []
    }));
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quotes', details: err.message });
  }
});

app.patch('/api/quotes/:id/status', (req, res) => {
  try {
    const { status, remarks } = req.body;
    db.prepare('UPDATE quotes SET status = ?, notes = COALESCE(?, notes) WHERE id = ?').run(
      status, remarks || null, req.params.id
    );
    res.json({ success: true, message: 'Quote status updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update quote status', details: err.message });
  }
});

// -------------------------------------------------------------
// API: Dealer Inquiries & Contact
// -------------------------------------------------------------
app.post('/api/inquiries', (req, res) => {
  try {
    const { name, email, phone, subject, message, inquiry_type } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required' });
    }

    const result = db.prepare(`
      INSERT INTO inquiries (name, email, phone, subject, message, inquiry_type, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Unread')
    `).run(
      name,
      email,
      phone || '',
      subject || 'Distributor / Dealer Inquiry',
      message,
      inquiry_type || 'General'
    );

    res.status(201).json({
      success: true,
      id: result.lastInsertRowid,
      message: 'Inquiry saved in database. An AVS technical representative will connect shortly.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save inquiry', details: err.message });
  }
});

app.get('/api/inquiries', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inquiries', details: err.message });
  }
});

app.patch('/api/inquiries/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, message: 'Inquiry status updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update inquiry status', details: err.message });
  }
});

// -------------------------------------------------------------
// API: Customer Reviews
// -------------------------------------------------------------
app.post('/api/reviews', (req, res) => {
  try {
    const { product_id, author, rating, headline, comment, company_or_trade } = req.body;

    if (!product_id || !author || !rating || !comment) {
      return res.status(400).json({ error: 'Product ID, author name, rating, and comment are required' });
    }

    const numRating = Math.max(1, Math.min(5, Number(rating)));

    db.prepare(`
      INSERT INTO reviews (product_id, author, rating, headline, comment, company_or_trade, verified_purchase)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      product_id,
      author,
      numRating,
      headline || 'Verified Professional Review',
      comment,
      company_or_trade || 'Trade Professional'
    );

    // Update product rating summary
    const avgData = db.prepare(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE product_id = ?
    `).get(product_id);

    db.prepare(`
      UPDATE products SET rating = ?, reviews_count = ? WHERE id = ?
    `).run(
      Number(avgData.avg_rating.toFixed(1)),
      avgData.count,
      product_id
    );

    res.status(201).json({ success: true, message: 'Review recorded in database' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save review', details: err.message });
  }
});

// Fallback route to serve index.html for SPA routes
app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` AVS TOOLS - Industrial Hand Tools Portal & Database`);
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(` Database:   ${DB_PATH}`);
  console.log(`=======================================================`);
});
