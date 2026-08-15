// routes/client.js
// Client-facing gallery portal: password gate, viewing, favoriting, commenting, approving, downloads.

const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const archiver = require('archiver');

const db = require('../db/db');
const { requireGalleryAccess } = require('../utils/auth');
const { galleryFilePath } = require('../utils/images');

const router = express.Router();

function getGalleryBySlug(slug) {
  return db
    .prepare(
      `SELECT g.*, c.name AS client_name FROM galleries g
       JOIN clients c ON c.id = g.client_id WHERE g.slug = ?`
    )
    .get(slug);
}

function isExpired(gallery) {
  if (!gallery.expiration_date) return false;
  return new Date(gallery.expiration_date + 'T23:59:59') < new Date();
}

// Password gate / entry point
router.get('/:slug', (req, res) => {
  const gallery = getGalleryBySlug(req.params.slug);
  if (!gallery || gallery.status !== 'published') return res.status(404).render('client/not-found');
  if (isExpired(gallery)) return res.render('client/expired', { gallery });

  const alreadyUnlocked =
    !gallery.access_password_hash ||
    (req.session.unlockedGalleries && req.session.unlockedGalleries.includes(gallery.slug));

  if (alreadyUnlocked) return res.redirect(`/gallery/${gallery.slug}/view`);

  res.render('client/unlock', { gallery, error: null });
});

router.post('/:slug/unlock', (req, res) => {
  const gallery = getGalleryBySlug(req.params.slug);
  if (!gallery || gallery.status !== 'published') return res.status(404).render('client/not-found');
  if (isExpired(gallery)) return res.render('client/expired', { gallery });

  const { password } = req.body;
  if (gallery.access_password_hash && !bcrypt.compareSync(password || '', gallery.access_password_hash)) {
    return res.render('client/unlock', { gallery, error: 'Incorrect password. Please try again.' });
  }

  req.session.unlockedGalleries = req.session.unlockedGalleries || [];
  if (!req.session.unlockedGalleries.includes(gallery.slug)) {
    req.session.unlockedGalleries.push(gallery.slug);
  }
  res.redirect(`/gallery/${gallery.slug}/view`);
});

router.use('/:slug/view', requireGalleryAccess);
router.use('/:slug/photos', requireGalleryAccess);
router.use('/:slug/approve', requireGalleryAccess);
router.use('/:slug/download-all', requireGalleryAccess);

router.get('/:slug/view', (req, res) => {
  const gallery = getGalleryBySlug(req.params.slug);
  if (!gallery) return res.status(404).render('client/not-found');
  if (isExpired(gallery)) return res.render('client/expired', { gallery });

  const photos = db
    .prepare('SELECT * FROM photos WHERE gallery_id = ? ORDER BY sort_order, id')
    .all(gallery.id);

  const favoriteCount = photos.filter((p) => p.is_favorited).length;

  res.render('client/gallery', { gallery, photos, favoriteCount });
});

// Image serving

router.get('/:slug/photos/:photoId/thumb', requireGalleryAccess, (req, res) => {
  const gallery = getGalleryBySlug(req.params.slug);
  const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND gallery_id = ?').get(req.params.photoId, gallery.id);
  if (!photo || !photo.thumb_filename) return res.status(404).end();
  res.sendFile(galleryFilePath(gallery.id, 'thumbs', photo.thumb_filename));
});

router.get('/:slug/photos/:photoId/preview', requireGalleryAccess, (req, res) => {
  const gallery = getGalleryBySlug(req.params.slug);
  const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND gallery_id = ?').get(req.params.photoId, gallery.id);
  if (!photo) return res.status(404).end();
  if (gallery.watermark_enabled && photo.watermarked_filename) {
    return res.sendFile(galleryFilePath(gallery.id, 'watermarked', photo.watermarked_filename));
  }
  return res.sendFile(galleryFilePath(gallery.id, 'full', photo.filename));
});

router.get('/:slug/photos/:photoId/download', requireGalleryAccess, (req, res) => {
  const gallery = getGalleryBySlug(req.params.slug);
  if (!gallery.downloads_enabled) return res.status(403).send('Downloads are not enabled for this gallery yet.');
  const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND gallery_id = ?').get(req.params.photoId, gallery.id);
  if (!photo) return res.status(404).end();
  res.download(galleryFilePath(gallery.id, 'full', photo.filename), photo.original_filename || photo.filename);
});

router.get('/:slug/download-all', (req, res) => {
  const gallery = getGalleryBySlug(req.params.slug);
  if (!gallery.downloads_enabled) return res.status(403).send('Downloads are not enabled for this gallery yet.');

  const onlyFavorites = req.query.selected === '1';
  const photos = onlyFavorites
    ? db.prepare('SELECT * FROM photos WHERE gallery_id = ? AND is_favorited = 1').all(gallery.id)
    : db.prepare('SELECT * FROM photos WHERE gallery_id = ?').all(gallery.id);

  if (photos.length === 0) return res.status(400).send('No photos to download.');

  res.attachment(`${gallery.slug}${onlyFavorites ? '-selects' : ''}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  for (const photo of photos) {
    const p = galleryFilePath(gallery.id, 'full', photo.filename);
    if (fs.existsSync(p)) archive.file(p, { name: photo.original_filename || photo.filename });
  }
  archive.finalize();
});

// Favorite toggle (AJAX)
router.post('/:slug/photos/:photoId/favorite', (req, res) => {
  const gallery = getGalleryBySlug(req.params.slug);
  const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND gallery_id = ?').get(req.params.photoId, gallery.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  if (!photo.is_favorited && gallery.max_selections) {
    const count = db
      .prepare('SELECT COUNT(*) AS c FROM photos WHERE gallery_id = ? AND is_favorited = 1')
      .get(gallery.id).c;
    if (count >= gallery.max_selections) {
      return res.status(400).json({ error: `You've reached the limit of ${gallery.max_selections} selections.` });
    }
  }

  const newValue = photo.is_favorited ? 0 : 1;
  db.prepare('UPDATE photos SET is_favorited = ? WHERE id = ?').run(newValue, photo.id);
  res.json({ favorited: !!newValue });
});

// Comment on a photo (AJAX)
router.post('/:slug/photos/:photoId/comment', (req, res) => {
  const gallery = getGalleryBySlug(req.params.slug);
  const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND gallery_id = ?').get(req.params.photoId, gallery.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Comment cannot be empty' });

  const info = db
    .prepare('INSERT INTO comments (photo_id, gallery_id, author, body) VALUES (?, ?, ?, ?)')
    .run(photo.id, gallery.id, 'client', body.slice(0, 1000));

  res.json({ id: info.lastInsertRowid, body, created_at: new Date().toISOString() });
});

router.get('/:slug/photos/:photoId/comments', requireGalleryAccess, (req, res) => {
  const comments = db
    .prepare('SELECT * FROM comments WHERE photo_id = ? ORDER BY created_at ASC')
    .all(req.params.photoId);
  res.json(comments);
});

// Approve final selections
router.post('/:slug/approve', (req, res) => {
  const gallery = getGalleryBySlug(req.params.slug);
  db.prepare("UPDATE galleries SET approved = 1, approved_at = datetime('now') WHERE id = ?").run(gallery.id);
  res.redirect(`/gallery/${gallery.slug}/view`);
});

module.exports = router;
