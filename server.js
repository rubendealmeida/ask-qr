const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const db = require('./db');
const { uniqueShortCode, nowISO, generateQrPng, ensureDir, decodeQrPng, contrastRatio } = require('./utils');
const { dashboardPage, createPage, analyticsPage } = require('./views');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');
const QR_IMAGES_DIR = path.join(__dirname, 'data', 'qrcodes');
const LOGOS_DIR = path.join(__dirname, 'data', 'logos');
[UPLOADS_DIR, QR_IMAGES_DIR, LOGOS_DIR].forEach(ensureDir);

const MAX_BODY_BYTES = 22 * 1024 * 1024; // ~15MB de PDF em base64 + margem

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { code: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { sendJson(res, 404, { error: 'not found' }); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function rowToPublic(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    destination: row.destination,
    originalFilename: row.original_filename,
    shape: row.style_shape,
    fg: row.style_fg,
    bg: row.style_bg,
    hasLogo: !!row.has_logo,
    scans: row.scans,
    createdAt: row.created_at,
  };
}

function listActive() {
  return db.prepare(
    'SELECT * FROM qrcodes WHERE archived = 0 ORDER BY created_at DESC'
  ).all();
}

function isValidHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidShape(s) {
  return ['classico', 'arredondado', 'pontos', 'elegante'].includes(s);
}
function isValidHexColor(s) {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

// ---------- Handlers ----------

async function handlePreview(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: 'corpo invalido' });
  }
  const shape = isValidShape(body.shape) ? body.shape : 'classico';
  const fg = isValidHexColor(body.fg) ? body.fg : '#111111';
  const bg = isValidHexColor(body.bg) ? body.bg : '#ffffff';
  const text = body.type === 'link' && body.url
    ? body.url
    : `${BASE_URL}/r/PREVIEW`;

  const logoScale = Math.max(0.10, Math.min(0.38, parseFloat(body.logoScale) || 0.22));

  const tmpOut = path.join('/tmp', `preview_${crypto.randomBytes(6).toString('hex')}.png`);
  let tmpLogo = null;
  try {
    if (body.logoBase64) {
      tmpLogo = path.join('/tmp', `logo_${crypto.randomBytes(6).toString('hex')}.png`);
      fs.writeFileSync(tmpLogo, Buffer.from(body.logoBase64, 'base64'));
    }
    generateQrPng({ text, shape, fg, bg, logoPath: tmpLogo, outPath: tmpOut, box: 420, logoScale });
    const png = fs.readFileSync(tmpOut);

    // medidor de legibilidade: tenta mesmo descodificar o PNG com um leitor real
    const decoded = decodeQrPng(tmpOut);
    const contrast = contrastRatio(fg, bg);
    let level;
    if (!decoded) level = 'baixa';
    else if (contrast >= 4) level = 'alta';
    else if (contrast >= 2.5) level = 'media';
    else level = 'baixa';

    sendJson(res, 200, {
      pngBase64: png.toString('base64'),
      scannable: decoded,
      contrast: Math.round(contrast * 10) / 10,
      level,
    });
  } catch (e) {
    sendJson(res, 500, { error: 'falha ao gerar pre-visualizacao' });
  } finally {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    if (tmpLogo && fs.existsSync(tmpLogo)) fs.unlinkSync(tmpLogo);
  }
}

async function handleCreate(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (e.code === 'PAYLOAD_TOO_LARGE') return sendJson(res, 413, { error: 'Ficheiro demasiado grande.' });
    return sendJson(res, 400, { error: 'Corpo invalido.' });
  }

  const name = (body.name || '').trim();
  if (!name) return sendJson(res, 400, { error: 'Indica um nome.' });

  const type = body.type === 'pdf' ? 'pdf' : 'link';
  const shape = isValidShape(body.shape) ? body.shape : 'classico';
  const fg = isValidHexColor(body.fg) ? body.fg : '#111111';
  const bg = isValidHexColor(body.bg) ? body.bg : '#ffffff';

  if (type === 'link' && !isValidHttpUrl(body.url || '')) {
    return sendJson(res, 400, { error: 'Link inválido. Usa http:// ou https://' });
  }
  if (type === 'pdf' && !body.pdfBase64) {
    return sendJson(res, 400, { error: 'Falta o ficheiro PDF.' });
  }

  const id = crypto.randomUUID();
  const code = uniqueShortCode(db);
  let destination;
  let originalFilename = null;

  if (type === 'link') {
    destination = body.url.trim();
  } else {
    const pdfBuf = Buffer.from(body.pdfBase64, 'base64');
    if (pdfBuf.length > 15 * 1024 * 1024) return sendJson(res, 413, { error: 'PDF excede 15 MB.' });
    // valida cabecalho basico de PDF
    if (pdfBuf.slice(0, 5).toString('utf8') !== '%PDF-') {
      return sendJson(res, 400, { error: 'O ficheiro não parece ser um PDF válido.' });
    }
    const pdfPath = path.join(UPLOADS_DIR, `${code}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuf);
    originalFilename = (body.pdfFilename || 'ficheiro.pdf').slice(0, 200);
    destination = `/files/${code}.pdf`;
  }

  let logoPath = null;
  let hasLogo = 0;
  if (body.logoBase64) {
    logoPath = path.join(LOGOS_DIR, `${code}.png`);
    fs.writeFileSync(logoPath, Buffer.from(body.logoBase64, 'base64'));
    hasLogo = 1;
  }

  const logoScale = Math.max(0.10, Math.min(0.38, parseFloat(body.logoScale) || 0.22));
  const redirectTarget = `${BASE_URL}/r/${code}`;
  const qrOut = path.join(QR_IMAGES_DIR, `${code}.png`);
  try {
    generateQrPng({ text: redirectTarget, shape, fg, bg, logoPath, outPath: qrOut, box: 900, logoScale });
    // seguranca final: garante que o QR gerado e mesmo descodificavel
    if (!decodeQrPng(qrOut)) {
      fs.unlinkSync(qrOut);
      if (logoPath && fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
      return sendJson(res, 400, { error: 'Com estas cores/logótipo o QR code deixa de ser lível. Aumenta o contraste ou reduz o logótipo.' });
    }
  } catch (e) {
    return sendJson(res, 500, { error: 'Falha ao gerar o QR code.' });
  }

  const ts = nowISO();
  db.prepare(`
    INSERT INTO qrcodes (id, code, name, type, destination, original_filename, style_shape, style_fg, style_bg, has_logo, scans, archived, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `).run(id, code, name, type, destination, originalFilename, shape, fg, bg, hasLogo, ts, ts);

  const row = db.prepare('SELECT * FROM qrcodes WHERE id = ?').get(id);
  sendJson(res, 201, rowToPublic(row));
}

async function handlePatch(req, res, id) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (e.code === 'PAYLOAD_TOO_LARGE') return sendJson(res, 413, { error: 'Ficheiro demasiado grande.' });
    return sendJson(res, 400, { error: 'corpo invalido' });
  }
  const row = db.prepare('SELECT * FROM qrcodes WHERE id = ?').get(id);
  if (!row) return sendJson(res, 404, { error: 'não encontrado' });

  const newType = body.type === 'pdf' ? 'pdf' : body.type === 'link' ? 'link' : row.type;
  const pdfPath = path.join(UPLOADS_DIR, `${row.code}.pdf`);

  if (newType === 'pdf') {
    // substituir/definir o PDF — o QR code impresso continua igual
    if (!body.pdfBase64) return sendJson(res, 400, { error: 'Falta o ficheiro PDF.' });
    const pdfBuf = Buffer.from(body.pdfBase64, 'base64');
    if (pdfBuf.length > 15 * 1024 * 1024) return sendJson(res, 413, { error: 'PDF excede 15 MB.' });
    if (pdfBuf.slice(0, 5).toString('utf8') !== '%PDF-') {
      return sendJson(res, 400, { error: 'O ficheiro não parece ser um PDF válido.' });
    }
    fs.writeFileSync(pdfPath, pdfBuf);
    const fname = (body.pdfFilename || 'ficheiro.pdf').slice(0, 200);
    db.prepare('UPDATE qrcodes SET type = ?, destination = ?, original_filename = ?, updated_at = ? WHERE id = ?')
      .run('pdf', `/files/${row.code}.pdf`, fname, nowISO(), id);
  } else {
    // destino passa a ser um link — se antes era PDF, o ficheiro deixa de ser preciso
    if (!isValidHttpUrl(body.destination || '')) return sendJson(res, 400, { error: 'link inválido' });
    if (row.type === 'pdf' && fs.existsSync(pdfPath)) {
      try { fs.unlinkSync(pdfPath); } catch {}
    }
    db.prepare('UPDATE qrcodes SET type = ?, destination = ?, original_filename = NULL, updated_at = ? WHERE id = ?')
      .run('link', body.destination.trim(), nowISO(), id);
  }
  sendJson(res, 200, { ok: true });
}

// ---------- Analitica ----------

function isPrivateIp(ip) {
  if (!ip) return true;
  return (
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fc') ||
    ip.startsWith('fe80')
  );
}

function geoLookup(ip, scanEventId) {
  if (isPrivateIp(ip)) return;
  try {
    const req = https.get(
      { hostname: 'ipwho.is', path: `/${encodeURIComponent(ip)}?fields=success,country,city`, timeout: 4000 },
      (resp) => {
        let data = '';
        resp.on('data', (c) => { data += c; if (data.length > 65536) resp.destroy(); });
        resp.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j && j.success) {
              db.prepare('UPDATE scan_events SET country = ?, city = ? WHERE id = ?')
                .run(j.country || null, j.city || null, scanEventId);
            }
          } catch {}
        });
      }
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => {});
  } catch {}
}

function deviceFromUa(ua) {
  if (/ipad|tablet/i.test(ua)) return 'Tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'Telemóvel';
  return 'Computador';
}

function getStats(qrcodeId) {
  const total = db.prepare('SELECT COUNT(*) c FROM scan_events WHERE qrcode_id = ?').get(qrcodeId).c;
  const last7 = db.prepare(
    "SELECT COUNT(*) c FROM scan_events WHERE qrcode_id = ? AND scanned_at >= datetime('now','-7 days')"
  ).get(qrcodeId).c;
  const lastScan = db.prepare(
    'SELECT scanned_at FROM scan_events WHERE qrcode_id = ? ORDER BY id DESC LIMIT 1'
  ).get(qrcodeId);
  const perDayRows = db.prepare(
    "SELECT date(scanned_at) d, COUNT(*) c FROM scan_events WHERE qrcode_id = ? AND scanned_at >= date('now','-29 days') GROUP BY date(scanned_at)"
  ).all(qrcodeId);
  const byDay = {};
  perDayRows.forEach((r) => { byDay[r.d] = r.c; });
  const perDay = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    perDay.push({ date: d, count: byDay[d] || 0 });
  }
  const byCountry = db.prepare(
    "SELECT COALESCE(country, 'Desconhecido') k, COUNT(*) c FROM scan_events WHERE qrcode_id = ? GROUP BY k ORDER BY c DESC LIMIT 12"
  ).all(qrcodeId).map((r) => ({ label: r.k, count: r.c }));
  const byDevice = db.prepare(
    "SELECT COALESCE(device, 'Desconhecido') k, COUNT(*) c FROM scan_events WHERE qrcode_id = ? GROUP BY k ORDER BY c DESC"
  ).all(qrcodeId).map((r) => ({ label: r.k, count: r.c }));
  const recent = db.prepare(
    'SELECT scanned_at, country, city, device FROM scan_events WHERE qrcode_id = ? ORDER BY id DESC LIMIT 12'
  ).all(qrcodeId).map((r) => ({
    scannedAt: r.scanned_at, country: r.country, city: r.city, device: r.device,
  }));
  return { total, last7, lastScan: lastScan ? lastScan.scanned_at : null, perDay, byCountry, byDevice, recent };
}

function handleArchive(req, res, id) {
  const row = db.prepare('SELECT * FROM qrcodes WHERE id = ?').get(id);
  if (!row) return sendJson(res, 404, { error: 'não encontrado' });
  db.prepare('UPDATE qrcodes SET archived = 1, updated_at = ? WHERE id = ?').run(nowISO(), id);
  sendJson(res, 200, { ok: true });
}

function handleRedirect(req, res, code) {
  const row = db.prepare('SELECT * FROM qrcodes WHERE code = ? AND archived = 0').get(code);
  if (!row) { sendHtml(res, 404, '<h1>QR code não encontrado</h1>'); return; }

  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()) ||
    (req.socket && req.socket.remoteAddress) || '';
  const device = deviceFromUa(req.headers['user-agent'] || '');

  db.prepare('UPDATE qrcodes SET scans = scans + 1 WHERE id = ?').run(row.id);
  const ins = db.prepare(
    'INSERT INTO scan_events (qrcode_id, scanned_at, ip, device) VALUES (?, ?, ?, ?)'
  ).run(row.id, nowISO(), ip || null, device);

  const dest = row.type === 'pdf' ? `${BASE_URL}${row.destination}` : row.destination;
  res.writeHead(302, { Location: dest });
  res.end();

  // geolocalizacao em segundo plano (nunca atrasa o redirecionamento)
  setImmediate(() => geoLookup(ip, Number(ins.lastInsertRowid)));
}

function handleFile(req, res, code) {
  const filePath = path.join(UPLOADS_DIR, `${code}.pdf`);
  if (!fs.existsSync(filePath)) { sendJson(res, 404, { error: 'não encontrado' }); return; }
  const row = db.prepare('SELECT original_filename FROM qrcodes WHERE code = ?').get(code);
  const fname = (row && row.original_filename) || `${code}.pdf`;
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${fname.replace(/"/g, '')}"`,
  });
  fs.createReadStream(filePath).pipe(res);
}

function handleQrImage(req, res, code, download) {
  const filePath = path.join(QR_IMAGES_DIR, `${code}.png`);
  if (!fs.existsSync(filePath)) { sendJson(res, 404, { error: 'não encontrado' }); return; }
  const headers = { 'Content-Type': 'image/png' };
  if (download) headers['Content-Disposition'] = `attachment; filename="${code}.png"`;
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

// ---------- Router ----------

const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, BASE_URL);
    const p = parsed.pathname;
    const method = req.method;

    if (method === 'GET' && p === '/') {
      return sendHtml(res, 200, dashboardPage(listActive(), BASE_URL));
    }
    if (method === 'GET' && p === '/create') {
      return sendHtml(res, 200, createPage());
    }
    if (method === 'GET' && p.startsWith('/public/')) {
      return serveStaticFile(res, path.join(__dirname, p));
    }
    if (method === 'POST' && p === '/api/preview') {
      return await handlePreview(req, res);
    }
    if (method === 'POST' && p === '/api/qrcodes') {
      return await handleCreate(req, res);
    }
    let m;
    if (method === 'PATCH' && (m = p.match(/^\/api\/qrcodes\/([^/]+)$/))) {
      return await handlePatch(req, res, m[1]);
    }
    if (method === 'GET' && (m = p.match(/^\/analytics\/([^/]+)$/))) {
      const row = db.prepare('SELECT * FROM qrcodes WHERE id = ?').get(m[1]);
      if (!row) return sendHtml(res, 404, '<h1>QR code não encontrado</h1>');
      return sendHtml(res, 200, analyticsPage(row, BASE_URL, getStats(row.id)));
    }
    if (method === 'GET' && (m = p.match(/^\/api\/qrcodes\/([^/]+)\/stats$/))) {
      const row = db.prepare('SELECT id FROM qrcodes WHERE id = ?').get(m[1]);
      if (!row) return sendJson(res, 404, { error: 'não encontrado' });
      return sendJson(res, 200, getStats(row.id));
    }
    if (method === 'POST' && (m = p.match(/^\/api\/qrcodes\/([^/]+)\/archive$/))) {
      return handleArchive(req, res, m[1]);
    }
    if (method === 'GET' && (m = p.match(/^\/r\/([^/]+)$/))) {
      return handleRedirect(req, res, m[1]);
    }
    if (method === 'GET' && (m = p.match(/^\/files\/([^/]+)\.pdf$/))) {
      return handleFile(req, res, m[1]);
    }
    if (method === 'GET' && (m = p.match(/^\/qr-images\/([^/]+)\.png$/))) {
      return handleQrImage(req, res, m[1], parsed.searchParams.get('download') === '1');
    }

    sendJson(res, 404, { error: 'não encontrado' });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'erro interno' });
  }
});

server.listen(PORT, () => {
  console.log(`QR Fácil a correr em ${BASE_URL} (porta ${PORT})`);
});
