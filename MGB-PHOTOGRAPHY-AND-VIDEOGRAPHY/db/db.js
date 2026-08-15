// db/db.js
// SQLite database setup for the photo gallery app.
// Uses better-sqlite3 (synchronous, no ORM) so the whole schema lives in one place.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

// STORAGE_ROOT lets you point both the database and uploaded photos at a single
// mounted persistent disk in production (e.g. Render), instead of the project folder.
// Defaults to the project root so local development needs no extra setup.
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(__dirname, '..');

const DB_DIR = path.join(STORAGE_ROOT, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'gallery.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS galleries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  shoot_date TEXT,
  expiration_date TEXT,
  access_password_hash TEXT,
  watermark_enabled INTEGER NOT NULL DEFAULT 1,
  downloads_enabled INTEGER NOT NULL DEFAULT 1,
  max_selections INTEGER,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | published
  cover_photo_id INTEGER,
  approved INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id INTEGER NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,        -- stored file on disk (full res)
  thumb_filename TEXT,           -- stored thumbnail
  watermarked_filename TEXT,     -- stored watermarked preview
  original_filename TEXT,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER DEFAULT 0,
  is_favorited INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  gallery_id INTEGER NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  author TEXT NOT NULL, -- 'client' | 'admin'
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_photos_gallery ON photos(gallery_id);
CREATE INDEX IF NOT EXISTS idx_comments_photo ON comments(photo_id);
CREATE INDEX IF NOT EXISTS idx_galleries_client ON galleries(client_id);
`);

// Seed a default admin account on first run so there's always a way in.
// Credentials can be overridden via env vars; otherwise a sensible default is used
// and printed to the console once so the owner can log in and change it.
function ensureDefaultAdmin() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM admins').get();
  if (existing.c > 0) return;

  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'changeme123';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)')
    .run('Studio Admin', email, hash);

  console.log('----------------------------------------------------');
  console.log(' First run: a default admin account was created.');
  console.log(` Email:    ${email}`);
  console.log(` Password: ${password}`);
  console.log(' Please log in and change these in the admin settings.');
  console.log(' (Set ADMIN_EMAIL / ADMIN_PASSWORD env vars before first');
  console.log('  run to choose your own instead.)');
  console.log('----------------------------------------------------');
}

ensureDefaultAdmin();

module.exports = db;
