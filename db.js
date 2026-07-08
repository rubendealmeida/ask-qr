const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS qrcodes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,             -- 'link' | 'pdf'
  destination TEXT NOT NULL,      -- URL externo, ou caminho /files/<code>.pdf
  original_filename TEXT,
  style_shape TEXT NOT NULL,
  style_fg TEXT NOT NULL,
  style_bg TEXT NOT NULL,
  has_logo INTEGER NOT NULL DEFAULT 0,
  scans INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qrcode_id TEXT NOT NULL,
  scanned_at TEXT NOT NULL
);
`);

// migracoes leves: adicionar colunas de analitica se ainda nao existirem
const scanCols = db.prepare('PRAGMA table_info(scan_events)').all().map((c) => c.name);
for (const [col, type] of [
  ['ip', 'TEXT'],
  ['country', 'TEXT'],
  ['city', 'TEXT'],
  ['device', 'TEXT'],
]) {
  if (!scanCols.includes(col)) {
    db.exec(`ALTER TABLE scan_events ADD COLUMN ${col} ${type}`);
  }
}

module.exports = db;
