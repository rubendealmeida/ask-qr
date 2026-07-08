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

function generateQrPng({ text, shape, fg, bg, logoPath, outPath, box }) {
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
  }
  if (box) {
    args.push('--box', String(box));
  }
  execFileSync(PY, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  return outPath;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

module.exports = { randomCode, uniqueShortCode, nowISO, generateQrPng, ensureDir };
