function layout({ title, body, active }) {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} · QR Fácil</title>
<link rel="stylesheet" href="/public/style.css">
</head>
<body>
<header class="topbar">
  <a class="brand" href="/">
    <span class="brand-badge">▦</span>
    <span>QR Fácil</span>
  </a>
  <nav>
    <a href="/" class="${active === 'dashboard' ? 'active' : ''}">Os meus QR codes</a>
    <a href="/create" class="btn btn-primary ${active === 'create' ? 'active' : ''}">+ Criar QR code</a>
  </nav>
</header>
<main>
${body}
</main>
</body>
</html>`;
}

function typeBadge(type) {
  return type === 'pdf'
    ? `<span class="badge badge-pdf">PDF</span>`
    : `<span class="badge badge-link">Link</span>`;
}

function card(row, baseUrl) {
  const destShown = row.type === 'pdf'
    ? (row.original_filename || 'ficheiro.pdf')
    : row.destination;
  const shortUrl = `${baseUrl}/r/${row.code}`;
  return `
  <article class="card" data-id="${row.id}">
    <div class="card-qr">
      <img src="/qr-images/${row.code}.png" alt="QR code de ${row.name}" loading="lazy">
    </div>
    <div class="card-body">
      <div class="card-head">
        <h3>${escapeHtml(row.name)}</h3>
        ${typeBadge(row.type)}
      </div>
      <div class="card-url">
        <a href="${shortUrl}" target="_blank" rel="noopener">${shortUrl}</a>
      </div>
      <div class="card-dest" title="${escapeHtml(destShown)}">→ ${escapeHtml(truncate(destShown, 46))}</div>
      <div class="card-meta">
        <span>📅 ${formatDate(row.created_at)}</span>
        <span>👁 ${row.scans} leitura${row.scans === 1 ? '' : 's'}</span>
      </div>
      <div class="card-actions">
        <a class="btn btn-sm" href="/qr-images/${row.code}.png?download=1" download="${row.code}.png">Descarregar</a>
        ${row.type === 'link' ? `<button class="btn btn-sm" data-action="edit" data-id="${row.id}" data-current="${escapeHtml(row.destination)}">Editar destino</button>` : ''}
        <button class="btn btn-sm btn-danger" data-action="archive" data-id="${row.id}">Arquivar</button>
      </div>
    </div>
  </article>`;
}

function dashboardPage(rows, baseUrl) {
  const cards = rows.length
    ? rows.map(r => card(r, baseUrl)).join('\n')
    : `<div class="empty-state">
        <p>Ainda não tens nenhum QR code.</p>
        <a class="btn btn-primary" href="/create">+ Criar o primeiro QR code</a>
       </div>`;

  const body = `
  <div class="page-head">
    <h1>Os meus QR codes</h1>
    <p class="subtitle">Links e PDFs, sempre editáveis, com leituras contabilizadas.</p>
  </div>
  <div class="grid">
    ${cards}
  </div>

  <div class="modal-backdrop" id="editModal">
    <div class="modal">
      <h3>Editar destino</h3>
      <p class="muted">O QR code impresso continua igual — só o destino muda.</p>
      <input type="url" id="editDestInput" placeholder="https://...">
      <div class="modal-actions">
        <button class="btn" id="editCancel">Cancelar</button>
        <button class="btn btn-primary" id="editSave">Guardar</button>
      </div>
    </div>
  </div>
  <script src="/public/app.js"></script>
  <script>QRApp.initDashboard();</script>
  `;
  return layout({ title: 'Os meus QR codes', body, active: 'dashboard' });
}

function createPage() {
  const body = `
  <div class="page-head">
    <h1>Criar QR code</h1>
    <p class="subtitle">Escolhe um link ou um PDF, o estilo e (opcional) o teu logótipo.</p>
  </div>

  <div class="create-layout">
    <form id="createForm" class="create-form">
      <section class="field">
        <label for="name">Nome</label>
        <input type="text" id="name" name="name" placeholder="Ex: Menu do Restaurante" required>
      </section>

      <section class="field">
        <label>Conteúdo</label>
        <div class="tabs">
          <button type="button" class="tab active" data-type="link">🔗 Link</button>
          <button type="button" class="tab" data-type="pdf">📄 PDF</button>
        </div>
        <div id="panel-link" class="type-panel">
          <input type="url" id="urlInput" placeholder="https://exemplo.com/o-teu-link">
        </div>
        <div id="panel-pdf" class="type-panel" hidden>
          <input type="file" id="pdfInput" accept="application/pdf">
          <p class="hint" id="pdfHint">Máx. 15 MB</p>
        </div>
      </section>

      <section class="field">
        <label>Estilo</label>
        <div class="style-grid">
          <button type="button" class="style-card active" data-shape="classico">
            <span class="style-preview shape-classico"></span>
            Clássico
          </button>
          <button type="button" class="style-card" data-shape="arredondado">
            <span class="style-preview shape-arredondado"></span>
            Arredondado
          </button>
          <button type="button" class="style-card" data-shape="pontos">
            <span class="style-preview shape-pontos"></span>
            Pontos
          </button>
          <button type="button" class="style-card" data-shape="elegante">
            <span class="style-preview shape-elegante"></span>
            Elegante
          </button>
        </div>
      </section>

      <section class="field field-row">
        <div>
          <label for="fgColor">Cor principal</label>
          <input type="color" id="fgColor" value="#111111">
        </div>
        <div>
          <label for="bgColor">Cor de fundo</label>
          <input type="color" id="bgColor" value="#ffffff">
        </div>
      </section>

      <section class="field">
        <label>Logótipo no centro (opcional)</label>
        <input type="file" id="logoInput" accept="image/png,image/jpeg,image/webp">
        <p class="hint">PNG com fundo transparente fica melhor. É colocado automaticamente no centro com margem de segurança.</p>
      </section>

      <button type="submit" class="btn btn-primary btn-block" id="submitBtn">Criar QR code</button>
      <p class="error" id="formError"></p>
    </form>

    <aside class="preview-pane">
      <div class="preview-box">
        <img id="previewImg" alt="Pré-visualização do QR code">
        <div id="previewLoading" class="preview-loading" hidden>a atualizar…</div>
      </div>
      <p class="muted small">Pré-visualização em tempo real</p>
    </aside>
  </div>

  <script src="/public/app.js"></script>
  <script>QRApp.initCreate();</script>
  `;
  return layout({ title: 'Criar QR code', body, active: 'create' });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

module.exports = { layout, dashboardPage, createPage };
