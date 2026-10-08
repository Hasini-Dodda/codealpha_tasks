const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 4000;
const db = new Database(path.join(__dirname, 'social.db'));
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, bio TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS likes (user_id INTEGER NOT NULL, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY (user_id, post_id));
CREATE TABLE IF NOT EXISTS follows (follower_id INTEGER NOT NULL, followee_id INTEGER NOT NULL, PRIMARY KEY (follower_id, followee_id));
`);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sign = u => jwt.sign({ id: u.id, username: u.username }, SECRET, { expiresIn: '7d' });
const readUser = req => { try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); } catch { return null; } };
function auth(req, res, next) {
  const u = readUser(req);
  if (!u) return res.status(401).json({ error: 'Please log in first' });
  req.user = u; next();
}

// ---- Auth ----
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username || '') || (password || '').length < 6)
    return res.status(400).json({ error: 'Username: 3-20 letters/numbers/_ . Password: 6+ characters' });
  try {
    const r = db.prepare('INSERT INTO users (username,password) VALUES (?,?)').run(username, bcrypt.hashSync(password, 10));
    res.json({ token: sign({ id: r.lastInsertRowid, username }), username });
  } catch { res.status(409).json({ error: 'Username already taken' }); }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username || '');
  if (!u || !bcrypt.compareSync(password || '', u.password)) return res.status(401).json({ error: 'Invalid username or password' });
  res.json({ token: sign(u), username: u.username });
});

// ---- Posts ----
const postSelect = `
SELECT p.id, p.content, p.created_at, u.username,
  (SELECT COUNT(*) FROM likes WHERE post_id=p.id) AS likes,
  (SELECT COUNT(*) FROM comments WHERE post_id=p.id) AS comments,
  EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=@me) AS liked
FROM posts p JOIN users u ON u.id=p.user_id`;

// scope=following shows only followed users + self; default shows everyone
app.get('/api/posts', (req, res) => {
  const me = readUser(req);
  const meId = me ? me.id : 0;
  const where = req.query.scope === 'following' && me
    ? 'WHERE p.user_id=@me OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id=@me)' : '';
  res.json(db.prepare(`${postSelect} ${where} ORDER BY p.id DESC LIMIT 100`).all({ me: meId }));
});

app.post('/api/posts', auth, (req, res) => {
  const content = (req.body.content || '').trim();
  if (!content || content.length > 280) return res.status(400).json({ error: 'Post must be 1-280 characters' });
  const r = db.prepare('INSERT INTO posts (user_id,content) VALUES (?,?)').run(req.user.id, content);
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/posts/:id', auth, (req, res) => {
  const r = db.prepare('DELETE FROM posts WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  r.changes ? res.json({ ok: true }) : res.status(403).json({ error: 'Not your post' });
});

app.post('/api/posts/:id/like', auth, (req, res) => {
  if (!db.prepare('SELECT 1 FROM posts WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Post not found' });
  const del = db.prepare('DELETE FROM likes WHERE user_id=? AND post_id=?').run(req.user.id, req.params.id);
  if (!del.changes) db.prepare('INSERT INTO likes (user_id,post_id) VALUES (?,?)').run(req.user.id, req.params.id);
  res.json({ liked: !del.changes, likes: db.prepare('SELECT COUNT(*) c FROM likes WHERE post_id=?').get(req.params.id).c });
});

// ---- Comments ----
app.get('/api/posts/:id/comments', (req, res) => {
  res.json(db.prepare('SELECT c.id, c.content, c.created_at, u.username FROM comments c JOIN users u ON u.id=c.user_id WHERE post_id=? ORDER BY c.id').all(req.params.id));
});
app.post('/api/posts/:id/comments', auth, (req, res) => {
  const content = (req.body.content || '').trim();
  if (!content || content.length > 280) return res.status(400).json({ error: 'Comment must be 1-280 characters' });
  if (!db.prepare('SELECT 1 FROM posts WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Post not found' });
  db.prepare('INSERT INTO comments (post_id,user_id,content) VALUES (?,?,?)').run(req.params.id, req.user.id, content);
  res.json({ ok: true });
});

// ---- Profiles & follow ----
app.get('/api/users/:username', (req, res) => {
  const me = readUser(req);
  const u = db.prepare('SELECT id, username, bio, created_at FROM users WHERE username=?').get(req.params.username);
  if (!u) return res.status(404).json({ error: 'User not found' });
  u.followers = db.prepare('SELECT COUNT(*) c FROM follows WHERE followee_id=?').get(u.id).c;
  u.following = db.prepare('SELECT COUNT(*) c FROM follows WHERE follower_id=?').get(u.id).c;
  u.isFollowing = !!(me && db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(me.id, u.id));
  u.posts = db.prepare(`${postSelect} WHERE p.user_id=@uid ORDER BY p.id DESC`).all({ me: me ? me.id : 0, uid: u.id });
  delete u.id;
  res.json(u);
});

app.post('/api/users/:username/follow', auth, (req, res) => {
  const t = db.prepare('SELECT id FROM users WHERE username=?').get(req.params.username);
  if (!t) return res.status(404).json({ error: 'User not found' });
  if (t.id === req.user.id) return res.status(400).json({ error: "You can't follow yourself" });
  const del = db.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').run(req.user.id, t.id);
  if (!del.changes) db.prepare('INSERT INTO follows (follower_id,followee_id) VALUES (?,?)').run(req.user.id, t.id);
  res.json({ following: !del.changes });
});

app.put('/api/me', auth, (req, res) => {
  db.prepare('UPDATE users SET bio=? WHERE id=?').run((req.body.bio || '').slice(0, 160), req.user.id);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Social app running on http://localhost:${PORT}`));
