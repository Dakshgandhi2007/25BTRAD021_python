require('dotenv').config();
const express = require('express'), { Pool } = require('pg'), bcrypt = require('bcryptjs'),
  jwt = require('jsonwebtoken'), cookieParser = require('cookie-parser'),
  multer = require('multer'), path = require('path');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const SECRET = process.env.JWT_SECRET || 'dev-secret';
const app = express();
app.set('trust proxy', 1);
const PUB = path.join(__dirname, 'public');
app.use(express.json(), cookieParser(), express.static(PUB));
app.get('/', (q, s) => s.sendFile(path.join(PUB, 'index.html')));
let ready; // database setup runs once per server start (works on Vercel cold starts too)
app.use('/api', (q, s, n) => { ready = ready || init(); ready.then(() => n()).catch(e => { ready = null; console.error(e); s.status(500).json({ error: 'Database is not reachable. Check DATABASE_URL.' }); }); });
const mu = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 }, fileFilter: (q, f, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(f.mimetype)) }).single('image');
const upload = (q, s, n) => mu(q, s, e => e ? s.status(400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 3 MB' : 'Could not read that image' }) : n());

const wrap = f => (q, s) => f(q, s).catch(e => { console.error(e); s.status(500).json({ error: 'Something went wrong. Try again.' }); });
const auth = (q, s, n) => { try { q.user = jwt.verify(q.cookies.t, SECRET); n(); } catch { s.status(401).json({ error: 'Log in to continue' }); } };
const login = (s, u) => s.cookie('t', jwt.sign({ id: u.id, name: u.name }, SECRET, { expiresIn: '7d' }), { httpOnly: true, sameSite: 'lax', secure: !!process.env.VERCEL, maxAge: 6048e5 });
const CATS = ['clothes', 'shoes', 'accessories', 'jewellery'];

app.post('/api/signup', wrap(async (q, s) => {
  const { name, email, password } = q.body;
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 6)
    return s.status(400).json({ error: 'Enter a name, a valid email and a password of 6+ characters' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name', [name.trim(), email.toLowerCase(), hash]);
    login(s, rows[0]); s.json({ user: rows[0] });
  } catch (e) { if (e.code === '23505') return s.status(409).json({ error: 'That email already has an account' }); throw e; }
}));
app.post('/api/login', wrap(async (q, s) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [(q.body.email || '').toLowerCase()]);
  if (!rows[0] || !(await bcrypt.compare(q.body.password || '', rows[0].password_hash)))
    return s.status(401).json({ error: 'Email or password is incorrect' });
  login(s, rows[0]); s.json({ user: { id: rows[0].id, name: rows[0].name } });
}));
app.post('/api/logout', (q, s) => { s.clearCookie('t'); s.json({ ok: true }); });
app.get('/api/me', (q, s) => { try { s.json({ user: jwt.verify(q.cookies.t, SECRET) }); } catch { s.json({ user: null }); } });

app.get('/api/items', wrap(async (q, s) => {
  const { category, mode, q: term } = q.query, w = ["i.status='available'"], p = [];
  if (CATS.includes(category)) { p.push(category); w.push(`i.category=$${p.length}`); }
  if (['rent', 'sell'].includes(mode)) { p.push(mode); w.push(`i.mode=$${p.length}`); }
  if (term) { p.push('%' + term + '%'); w.push(`(i.title ILIKE $${p.length} OR i.description ILIKE $${p.length})`); }
  const { rows } = await pool.query(`SELECT i.id,i.owner_id,i.title,i.description,i.category,i.mode,i.price,i.status,i.created_at,(i.image IS NOT NULL) has_image,u.name owner FROM items i JOIN users u ON u.id=i.owner_id WHERE ${w.join(' AND ')} ORDER BY i.created_at DESC LIMIT 60`, p);
  s.json(rows);
}));
app.post('/api/items', auth, upload, wrap(async (q, s) => {
  const { title, description, category, mode, price } = q.body;
  if (!title || !CATS.includes(category) || !['rent', 'sell'].includes(mode) || !(price > 0))
    return s.status(400).json({ error: 'Add a title, category, rent or sell, and a price above 0' });
  const { rows } = await pool.query('INSERT INTO items(owner_id,title,description,category,mode,price,image,image_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [q.user.id, title.trim(), (description || '').trim(), category, mode, price, q.file ? q.file.buffer : null, q.file ? q.file.mimetype : null]);
  s.json(rows[0]);
}));
app.get('/api/items/:id/image', wrap(async (q, s) => {
  const { rows } = await pool.query('SELECT image,image_type FROM items WHERE id=$1', [q.params.id]);
  if (!rows[0] || !rows[0].image) return s.sendStatus(404);
  s.set({ 'Content-Type': rows[0].image_type, 'Cache-Control': 'public, max-age=86400' }).send(rows[0].image);
}));
app.post('/api/items/:id/order', auth, wrap(async (q, s) => {
  const { rows } = await pool.query("SELECT * FROM items WHERE id=$1 AND status='available'", [q.params.id]);
  const it = rows[0];
  if (!it) return s.status(404).json({ error: 'This item is no longer available' });
  if (it.owner_id === q.user.id) return s.status(400).json({ error: "You can't order your own item" });
  const days = it.mode === 'rent' ? Math.min(Math.max(parseInt(q.body.days) || 1, 1), 30) : 1;
  await pool.query('INSERT INTO orders(item_id,buyer_id,kind,days,total) VALUES($1,$2,$3,$4,$5)', [it.id, q.user.id, it.mode, days, it.price * days]);
  if (it.mode === 'sell') await pool.query("UPDATE items SET status='sold' WHERE id=$1", [it.id]);
  s.json({ ok: true, total: it.price * days });
}));
app.delete('/api/items/:id', auth, wrap(async (q, s) => {
  await pool.query('DELETE FROM items WHERE id=$1 AND owner_id=$2', [q.params.id, q.user.id]); s.json({ ok: true });
}));
app.get('/api/mine', auth, wrap(async (q, s) => {
  const items = (await pool.query('SELECT id,title,category,mode,price,status,(image IS NOT NULL) has_image FROM items WHERE owner_id=$1 ORDER BY created_at DESC', [q.user.id])).rows;
  const orders = (await pool.query('SELECT o.*,i.title FROM orders o JOIN items i ON i.id=o.item_id WHERE o.buyer_id=$1 ORDER BY o.created_at DESC', [q.user.id])).rows;
  s.json({ items, orders });
}));

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS items(id SERIAL PRIMARY KEY, owner_id INT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT DEFAULT '', category TEXT NOT NULL, mode TEXT NOT NULL, price NUMERIC(10,2) NOT NULL, status TEXT DEFAULT 'available', created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY, item_id INT REFERENCES items(id) ON DELETE CASCADE, buyer_id INT REFERENCES users(id) ON DELETE CASCADE, kind TEXT, days INT, total NUMERIC(10,2), created_at TIMESTAMPTZ DEFAULT now());
    ALTER TABLE items ADD COLUMN IF NOT EXISTS image BYTEA; ALTER TABLE items ADD COLUMN IF NOT EXISTS image_type TEXT;`);
  if (!(await pool.query('SELECT 1 FROM items LIMIT 1')).rowCount) {
    const u = (await pool.query("INSERT INTO users(name,email,password_hash) VALUES('Lendloom Team','team@lendloom.local',$1) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name RETURNING id", [await bcrypt.hash(Math.random().toString(36), 10)])).rows[0];
    const seed = [['Emerald silk saree','Festival-ready, dry cleaned','clothes','rent',799],['Navy bandhgala blazer','Size 40, worn twice','clothes','rent',599],['White leather sneakers','UK 8, barely used','shoes','sell',2499],['Block heel sandals','UK 5, great for weddings','shoes','rent',349],['Tan crossbody bag','Fits a phone and a water bottle','accessories','sell',1799],['Retro aviator sunglasses','Polarised lenses','accessories','rent',149],['Kundan choker set','With matching earrings','jewellery','rent',899],['Silver moon pendant','925 silver, 18 inch chain','jewellery','sell',1299]];
    for (const r of seed) await pool.query('INSERT INTO items(owner_id,title,description,category,mode,price) VALUES($1,$2,$3,$4,$5,$6)', [u.id, ...r]);
  }
}
if (!process.env.VERCEL) { // locally: start a server. On Vercel the exported app is the handler.
  const port = process.env.PORT || 3000;
  (ready = init()).then(() => app.listen(port, () => console.log('Lendloom running on http://localhost:' + port)))
    .catch(e => { console.error('Database setup failed. Check DATABASE_URL in .env:', e.message); process.exit(1); });
}
module.exports = app;
