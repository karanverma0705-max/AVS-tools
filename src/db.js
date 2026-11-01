const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'avs_tools.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency & performance
try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
} catch (err) {
  console.warn('PRAGMA config warning:', err.message);
}

// Initialize tables
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      icon TEXT,
      display_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      brand TEXT NOT NULL,
      category_id INTEGER,
      category_name TEXT NOT NULL,
      price REAL NOT NULL,
      mrp REAL NOT NULL,
      stock INTEGER DEFAULT 50,
      material TEXT NOT NULL,
      size TEXT NOT NULL,
      finish TEXT,
      hardness TEXT,
      description TEXT,
      features_json TEXT,
      specs_json TEXT,
      image_url TEXT NOT NULL,
      badge TEXT,
      rating REAL DEFAULT 4.8,
      reviews_count INTEGER DEFAULT 12,
      is_featured INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_no TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      company_name TEXT,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT,
      state TEXT,
      gst_number TEXT,
      items_json TEXT NOT NULL,
      total_items INTEGER DEFAULT 1,
      total_estimated REAL DEFAULT 0,
      notes TEXT,
      status TEXT DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      subject TEXT,
      message TEXT NOT NULL,
      inquiry_type TEXT DEFAULT 'General',
      status TEXT DEFAULT 'Unread',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      headline TEXT,
      comment TEXT NOT NULL,
      company_or_trade TEXT,
      verified_purchase INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'Super Admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed admins if empty
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
  if (adminCount === 0) {
    seedAdmins();
  }

  // Seed categories if empty
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (catCount === 0) {
    seedCategories();
  }

  // Seed products if empty
  const prodCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (prodCount === 0) {
    seedProducts();
  }

  // Seed initial reviews if empty
  const revCount = db.prepare('SELECT COUNT(*) as count FROM reviews').get().count;
  if (revCount === 0) {
    seedReviews();
  }
}

const crypto = require('node:crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

function seedAdmins() {
  const insertAdmin = db.prepare(`
    INSERT INTO admins (username, password_hash, name, role)
    VALUES (?, ?, ?, ?)
  `);

  // Default credentials: admin / avstools2026
  insertAdmin.run(
    'admin',
    hashPassword('avstools2026'),
    'AVS Administrator',
    'Super Admin'
  );
  console.log('Seeded default admin: admin / avstools2026');
}

function seedCategories() {
  const insertCat = db.prepare(`
    INSERT INTO categories (name, slug, description, icon, display_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  const categories = [
    { name: 'Spanners & Wrenches', slug: 'spanners-wrenches', desc: 'Combination, ring, double open-end, and precision adjustable wrenches', icon: 'fa-wrench', order: 1 },
    { name: 'Pliers & Grips', slug: 'pliers-grips', desc: 'Heavy duty combination, long nose, circlip, and locking pliers', icon: 'fa-tools', order: 2 },
    { name: 'Shears & Snips', slug: 'shears-snips', desc: 'Aviation tin snips, metal wire cutters, and spring-loaded shears', icon: 'fa-cut', order: 3 },
    { name: 'Insulated Tools', slug: 'insulated-tools', desc: '500V & 1000V dielectric certified electrician hand tools', icon: 'fa-bolt', order: 4 },
    { name: 'Striking & Hammers', slug: 'striking-hammers', desc: 'Machinist, claw, and ball peen drop-forged impact tools', icon: 'fa-hammer', order: 5 },
    { name: 'Tool Sets & Kits', slug: 'tool-sets', desc: 'Industrial multi-piece professional workshop sets', icon: 'fa-toolbox', order: 6 },
  ];

  for (const cat of categories) {
    insertCat.run(cat.name, cat.slug, cat.desc, cat.icon, cat.order);
  }
}

function seedProducts() {
  const insertProd = db.prepare(`
    INSERT INTO products (
      name, sku, brand, category_id, category_name, price, mrp, stock,
      material, size, finish, hardness, description, features_json, specs_json,
      image_url, badge, rating, reviews_count, is_featured
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const products = [
    {
      name: 'KONICA 12-Piece Combination / DOE / Ring Spanner Set',
      sku: 'AVS-KON-12SP',
      brand: 'KONICA',
      category_id: 1,
      category_name: 'Spanners & Wrenches',
      price: 1299.00,
      mrp: 1850.00,
      stock: 75,
      material: 'Drop Forged Chrome Vanadium (CR-V) Steel',
      size: '12 Pcs (6mm to 32mm range)',
      finish: 'Satin Chrome Anti-Glare & Rust Resistant',
      hardness: '44 - 48 HRC',
      description: 'The KONICA 12-Piece Combination Spanner Set is drop forged from industrial grade Chrome Vanadium steel and thoroughly heat treated for superior tensile strength and torque resistance. Features a 15-degree offset ring end for knuckle clearance and a snug open end for high-torque fastening without fastener rounding.',
      features_json: JSON.stringify([
        '100% Drop Forged Chrome Vanadium Steel for extreme heavy duty torque',
        'Precision 15° angled 12-point ring head for tight clearance work',
        'Anti-rounding jaw geometry grips fastener flats instead of corners',
        'Includes rugged heavy-duty rack organizer with wall-mount capability',
        'QR-code verified authentic industrial manufacturing quality'
      ]),
      specs_json: JSON.stringify({
        'Pieces In Set': '12 Pieces',
        'Sizes Included': '6mm, 7mm, 8mm, 9mm, 10mm, 11mm, 12mm, 13mm, 14mm, 17mm, 19mm, 22mm',
        'Standard Compliance': 'DIN 3113 / ISO 7738',
        'Surface Treatment': 'Nickel Chrome Mirror/Satin Plated',
        'Weight': '1.85 kg'
      }),
      image_url: '/images/products/konica-12pc-spanner-set.jpg',
      badge: 'BESTSELLER • 12 PCS SET',
      rating: 4.9,
      reviews_count: 38,
      is_featured: 1
    },
    {
      name: 'NBH Platinum CR-V 8" / 200mm Heavy Duty Combination Plier',
      sku: 'AVS-NBH-PL8',
      brand: 'NBH Platinum',
      category_id: 2,
      category_name: 'Pliers & Grips',
      price: 380.00,
      mrp: 550.00,
      stock: 120,
      material: 'Chrome Vanadium (CR-V) Steel',
      size: '8 Inch (200 mm)',
      finish: 'Black Phosphated Corrosion-Resistant with Polished Face',
      hardness: 'Cutting Edges 60 - 64 HRC',
      description: 'Engineered for tough industrial maintenance and electrical trades, the NBH Platinum 200mm Combination Plier features high-leverage eccentric pivot geometry that multiplies gripping power by up to 35%. Equipped with induction-hardened cutting jaws and heavy-duty dual-color TPR ergonomic handles for slip-free control.',
      features_json: JSON.stringify([
        'High-leverage eccentric joint design requires 35% less effort to cut hard wire',
        'Induction-hardened precision cutting edges capable of cutting piano & spring wire',
        'Serrated pipe grip area designed for gripping round, flat, and hexagonal stock',
        'Ergonomic flared two-tone yellow & black non-slip safety handles',
        'Authentic CR-V stamped center pivot medallion'
      ]),
      specs_json: JSON.stringify({
        'Length': '200 mm (8 Inches)',
        'Cutting Capacity Hard Wire': '2.5 mm',
        'Cutting Capacity Medium Wire': '3.8 mm',
        'Handle Material': 'Heavy Duty Dual-Color Grip (Oil & Acid Resistant)',
        'Origin': 'Proudly Made in India'
      }),
      image_url: '/images/products/nbh-platinum-combination-plier.jpg',
      badge: 'CR-V HEAVY DUTY',
      rating: 4.8,
      reviews_count: 52,
      is_featured: 1
    },
    {
      name: 'AVS Pro Industrial Spring-Loaded Sheet Metal Snip & Shear',
      sku: 'AVS-BARRY-SN8',
      brand: 'BARRY Pro',
      category_id: 3,
      category_name: 'Shears & Snips',
      price: 420.00,
      mrp: 620.00,
      stock: 90,
      material: 'Drop-Forged High-Carbon Alloy Steel',
      size: '8.5 Inch (215 mm)',
      finish: 'Black Oxide Anti-Corrosion with Ground Precision Blades',
      hardness: '58 - 62 HRC',
      description: 'Built for industrial HVAC technicians, metal fabrication workshops, and roofer contractors. This straight-cut metal shear features hardened ground shear blades with internal heavy-duty spring return mechanism, safety lock strap, and dipped orange cushion grips for rapid, fatigue-free repetitive cutting.',
      features_json: JSON.stringify([
        'Internal coiled return spring delivers automatic blade opening for rapid cuts',
        'Precision ground drop-forged shearing blades prevent material slippage',
        'Heavy-duty safety latch keeps blades safely closed during storage & transit',
        'Thick orange dip-molded ergonomic handle shields hands from vibration',
        'Cuts cold-rolled sheet steel, tin, copper, aluminum, and wire mesh'
      ]),
      specs_json: JSON.stringify({
        'Overall Length': '215 mm (8.5 Inch)',
        'Blade Length': '45 mm',
        'Cutting Capacity Cold Rolled Steel': '1.2 mm (18 Gauge)',
        'Cutting Capacity Stainless Steel': '0.8 mm (22 Gauge)',
        'Mechanism': 'Spring-Assisted Self-Opening Pivot'
      }),
      image_url: '/images/products/orange-spring-tin-snip.jpg',
      badge: 'SPRING LOADED • FAST CUT',
      rating: 4.8,
      reviews_count: 29,
      is_featured: 1
    },
    {
      name: 'AVS Precision Red-Grip Long Nose / Needle Nose Plier',
      sku: 'AVS-PRE-LN6',
      brand: 'AVS Precision',
      category_id: 2,
      category_name: 'Pliers & Grips',
      price: 290.00,
      mrp: 420.00,
      stock: 110,
      material: 'Forged Chrome-Nickel Alloy Steel',
      size: '6.5 Inch (165 mm)',
      finish: 'Micro-Polished Head with Anti-Rust Clear Coat',
      hardness: '56 - 60 HRC',
      description: 'Engineered for precision wiring, control panel assembly, mechanics, and delicate gripping tasks in restricted areas. Features cross-hatched serrated slender jaws for dependable grip and integrated precision cutting edges for copper and medium-hard alloy wires.',
      features_json: JSON.stringify([
        'Extra-long slender tapered jaws reach into confined mechanical & electrical spaces',
        'Cross-cut serrations on jaw tips provide secure hold without slip',
        'Built-in precision side wire cutter for clean, flush wire trimming',
        'Smooth pivot mechanism with zero lateral play for repeatable alignment',
        'Comfortable contoured red insulated handles with protective finger stops'
      ]),
      specs_json: JSON.stringify({
        'Length': '165 mm (6.5 Inches)',
        'Jaw Length': '52 mm',
        'Tip Width': '2.5 mm',
        'Cutting Capacity Copper Wire': '2.8 mm',
        'Grip Type': 'High-Dielectric Red Cushion Vinyl'
      }),
      image_url: '/images/products/red-long-nose-plier.jpg',
      badge: 'PRECISION REACH',
      rating: 4.7,
      reviews_count: 24,
      is_featured: 1
    },
    {
      name: 'Mr. Silver 8" / 200mm 500V Insulated Combination Plier',
      sku: 'AVS-SLV-500V',
      brand: 'Mr. Silver',
      category_id: 4,
      category_name: 'Insulated Tools',
      price: 340.00,
      mrp: 499.00,
      stock: 85,
      material: 'Drop Forged Special Tool Steel',
      size: '8 Inch (200 mm)',
      finish: 'Polished Mirror Face with Blackened Recess',
      hardness: '58 - 62 HRC',
      description: 'Manufactured for electrical utility workers, industrial maintenance contractors, and commercial electricians. The Mr. Silver 200mm insulated combination plier is certified with heavy-wall 500V dielectric handles featuring enlarged protective finger stops to prevent inadvertent contact with live conductors.',
      features_json: JSON.stringify([
        'Tested and rated for 500V electrical insulation and safety',
        'Prominent molded finger guards prevent hand slippage toward live metal parts',
        'Precision machined gripping teeth hold cables and conduit firmly',
        'Induction hardened cutting edges for copper, aluminum, and hard steel conductors',
        'Deep blue ribbed handle grips ensure firm grip even with oily or gloved hands'
      ]),
      specs_json: JSON.stringify({
        'Size': '200 mm (8 Inches)',
        'Insulation Rating': '500 Volts AC / 750 Volts DC',
        'Standards': 'IS / IEC Electrical Hand Tool Standards',
        'Jaw Capacity': 'Up to 35 mm',
        'Weight': '370 g'
      }),
      image_url: '/images/products/mr-silver-insulated-plier.jpg',
      badge: '500V DIELECTRIC',
      rating: 4.9,
      reviews_count: 41,
      is_featured: 1
    },
    {
      name: 'AVS Master 12" / 300mm Chrome Vanadium Adjustable Wrench',
      sku: 'AVS-MST-AD12',
      brand: 'AVS Master',
      category_id: 1,
      category_name: 'Spanners & Wrenches',
      price: 650.00,
      mrp: 890.00,
      stock: 60,
      material: 'Drop-Forged Chrome Vanadium (CR-V)',
      size: '12 Inch (300 mm) / 40mm Jaw Opening',
      finish: 'Satin Chrome Anti-Glare Finish',
      hardness: '46 - 50 HRC',
      description: 'Heavy duty adjustable wrench engineered with wide-capacity 40mm jaw opening and precision 4-thread knurl adjustment. Laser-etched metric mm rule markings on the jaw face allow quick pre-adjustment to exact fastener dimensions before engagement.',
      features_json: JSON.stringify([
        'Ultra-wide jaw opening up to 40 mm (exceeds standard 300mm wrenches by 20%)',
        'Permanent laser-etched metric mm and inch graduations for rapid sizing',
        'Precision machined worm-gear knurl eliminates jaw play and slack under torque',
        'Ergonomic I-beam shank spreads contact pressure comfortably across palm',
        'Drop-forged Chrome Vanadium steel provides superior torque-to-weight ratio'
      ]),
      specs_json: JSON.stringify({
        'Total Length': '300 mm (12 Inch)',
        'Maximum Jaw Opening': '40 mm (1.57 Inch)',
        'Torque Rating': 'Meets and exceeds ASME B107.8M specifications',
        'Finish': 'Satin Chrome Electroless Plating',
        'Jaw Scale': 'Dual Metric mm & Imperial Inches'
      }),
      image_url: '/images/products/adjustable-wrench.jpg',
      badge: 'LASER SCALE • 40MM WIDE',
      rating: 4.9,
      reviews_count: 33,
      is_featured: 1
    },
    {
      name: 'AVS Industrial 16oz Forged Steel Anti-Vibration Claw Hammer',
      sku: 'AVS-IND-HM16',
      brand: 'AVS Industrial',
      category_id: 5,
      category_name: 'Striking & Hammers',
      price: 480.00,
      mrp: 690.00,
      stock: 55,
      material: 'Single-Piece Drop-Forged Carbon Steel (C45)',
      size: '16 oz (450g head)',
      finish: 'Polished Striking Face with Baked Black Enamel',
      hardness: 'Face 52 - 56 HRC',
      description: 'Forged from high-carbon C45 steel, this industrial 16oz claw hammer features a precision-machined crown striking face to reduce glancing blows, curved claws for powerful nail pulling leverage, and a dual-material ergonomic rubber handle that dampens impact vibration by up to 70%.',
      features_json: JSON.stringify([
        'Drop-forged solid steel construction guarantees unbreakable head-to-shaft bond',
        'Precision-balanced head-to-handle weight ratio maximizes driving efficiency',
        'High-curved claw design delivers maximum mechanical pulling leverage',
        'Patented shock-reduction rubberized sleeve dampens repetitive arm fatigue',
        'Induction-hardened rim resists chipping and spalling during heavy strikes'
      ]),
      specs_json: JSON.stringify({
        'Head Weight': '16 oz (450 grams)',
        'Overall Length': '330 mm',
        'Handle Core': 'Fiberglass core with dual-molded TPR outer grip',
        'Striking Face': 'Smooth Crowned Face',
        'Standards': 'BS 876 / DIN 7239'
      }),
      image_url: '/images/products/machinist-hammer.jpg',
      badge: 'SHOCK REDUCTION • 16 OZ',
      rating: 4.8,
      reviews_count: 19,
      is_featured: 1
    }
  ];

  for (const p of products) {
    insertProd.run(
      p.name, p.sku, p.brand, p.category_id, p.category_name, p.price, p.mrp, p.stock,
      p.material, p.size, p.finish, p.hardness, p.description, p.features_json, p.specs_json,
      p.image_url, p.badge, p.rating, p.reviews_count, p.is_featured
    );
  }
}

function seedReviews() {
  const insertRev = db.prepare(`
    INSERT INTO reviews (product_id, author, rating, headline, comment, company_or_trade, verified_purchase)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const reviews = [
    {
      product_id: 1,
      author: 'Rajesh Sharma',
      rating: 5,
      headline: 'Exceptional build quality for diesel engine maintenance',
      comment: 'We run a heavy vehicle garage in Ludhiana and have been using this 12-piece Konica set daily for over 4 months. The ring fit on rusty 19mm and 22mm bolts is very snug, zero slip or rounding. True CR-V steel.',
      company_or_trade: 'Sharma Diesel Works',
      verified_purchase: 1
    },
    {
      product_id: 1,
      author: 'Amit Patel',
      rating: 5,
      headline: 'Best value industrial spanner set on the market',
      comment: 'The carrying rack keeps everything organized in our service van. Beautiful satin chrome finish that does not peel even when cleaned with brake cleaner.',
      company_or_trade: 'Patel Engineering Services',
      verified_purchase: 1
    },
    {
      product_id: 2,
      author: 'Gurpreet Singh',
      rating: 5,
      headline: 'High leverage makes cutting 2.5mm GI wire effortless',
      comment: 'The pivot position on this NBH plier gives noticeable mechanical advantage compared to conventional pliers. The yellow-black grips have excellent palm padding.',
      company_or_trade: 'Apex Fabrication',
      verified_purchase: 1
    },
    {
      product_id: 3,
      author: 'Manoj Verma',
      rating: 5,
      headline: 'Saves hands during long HVAC ducting installations',
      comment: 'The internal spring works reliably and does not jam. Cut through 18-gauge galvanized sheet metal smoothly without jagged burrs.',
      company_or_trade: 'Verma Aircon Solutions',
      verified_purchase: 1
    },
    {
      product_id: 5,
      author: 'Sunil Kumar',
      rating: 5,
      headline: 'Reliable 500V insulation for switchboard works',
      comment: 'Heavy duty insulated sleeves with thick safety collars give peace of mind when working on live distribution panels. Solid gripping jaw.',
      company_or_trade: 'VoltTech Electricals',
      verified_purchase: 1
    }
  ];

  for (const r of reviews) {
    insertRev.run(r.product_id, r.author, r.rating, r.headline, r.comment, r.company_or_trade, r.verified_purchase);
  }
}

// Initialize on load
initializeDatabase();

module.exports = {
  db,
  DB_PATH,
  hashPassword,
  verifyPassword
};
