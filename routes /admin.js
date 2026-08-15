// routes/admin.js
// Photographer-facing admin dashboard: manage clients, galleries, uploads, and settings.

const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const archiver = require('archiver');
const { nanoid } = require('nanoid');

const db = require('../db/db');
const { requireAdmin } = require('../utils/auth');
const { processUpload, galleryFilePath, deleteGalleryFiles } = require('../utils/images');

const router = express.Router();

// Uploads land in a temp dir first, then get processed (resized/watermarked) into /uploads/<galleryId>/...
const upload = multer({ dest: path.join(os.tmpdir(), 'gallery-uploads') });

function slugify(title) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base}-${nanoid(6)}`;
}

// ---------- Auth ----------

router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email || '');
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.render('admin/login', { error: 'Incorrect email or password.' });
  }
  req.session.adminId = admin.id;
  req.session.adminName = admin.name;
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/admin/login');
});

router.use(requireAdmin);

// Serve thumbnails for the admin UI (unwatermarked, for organizing/reviewing).
router.get('/photo-thumb/:photoId', (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.photoId);
  if (!photo || !photo.thumb_filename) return res.status(404).end();
  res.sendFile(galleryFilePath(photo.gallery_id, 'thumbs', photo.thumb_filename));
});

// ---------- Dashboard ----------

router.get('/', (req, res) => {
  const galleries = db
    .prepare(
      `SELECT g.*, c.name AS client_name,
        (SELECT COUNT(*) FROM photos p WHERE p.gallery_id = g.id) AS photo_count,
        (SELECT COUNT(*) FROM photos p WHERE p.gallery_id = g.id AND p.is_favorited = 1) AS favorite_count
       FROM galleries g JOIN clients c ON c.id = g.client_id
       ORDER BY g.created_at DESC`
    )
    .all();
  const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
  res.render('admin/dashboard', { galleries, clients, adminName: req.session.adminName });
});

// ---------- Clients ----------

router.post('/clients', (req, res) => {
  const { name, email } = req.body;
  if (!name || !name.trim()) return res.redirect('/admin');
  const info = db.prepare('INSERT INTO clients (name, email) VALUES (?, ?)').run(name.trim(), email || null);
  res.redirect(`/admin/galleries/new?client_id=${info.lastInsertRowid}`);
});

// ---------- Galleries ----------

router.get('/galleries/new', (req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
  const preselectClientId = req.query.client_id ? Number(req.query.client_id) : null;
  res.render('admin/new-gallery', { clients, preselectClientId, error: null });
});

router.post('/galleries', (req, res) => {
  const {
    client_id,
    title,
    shoot_date,
    expiration_date,
    access_password,
    watermark_enabled,
    downloads_enabled,
    max_selections,
  } = req.body;

  if (!client_id || !title || !title.trim()) {
    const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
    return res.render('admin/new-gallery', {
      clients,
      preselectClientId: client_id ? Number(client_id) : null,
      error: 'Please choose a client and enter a gallery title.',
    });
  }

  const slug = slugify(title);
  const pwHash = access_password && access_password.trim() ? bcrypt.hashSync(access_password.trim(), 10) : null;

  const info = db
    .prepare(
      `INSERT INTO galleries
        (client_id, title, slug, shoot_date, expiration_date, access_password_hash,
         watermark_enabled, downloads_enabled, max_selections, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`
    )
    .run(
      Number(client_id),
      title.trim(),
      slug,
      shoot_date || null,
      expiration_date || null,
      pwHash,
      watermark_enabled ? 1 : 0,
      downloads_enabled ? 1 : 0,
      max_selections ? Number(max_selections) : null
    );

  res.redirect(`/admin/galleries/${info.lastInsertRowid}`);
});

function getGalleryOr404(id) {
  return db
    .prepare(
      `SELECT g.*, c.name AS client_name, c.email AS client_email
       FROM galleries g JOIN clients c ON c.id = g.client_id WHERE g.id = ?`
    )
    .get(id);
}

router.get('/galleries/:id', (req, res) => {
  const gallery = getGalleryOr404(req.params.id);
  if (!gallery) return res.status(404).send('Gallery not found');

  const photos = db
    .prepare('SELECT * FROM photos WHERE gallery_id = ? ORDER BY sort_order, id')
    .all(gallery.id);

  const comments = db
    .prepare(
      `SELECT c.*, p.original_filename FROM comments c
       JOIN photos p ON p.id = c.photo_id WHERE c.gallery_id = ? ORDER BY c.created_at DESC LIMIT 50`
    )
    .all(gallery.id);

  const galleryUrl = `${req.protocol}://${req.get('host')}/gallery/${gallery.slug}`;

  res.render('admin/gallery-manage', { gallery, photos, comments, galleryUrl, uploadError: null });
});

router.post('/galleries/:id/upload', upload.array('photos', 100), async (req, res) => {
  const gallery = getGalleryOr404(req.params.id);
  if (!gallery) return res.status(404).send('Gallery not found');

  const files = req.files || [];
  const insert = db.prepare(
    `INSERT INTO photos (gallery_id, filename, thumb_filename, watermarked_filename, original_filename, width, height, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const maxOrderRow = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM photos WHERE gallery_id = ?')
    .get(gallery.id);
  let nextOrder = maxOrderRow.m + 1;

  const watermarkText = gallery.client_name ? `${gallery.client_name.toUpperCase()} - PROOF` : 'PROOF';

  for (const file of files) {
    try {
      const processed = await processUpload(file.path, gallery.id, watermarkText);
      insert.run(
        gallery.id,
        processed.filename,
        processed.thumbFilename,
        processed.watermarkedFilename,
        file.originalname,
        processed.width || null,
        processed.height || null,
        nextOrder++
      );
    } catch (err) {
      console.error('Failed to process upload', file.originalname, err);
    } finally {
      fs.unlink(file.path, () => {});
    }
  }

  res.redirect(`/admin/galleries/${gallery.id}`);
});

router.post('/galleries/:id/settings', (req, res) => {
  const gallery = getGalleryOr404(req.params.id);
  if (!gallery) return res.status(404).send('Gallery not found');

  const { title, shoot_date, expiration_date, access_password, watermark_enabled, downloads_enabled, max_selections, status } =
    req.body;

  let pwHash = gallery.access_password_hash;
  if (access_password && access_password.trim()) {
    pwHash = bcrypt.hashSync(access_password.trim(), 10);
  } else if (access_password === '') {
    pwHash = null; // explicit clear = no password
  }

  db.prepare(
    `UPDATE galleries SET title = ?, shoot_date = ?, expiration_date = ?, access_password_hash = ?,
       watermark_enabled = ?, downloads_enabled = ?, max_selections = ?, status = ? WHERE id = ?`
  ).run(
    title || gallery.title,
    shoot_date || null,
    expiration_date || null,
    pwHash,
    watermark_enabled ? 1 : 0,
    downloads_enabled ? 1 : 0,
    max_selections ? Number(max_selections) : null,
    status || gallery.status,
    gallery.id
  );

  res.redirect(`/admin/galleries/${gallery.id}`);
});

router.post('/galleries/:id/delete', (req, res) => {
  const gallery = getGalleryOr404(req.params.id);
  if (!gallery) return res.status(404).send('Gallery not found');
  db.prepare('DELETE FROM galleries WHERE id = ?').run(gallery.id); // cascades to photos/comments
  deleteGalleryFiles(gallery.id);
  res.redirect('/admin');
});

router.post('/photos/:photoId/delete', (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.photoId);
  if (!photo) return res.status(404).send('Photo not found');
  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  for (const kind of ['full', 'thumbs', 'watermarked']) {
    const fname = kind === 'full' ? photo.filename : kind === 'thumbs' ? photo.thumb_filename : photo.watermarked_filename;
    if (fname) {
      const p = galleryFilePath(photo.gallery_id, kind, fname);
      fs.unlink(p, () => {});
    }
  }
  res.redirect(`/admin/galleries/${photo.gallery_id}`);
});

// Download all favorited (client-selected) full-res photos as a zip, for editing/delivery workflow.
router.get('/galleries/:id/download-favorites', (req, res) => {
  const gallery = getGalleryOr404(req.params.id);
  if (!gallery) return res.status(404).send('Gallery not found');
  const photos = db
    .prepare('SELECT * FROM photos WHERE gallery_id = ? AND is_favorited = 1')
    .all(gallery.id);
  if (photos.length === 0) return res.status(400).send('No favorited photos yet.');

  res.attachment(`${gallery.slug}-selects.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  for (const photo of photos) {
    const p = galleryFilePath(gallery.id, 'full', photo.filename);
    if (fs.existsSync(p)) archive.file(p, { name: photo.original_filename || photo.filename });
  }
  archive.finalize();
});

module.exports = router;
