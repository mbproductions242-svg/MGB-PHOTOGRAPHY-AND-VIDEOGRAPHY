// utils/auth.js
// Simple session-based auth guards for the admin dashboard and client gallery portal.

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.redirect('/admin/login');
}

function requireGalleryAccess(req, res, next) {
  const { slug } = req.params;
  if (req.session && req.session.unlockedGalleries && req.session.unlockedGalleries.includes(slug)) {
    return next();
  }
  return res.redirect(`/gallery/${slug}`);
}

module.exports = { requireAdmin, requireGalleryAccess };
