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
      } else {
        logoBase64 = null;
      }
      triggerPreview();
    });

    [fgColor, bgColor].forEach(el => el.addEventListener('input', () => triggerPreview()));
    urlInput.addEventListener('input', debounce(() => triggerPreview(), 400));

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
    const cancelBtn = document.getElementById('editCancel');
    const saveBtn = document.getElementById('editSave');
    let editingId = null;

    document.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        editingId = btn.dataset.id;
        input.value = btn.dataset.current || '';
        modal.classList.add('open');
        input.focus();
      });
    });

    cancelBtn.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

    saveBtn.addEventListener('click', async () => {
      if (!editingId || !input.value) return;
      saveBtn.disabled = true;
      try {
        const res = await fetch('/api/qrcodes/' + editingId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination: input.value.trim() }),
        });
        if (!res.ok) throw new Error('Falha ao guardar');
        window.location.reload();
      } catch (e) {
        alert(e.message);
      } finally {
        saveBtn.disabled = false;
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
