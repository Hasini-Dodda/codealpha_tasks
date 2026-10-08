const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'shop.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, description TEXT, emoji TEXT, stock INTEGER NOT NULL DEFAULT 10);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, total REAL NOT NULL, address TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, qty INTEGER NOT NULL, price REAL NOT NULL);
`);

if (db.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
  const ins = db.prepare('INSERT INTO products (name,price,description,emoji,stock) VALUES (?,?,?,?,?)');
  [
    ['Wireless Headphones', 59.99, 'Over-ear Bluetooth headphones with 30h battery life.', '🎧', 15],
    ['Smart Watch', 89.5, 'Track steps, sleep and heart rate on your wrist.', '⌚', 10],
    ['Backpack', 39.0, 'Water-resistant 25L backpack with laptop sleeve.', '🎒', 20],
    ['Sneakers', 74.0, 'Lightweight everyday running shoes.', '👟', 12],
    ['Coffee Mug', 12.5, 'Ceramic 350ml mug, dishwasher safe.', '☕', 50],
    ['Sunglasses', 24.99, 'UV400 polarized sunglasses.', '🕶️', 25],
    ['Desk Lamp', 31.0, 'LED lamp with adjustable brightness.', '💡', 18],
    ['Notebook Set', 9.99, 'Pack of 3 ruled notebooks.', '📓', 40],
  ].forEach(p => ins.run(...p));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sign = u => jwt.sign({ id: u.id, name: u.name }, SECRET, { expiresIn: '7d' });
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(t, SECRET); next(); }
  catch { res.status(401).json({ error: 'Please log in first' }); }
}

// ---- Auth ----
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a 6+ character password are required' });
  try {
    const r = db.prepare('INSERT INTO users (name,email,password) VALUES (?,?,?)')
      .run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10));
    res.json({ token: sign({ id: r.lastInsertRowid, name }), name });
  } catch { res.status(409).json({ error: 'Email already registered' }); }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.password))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(u), name: u.name });
});

// ---- Products ----
app.get('/api/products', (req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(db.prepare('SELECT * FROM products WHERE name LIKE ? ORDER BY id').all(q));
});
app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  p ? res.json(p) : res.status(404).json({ error: 'Product not found' });
});

// ---- Orders ----
app.post('/api/orders', auth, (req, res) => {
  const { items, address } = req.body || {};
  if (!Array.isArray(items) || !items.length || !address)
    return res.status(400).json({ error: 'Cart and shipping address are required' });
  const place = db.transaction(() => {
    let total = 0;
    const rows = items.map(i => {
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(i.id);
      const qty = parseInt(i.qty, 10);
      if (!p || !(qty > 0)) throw new Error('Invalid item in cart');
      if (p.stock < qty) throw new Error(`Not enough stock for ${p.name}`);
      total += p.price * qty;
      return { p, qty };
    });
    const o = db.prepare('INSERT INTO orders (user_id,total,address) VALUES (?,?,?)').run(req.user.id, total, address);
    rows.forEach(({ p, qty }) => {
      db.prepare('INSERT INTO order_items (order_id,product_id,qty,price) VALUES (?,?,?,?)').run(o.lastInsertRowid, p.id, qty, p.price);
      db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(qty, p.id);
    });
    return { orderId: o.lastInsertRowid, total };
  });
  try { res.json(place()); } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/orders', auth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  orders.forEach(o => {
    o.items = db.prepare('SELECT oi.qty, oi.price, p.name, p.emoji FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE order_id=?').all(o.id);
  });
  res.json(orders);
});

app.listen(PORT, () => console.log(`E-commerce running on http://localhost:${PORT}`));
