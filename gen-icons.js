// scripts/gen-icons.js — one-off generator for PWA app icons.
// Run with: node scripts/gen-icons.js
// Produces public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
// from an inline SVG monogram, using the brand colors from public/css/style.css.

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const BG_DARK = '#14140f';
const ACCENT = '#a9895c';

// Full-bleed square icon (used for regular icons + apple-touch-icon — no
// transparency, safe to crop to any corner radius by the OS).
function fullBleedSvg(size) {
  const ringR = size * 0.17;
  const cx = size / 2;
  const cy = size * 0.38;
  const fontSize = Math.round(size * 0.155);
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${BG_DARK}"/>
    <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${ACCENT}" stroke-width="${size * 0.022}"/>
    <circle cx="${cx}" cy="${cy}" r="${ringR * 0.4}" fill="${ACCENT}"/>
    <text x="${cx}" y="${size * 0.82}" text-anchor="middle"
          font-family="Helvetica, Arial, sans-serif" font-weight="700"
          font-size="${fontSize}" fill="${ACCENT}" letter-spacing="${size * 0.006}">MGB</text>
  </svg>`;
}

// Maskable icon needs generous padding — Android may crop up to ~20% off
// each edge, so keep all meaningful content inside the center ~66% "safe zone".
function maskableSvg(size) {
  const cx = size / 2;
  const ringR = size * 0.13;
  const ringCy = size * 0.42;
  const fontSize = Math.round(size * 0.105);
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${BG_DARK}"/>
    <circle cx="${cx}" cy="${ringCy}" r="${ringR}" fill="none" stroke="${ACCENT}" stroke-width="${size * 0.016}"/>
    <circle cx="${cx}" cy="${ringCy}" r="${ringR * 0.4}" fill="${ACCENT}"/>
    <text x="${cx}" y="${size * 0.62}" text-anchor="middle"
          font-family="Helvetica, Arial, sans-serif" font-weight="700"
          font-size="${fontSize}" fill="${ACCENT}" letter-spacing="${size * 0.004}">MGB</text>
  </svg>`;
}

async function run() {
  await sharp(Buffer.from(fullBleedSvg(192))).png().toFile(path.join(OUT_DIR, 'icon-192.png'));
  await sharp(Buffer.from(fullBleedSvg(512))).png().toFile(path.join(OUT_DIR, 'icon-512.png'));
  await sharp(Buffer.from(fullBleedSvg(180))).png().toFile(path.join(OUT_DIR, 'apple-touch-icon.png'));
  await sharp(Buffer.from(maskableSvg(512))).png().toFile(path.join(OUT_DIR, 'icon-maskable-512.png'));
  console.log('Icons written to', OUT_DIR);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
