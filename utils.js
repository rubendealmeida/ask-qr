const crypto = require('crypto');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; // sem 0/O/1/l/I para evitar confusao

function randomCode(len = 7) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function uniqueShortCode(db, len = 7) {
  const stmt = db.prepare('SELECT 1 FROM qrcodes WHERE code = ?');
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomCode(len);
    if (!stmt.get(code)) return code;
  }
  throw new Error('Nao foi possivel gerar um codigo unico');
}

function nowISO() {
  return new Date().toISOString();
}

const PY = 'python3';
const GEN_SCRIPT = path.join(__dirname, 'qr', 'generate_qr.py');

function generateQrPng({ text, shape, fg, bg, logoPath, outPath, box, logoScale }) {
  const args = [
    GEN_SCRIPT,
    '--text', text,
    '--out', outPath,
    '--shape', shape,
    '--fg', fg,
    '--bg', bg,
  ];
  if (logoPath) {
    args.push('--logo', logoPath);
    if (logoScale) args.push('--logo-scale', String(logoScale));
  }
  if (box) {
    args.push('--box', String(box));
  }
  execFileSync(PY, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  return outPath;
}

const DECODE_SCRIPT = path.join(__dirname, 'qr', 'decode_check.py');

function decodeQrPng(pngPath) {
  try {
    const out = execFileSync(PY, [DECODE_SCRIPT, pngPath], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return out.includes('DECODED:');
  } catch {
    return false;
  }
}

function hexLuminance(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const l1 = hexLuminance(fg);
  const l2 = hexLuminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

module.exports = { randomCode, uniqueShortCode, nowISO, generateQrPng, ensureDir, decodeQrPng, contrastRatio };

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

