// utils/images.js
// Handles thumbnail + watermarked preview generation using sharp.

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Same STORAGE_ROOT convention as db/db.js — keeps uploads on the same mounted
// disk as the database in production so one Render disk covers everything.
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(__dirname, '..');
const UPLOAD_ROOT = path.join(STORAGE_ROOT, 'uploads');

function galleryDir(galleryId) {
  const dir = path.join(UPLOAD_ROOT, String(galleryId));
  const full = path.join(dir, 'full');
  const thumbs = path.join(dir, 'thumbs');
  const watermarked = path.join(dir, 'watermarked');
  for (const d of [dir, full, thumbs, watermarked]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
  return { dir, full, thumbs, watermarked };
}

async function buildWatermarkSvg(width, height, text) {
  // Tiled diagonal watermark text as an SVG overlay.
  const tileText = text || 'PROOF';
  const fontSize = Math.max(24, Math.round(width / 14));
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .wm { fill: rgba(255,255,255,0.55); font-family: Helvetica, Arial, sans-serif;
            font-size: ${fontSize}px; font-weight: 600; }
    </style>
    <g transform="rotate(-30 ${width / 2} ${height / 2})">
      ${Array.from({ length: 6 })
        .map((_, row) =>
          Array.from({ length: 4 })
            .map(
              (_, col) =>
                `<text class="wm" x="${(col - 1) * width * 0.5}" y="${
                  row * height * 0.22
                }">${tileText}</text>`
            )
            .join('')
        )
        .join('')}
    </g>
  </svg>`;
  return Buffer.from(svg);
}

// Process an uploaded file: save full-res, generate thumbnail + watermarked preview.
// Returns { filename, thumbFilename, watermarkedFilename, width, height }
async function processUpload(tempFilePath, galleryId, watermarkText) {
  const dirs = galleryDir(galleryId);
  const id = path.basename(tempFilePath).split('.')[0];
  const ext = '.jpg'; // normalize everything to jpg for web delivery

  const image = sharp(tempFilePath).rotate(); // auto-orient based on EXIF
  const meta = await image.metadata();

  const fullName = `${id}${ext}`;
  const thumbName = `${id}_thumb${ext}`;
  const wmName = `${id}_wm${ext}`;

  // Full-res (converted to high-quality jpg, capped at 4000px longest edge to keep size sane)
  await sharp(tempFilePath)
    .rotate()
    .resize({ width: 4000, height: 4000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toFile(path.join(dirs.full, fullName));

  // Thumbnail
  await sharp(tempFilePath)
    .rotate()
    .resize({ width: 600, height: 600, fit: 'inside' })
    .jpeg({ quality: 82 })
    .toFile(path.join(dirs.thumbs, thumbName));

  // Watermarked preview (1600px, tiled text overlay)
  const previewWidth = 1600;
  const resized = sharp(tempFilePath).rotate().resize({
    width: previewWidth,
    height: previewWidth,
    fit: 'inside',
    withoutEnlargement: true,
  });
  const resizedMeta = await resized.clone().metadata();
  const svg = await buildWatermarkSvg(
    resizedMeta.width || previewWidth,
    resizedMeta.height || previewWidth,
    watermarkText
  );
  await resized
    .composite([{ input: svg, gravity: 'center' }])
    .jpeg({ quality: 82 })
    .toFile(path.join(dirs.watermarked, wmName));

  return {
    filename: fullName,
    thumbFilename: thumbName,
    watermarkedFilename: wmName,
    width: meta.width,
    height: meta.height,
  };
}

function galleryFilePath(galleryId, kind, filename) {
  // kind: 'full' | 'thumbs' | 'watermarked'
  return path.join(UPLOAD_ROOT, String(galleryId), kind, filename);
}

function deleteGalleryFiles(galleryId) {
  const dir = path.join(UPLOAD_ROOT, String(galleryId));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { processUpload, galleryFilePath, deleteGalleryFiles, UPLOAD_ROOT };
