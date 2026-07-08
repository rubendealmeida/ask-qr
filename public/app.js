const QRApp = (() => {
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result; // data:*/*;base64,XXXX
        const idx = result.indexOf(',');
        resolve(result.slice(idx + 1));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function initCreate() {
    const form = document.getElementById('createForm');
    const tabs = document.querySelectorAll('.tab');
    const panelLink = document.getElementById('panel-link');
    const panelPdf = document.getElementById('panel-pdf');
    const urlInput = document.getElementById('urlInput');
    const pdfInput = document.getElementById('pdfInput');
    const logoInput = document.getElementById('logoInput');
    const styleCards = document.querySelectorAll('.style-card');
    const fgColor = document.getElementById('fgColor');
    const bgColor = document.getElementById('bgColor');
    const previewImg = document.getElementById('previewImg');
    const previewLoading = document.getElementById('previewLoading');
    const errorEl = document.getElementById('formError');
    const submitBtn = document.getElementById('submitBtn');
    const logoScaleField = document.getElementById('logoScaleField');
    const logoScaleInput = document.getElementById('logoScale');
    const logoScaleValue = document.getElementById('logoScaleValue');
    const meterVerdict = document.getElementById('meterVerdict');
    const meterFill = document.getElementById('meterFill');
    const meterHint = document.getElementById('meterHint');

    let currentType = 'link';
    let currentShape = 'classico';
    let logoBase64 = null;

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentType = tab.dataset.type;
        panelLink.hidden = currentType !== 'link';
        panelPdf.hidden = currentType !== 'pdf';
        triggerPreview();
      });
    });

    styleCards.forEach(card => {
      card.addEventListener('click', () => {
        styleCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        currentShape = card.dataset.shape;
        triggerPreview();
      });
    });

    logoInput.addEventListener('change', async () => {
      if (logoInput.files[0]) {
        logoBase64 = await fileToBase64(logoInput.files[0]);
        logoScaleField.hidden = false;
      } else {
        logoBase64 = null;
        logoScaleField.hidden = true;
      }
      triggerPreview();
    });

    logoScaleInput.addEventListener('input', () => {
      logoScaleValue.textContent = logoScaleInput.value + '%';
      debouncedPreview();
    });

    [fgColor, bgColor].forEach(el => el.addEventListener('input', () => triggerPreview()));
    const debouncedPreview = debounce(() => triggerPreview(), 300);
    urlInput.addEventListener('input', debounce(() => triggerPreview(), 400));

    function renderMeter(data) {
      if (!data || typeof data.level === 'undefined') return;
      const cfg = {
        alta: { text: 'Alta ✓', width: '100%', color: 'var(--ok, #3ecf8e)', hint: 'Perfeito — lê-se facilmente em qualquer telemóvel.' },
        media: { text: 'Média', width: '55%', color: '#f5a623', hint: 'Lê-se, mas o contraste é baixo — em impressões pequenas ou má luz pode falhar.' },
        baixa: { text: 'Baixa ✗', width: '20%', color: '#ff6b6b', hint: 'Um leitor real NÃO conseguiu ler este QR. Aumenta o contraste ou reduz o logótipo.' },
      };
      const c = cfg[data.level] || cfg.baixa;
      meterVerdict.textContent = c.text;
      meterVerdict.style.color = c.color;
      meterFill.style.width = c.width;
      meterFill.style.background = c.color;
      meterHint.textContent = c.hint;
    }

    async function triggerPreview() {
      previewLoading.hidden = false;
      try {
        const payload = {
          type: currentType,
          url: urlInput.value || '',
          shape: currentShape,
          fg: fgColor.value,
          bg: bgColor.value,
          logoBase64,
          logoScale: logoBase64 ? Number(logoScaleInput.value) / 100 : undefined,
        };
        const res = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.pngBase64) {
          previewImg.src = 'data:image/png;base64,' + data.pngBase64;
        }
        renderMeter(data);
      } catch (e) {
        // silencioso: a pre-visualizacao e apenas cosmetica
      } finally {
        previewLoading.hidden = true;
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';

      const name = document.getElementById('name').value.trim();
      if (!name) { errorEl.textContent = 'Indica um nome.'; return; }

      const payload = {
        name,
        type: currentType,
        shape: currentShape,
        fg: fgColor.value,
        bg: bgColor.value,
        logoBase64,
        logoScale: logoBase64 ? Number(logoScaleInput.value) / 100 : undefined,
      };

      if (currentType === 'link') {
        if (!urlInput.value) { errorEl.textContent = 'Indica um link.'; return; }
        payload.url = urlInput.value.trim();
      } else {
        const file = pdfInput.files[0];
        if (!file) { errorEl.textContent = 'Escolhe um ficheiro PDF.'; return; }
        if (file.size > 15 * 1024 * 1024) { errorEl.textContent = 'O PDF excede 15 MB.'; return; }
        payload.pdfBase64 = await fileToBase64(file);
        payload.pdfFilename = file.name;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'A criar…';
      try {
        const res = await fetch('/api/qrcodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao criar QR code');
        window.location.href = '/';
      } catch (err) {
        errorEl.textContent = err.message;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Criar QR code';
      }
    });

    triggerPreview();
  }

  function initDashboard() {
    const modal = document.getElementById('editModal');
    const input = document.getElementById('editDestInput');
    const pdfInput = document.getElementById('editPdfInput');
    const cancelBtn = document.getElementById('editCancel');
    const saveBtn = document.getElementById('editSave');
    const tabLink = document.getElementById('editTabLink');
    const tabPdf = document.getElementById('editTabPdf');
    const panelLink = document.getElementById('editPanelLink');
    const panelPdf = document.getElementById('editPanelPdf');
    const errorEl = document.getElementById('editError');
    let editingId = null;
    let editType = 'link';

    function setEditType(t) {
      editType = t;
      tabLink.classList.toggle('active', t === 'link');
      tabPdf.classList.toggle('active', t === 'pdf');
      panelLink.hidden = t !== 'link';
      panelPdf.hidden = t !== 'pdf';
      errorEl.textContent = '';
    }
    tabLink.addEventListener('click', () => setEditType('link'));
    tabPdf.addEventListener('click', () => setEditType('pdf'));

    document.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        editingId = btn.dataset.id;
        input.value = btn.dataset.current || '';
        pdfInput.value = '';
        setEditType(btn.dataset.type === 'pdf' ? 'pdf' : 'link');
        modal.classList.add('open');
        if (editType === 'link') input.focus();
      });
    });

    cancelBtn.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

    saveBtn.addEventListener('click', async () => {
      if (!editingId) return;
      errorEl.textContent = '';
      const payload = { type: editType };

      if (editType === 'link') {
        if (!input.value) { errorEl.textContent = 'Indica um link.'; return; }
        payload.destination = input.value.trim();
      } else {
        const file = pdfInput.files[0];
        if (!file) { errorEl.textContent = 'Escolhe um ficheiro PDF.'; return; }
        if (file.size > 15 * 1024 * 1024) { errorEl.textContent = 'O PDF excede 15 MB.'; return; }
        payload.pdfBase64 = await fileToBase64(file);
        payload.pdfFilename = file.name;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'A guardar…';
      try {
        const res = await fetch('/api/qrcodes/' + editingId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Falha ao guardar');
        window.location.reload();
      } catch (e) {
        errorEl.textContent = e.message;
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar';
      }
    });

    document.querySelectorAll('[data-action="archive"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Arquivar este QR code? Deixa de ficar visível na lista.')) return;
        const id = btn.dataset.id;
        const res = await fetch('/api/qrcodes/' + id + '/archive', { method: 'POST' });
        if (res.ok) {
          document.querySelector(`.card[data-id="${id}"]`)?.remove();
        }
      });
    });
  }

  return { initCreate, initDashboard };
})();
