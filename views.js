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
        <a class="btn btn-sm" href="/analytics/${row.id}">📊 Análises</a>
        <a class="btn btn-sm" href="/qr-images/${row.code}.png?download=1" download="${row.code}.png">Descarregar</a>
        <button class="btn btn-sm" data-action="edit" data-id="${row.id}" data-type="${row.type}" data-current="${row.type === 'link' ? escapeHtml(row.destination) : ''}">Editar destino</button>
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
      <p class="muted">O QR code impresso continua exatamente igual — só o destino muda. Podes até trocar de PDF para link e vice-versa.</p>
      <div class="tabs" style="margin-top:14px">
        <button type="button" class="tab" id="editTabLink" data-edittype="link">🔗 Link</button>
        <button type="button" class="tab" id="editTabPdf" data-edittype="pdf">📄 PDF</button>
      </div>
      <div id="editPanelLink">
        <input type="url" id="editDestInput" placeholder="https://...">
      </div>
      <div id="editPanelPdf" hidden>
        <input type="file" id="editPdfInput" accept="application/pdf" style="width:100%;margin-top:12px">
        <p class="muted" style="font-size:12px;margin:8px 0 0">Substitui o PDF atual (máx. 15 MB). O link curto e o QR não mudam.</p>
      </div>
      <p class="error" id="editError" style="margin-top:10px"></p>
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
        <div id="logoScaleField" hidden style="margin-top:14px">
          <label for="logoScale" style="display:flex;justify-content:space-between">
            <span>Tamanho do logótipo</span>
            <span id="logoScaleValue" class="muted">22%</span>
          </label>
          <input type="range" id="logoScale" min="10" max="38" value="22" step="1">
        </div>
      </section>

      <button type="submit" class="btn btn-primary btn-block" id="submitBtn">Criar QR code</button>
      <p class="error" id="formError"></p>
    </form>

    <aside class="preview-pane">
      <div class="preview-box">
        <img id="previewImg" alt="Pré-visualização do QR code">
        <div id="previewLoading" class="preview-loading" hidden>a atualizar…</div>
      </div>
      <div class="meter-wrap">
        <div class="meter-head">
          <span class="meter-title">Legibilidade</span>
          <span class="meter-verdict" id="meterVerdict">—</span>
        </div>
        <div class="meter-track">
          <div class="meter-fill" id="meterFill"></div>
        </div>
        <p class="hint" id="meterHint">Testamos cada pré-visualização com um leitor de QR real.</p>
      </div>
      <p class="muted small">Pré-visualização em tempo real</p>
    </aside>
  </div>

  <script src="/public/app.js"></script>
  <script>QRApp.initCreate();</script>
  `;
  return layout({ title: 'Criar QR code', body, active: 'create' });
}

function barList(items) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return items.map((i) => `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((i.count / max) * 100)}%"></div></div>
      <span class="bar-count">${i.count}</span>
    </div>`).join('');
}

function analyticsPage(row, baseUrl, stats) {
  const shortUrl = `${baseUrl}/r/${row.code}`;
  const maxDay = Math.max(1, ...stats.perDay.map((d) => d.count));
  const chart = stats.perDay.map((d) => {
    const h = Math.round((d.count / maxDay) * 100);
    const dt = new Date(d.date + 'T00:00:00');
    const label = dt.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
    return `<div class="chart-col" title="${label}: ${d.count} leitura${d.count === 1 ? '' : 's'}">
      <div class="chart-bar" style="height:${Math.max(h, d.count > 0 ? 6 : 0)}%"></div>
    </div>`;
  }).join('');

  const recentRows = stats.recent.length
    ? stats.recent.map((r) => {
        const when = new Date(r.scannedAt).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const where = [r.city, r.country].filter(Boolean).join(', ') || '—';
        return `<tr><td>${when}</td><td>${escapeHtml(where)}</td><td>${escapeHtml(r.device || '—')}</td></tr>`;
      }).join('')
    : '<tr><td colspan="3" class="muted">Ainda sem leituras.</td></tr>';

  const lastScanTxt = stats.lastScan
    ? new Date(stats.lastScan).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  const body = `
  <div class="page-head an-head">
    <div class="an-head-left">
      <a href="/" class="muted back-link">← Os meus QR codes</a>
      <h1>${escapeHtml(row.name)}</h1>
      <div class="card-url"><a href="${shortUrl}" target="_blank" rel="noopener">${shortUrl}</a></div>
    </div>
    <img class="an-qr" src="/qr-images/${row.code}.png" alt="QR code">
  </div>

  <div class="stat-tiles">
    <div class="stat-tile"><span class="stat-num">${stats.total}</span><span class="stat-label">Leituras totais</span></div>
    <div class="stat-tile"><span class="stat-num">${stats.last7}</span><span class="stat-label">Últimos 7 dias</span></div>
    <div class="stat-tile"><span class="stat-num small">${lastScanTxt}</span><span class="stat-label">Última leitura</span></div>
  </div>

  <section class="an-section">
    <h2>Leituras · últimos 30 dias</h2>
    <div class="chart">${chart}</div>
  </section>

  <div class="an-grid">
    <section class="an-section">
      <h2>Países</h2>
      ${stats.byCountry.length ? barList(stats.byCountry) : '<p class="muted">Ainda sem dados.</p>'}
    </section>
    <section class="an-section">
      <h2>Dispositivos</h2>
      ${stats.byDevice.length ? barList(stats.byDevice) : '<p class="muted">Ainda sem dados.</p>'}
    </section>
  </div>

  <section class="an-section">
    <h2>Leituras recentes</h2>
    <table class="an-table">
      <thead><tr><th>Quando</th><th>Onde</th><th>Dispositivo</th></tr></thead>
      <tbody>${recentRows}</tbody>
    </table>
    <p class="muted" style="font-size:12px;margin-top:10px">A localização é aproximada (baseada na rede do dispositivo) e pode não estar disponível para todas as leituras.</p>
  </section>
  `;
  return layout({ title: `Análises · ${row.name}`, body, active: 'dashboard' });
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

module.exports = { layout, dashboardPage, createPage, analyticsPage };
