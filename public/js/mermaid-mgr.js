// Mermaid Diagram Rendering & Zoom Modal Manager
(function (root) {
  'use strict';

  let currentTheme = 'dark';
  let isMermaidReady = false;
  let renderCounter = 0;
  const svgCache = new Map(); // cacheKey -> svg string

  function initMermaid(theme = 'dark') {
    currentTheme = theme;
    if (typeof window.mermaid !== 'undefined') {
      try {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: theme === 'dark' ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          themeVariables: theme === 'dark' ? {
            darkMode: true,
            background: '#1e293b',
            primaryColor: '#3b82f6',
            primaryTextColor: '#f8fafc',
            primaryBorderColor: '#60a5fa',
            lineColor: '#94a3b8',
            secondaryColor: '#8b5cf6',
            tertiaryColor: '#0f172a'
          } : {
            darkMode: false,
            background: '#ffffff',
            primaryColor: '#e0f2fe',
            primaryTextColor: '#0f172a',
            primaryBorderColor: '#0284c7',
            lineColor: '#475569',
            secondaryColor: '#f3e8ff',
            tertiaryColor: '#f8fafc'
          }
        });
        isMermaidReady = true;
      } catch (e) {
        console.error('Failed to initialize Mermaid:', e);
      }
    }
  }

  function clearCache() {
    svgCache.clear();
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  /**
   * Render a single mermaid diagram from text
   */
  async function renderDiagram(rawCode) {
    if (!isMermaidReady && typeof window.mermaid !== 'undefined') {
      initMermaid(currentTheme);
    }

    if (!window.mermaid || !window.mermaid.render) {
      throw new Error('Mermaid library not loaded');
    }

    const trimmed = rawCode.trim();
    const cacheKey = `${currentTheme}_${hashString(trimmed)}`;

    if (svgCache.has(cacheKey)) {
      return svgCache.get(cacheKey);
    }

    renderCounter++;
    const id = `mermaid-svg-${Date.now()}-${renderCounter}`;

    try {
      // Mermaid 10+ render returns { svg, bindFunctions }
      const res = await window.mermaid.render(id, trimmed);
      const svg = res.svg || '';
      svgCache.set(cacheKey, svg);
      return svg;
    } catch (err) {
      // Clean up any stale temporary elements Mermaid may leave in document
      const tempEl = document.getElementById(id) || document.getElementById('d' + id);
      if (tempEl && tempEl.parentNode) {
        tempEl.parentNode.removeChild(tempEl);
      }
      throw err;
    }
  }

  /**
   * Process all mermaid blocks within a given container element
   */
  async function processContainer(container, options = { showDiagrams: true }) {
    if (!container) return;

    // Find all mermaid candidates:
    // 1. pre > code.language-mermaid
    // 2. pre > code.mermaid
    // 3. pre.mermaid
    const selector = 'pre > code.language-mermaid, pre > code.mermaid, pre.mermaid';
    const elements = Array.from(container.querySelectorAll(selector));

    for (const codeEl of elements) {
      const preEl = codeEl.tagName.toLowerCase() === 'pre' ? codeEl : codeEl.closest('pre');
      if (!preEl || preEl.dataset.mermaidProcessed === 'true') continue;

      const rawCode = codeEl.textContent.trim();
      if (!rawCode) continue;

      // Mark as processed so we don't reprocess on minor events
      preEl.dataset.mermaidProcessed = 'true';

      // Create a diagram wrapper container
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-wrapper';

      const toolbar = document.createElement('div');
      toolbar.className = 'mermaid-toolbar';
      toolbar.innerHTML = `
        <div class="mermaid-badge">
          <span class="mermaid-icon">📊</span> Mermaid Diagram
        </div>
        <div class="mermaid-actions">
          <button type="button" class="btn-mermaid-action btn-toggle-code" title="Toggle Code / Diagram">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg> Code
          </button>
          <button type="button" class="btn-mermaid-action btn-copy-svg" title="Copy Diagram as SVG">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy SVG
          </button>
          <button type="button" class="btn-mermaid-action btn-zoom-diagram" title="Inspect & Zoom Diagram">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg> Zoom
          </button>
        </div>
      `;

      const diagramView = document.createElement('div');
      diagramView.className = 'mermaid-render-area';

      // Keep original pre as the code view
      preEl.classList.add('mermaid-raw-code');
      preEl.style.display = 'none';

      wrapper.appendChild(toolbar);
      wrapper.appendChild(diagramView);

      // Insert wrapper before pre, then move pre inside wrapper
      preEl.parentNode.insertBefore(wrapper, preEl);
      wrapper.appendChild(preEl);

      // Event: Toggle Code / Diagram
      const btnToggle = toolbar.querySelector('.btn-toggle-code');
      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCodeVisible = preEl.style.display !== 'none';
        if (isCodeVisible) {
          preEl.style.display = 'none';
          diagramView.style.display = 'flex';
          btnToggle.classList.remove('active');
        } else {
          preEl.style.display = 'block';
          diagramView.style.display = 'none';
          btnToggle.classList.add('active');
        }
      });

      // Render the diagram
      try {
        const svgContent = await renderDiagram(rawCode);
        diagramView.innerHTML = svgContent;

        // Event: Copy SVG
        const btnCopy = toolbar.querySelector('.btn-copy-svg');
        btnCopy.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(svgContent);
            btnCopy.innerHTML = `<span style="color:#10b981;">✓ Copied!</span>`;
            setTimeout(() => {
              btnCopy.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy SVG`;
            }, 1800);
          } catch (err) {
            console.error('Copy failed:', err);
          }
        });

        // Event: Zoom / Fullscreen Modal
        const btnZoom = toolbar.querySelector('.btn-zoom-diagram');
        btnZoom.addEventListener('click', (e) => {
          e.stopPropagation();
          openZoomModal(svgContent, rawCode);
        });

      } catch (err) {
        diagramView.innerHTML = `
          <div class="mermaid-error-notice">
            <div class="mermaid-error-header">
              <span class="warning-icon">⚠️</span> <strong>Mermaid Syntax Issue</strong>
            </div>
            <p class="mermaid-error-msg">${escapeHtml(err.message || 'Syntax error in Mermaid definition')}</p>
            <p class="mermaid-error-hint">Click "Code" above to edit or review the diagram syntax.</p>
          </div>
        `;
        // Show raw code as well so user sees what caused it
        preEl.style.display = 'block';
        btnToggle.classList.add('active');
      }
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Zoom Modal Logic
  let modalEl = null;
  let zoomScale = 1;
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let translateX = 0;
  let translateY = 0;

  function setupModal() {
    if (document.getElementById('mermaid-zoom-modal')) return;

    modalEl = document.createElement('div');
    modalEl.id = 'mermaid-zoom-modal';
    modalEl.className = 'modal-backdrop';
    modalEl.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title">
            <span class="modal-icon">🔍</span> Mermaid Diagram Inspector
          </div>
          <div class="modal-controls">
            <button class="btn-modal-tool" id="btn-zoom-out" title="Zoom Out (-)">−</button>
            <span class="zoom-level-badge" id="zoom-level-label">100%</span>
            <button class="btn-modal-tool" id="btn-zoom-in" title="Zoom In (+)">+</button>
            <button class="btn-modal-tool" id="btn-zoom-reset" title="Reset View">Reset</button>
            <button class="btn-modal-tool" id="btn-download-svg" title="Download SVG">⬇ SVG</button>
            <button class="btn-modal-tool" id="btn-copy-raw-code" title="Copy Mermaid Code">Copy Code</button>
            <button class="btn-modal-close" id="btn-modal-close" title="Close (Esc)">✕</button>
          </div>
        </div>
        <div class="modal-body" id="modal-pan-viewport">
          <div class="modal-canvas" id="modal-diagram-canvas"></div>
        </div>
        <div class="modal-footer">
          <span>💡 Tip: Click and drag to pan around. Scroll or use +/- to zoom. Press <kbd>Esc</kbd> to close.</span>
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);

    // Event listeners for modal
    const closeBtn = modalEl.querySelector('#btn-modal-close');
    closeBtn.addEventListener('click', closeZoomModal);

    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeZoomModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl.classList.contains('active')) {
        closeZoomModal();
      }
    });

    // Zoom buttons
    const canvas = modalEl.querySelector('#modal-diagram-canvas');
    const label = modalEl.querySelector('#zoom-level-label');

    function updateTransform() {
      canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomScale})`;
      label.textContent = `${Math.round(zoomScale * 100)}%`;
    }

    modalEl.querySelector('#btn-zoom-in').addEventListener('click', () => {
      zoomScale = Math.min(zoomScale * 1.25, 5);
      updateTransform();
    });

    modalEl.querySelector('#btn-zoom-out').addEventListener('click', () => {
      zoomScale = Math.max(zoomScale / 1.25, 0.2);
      updateTransform();
    });

    modalEl.querySelector('#btn-zoom-reset').addEventListener('click', () => {
      zoomScale = 1;
      translateX = 0;
      translateY = 0;
      updateTransform();
    });

    // Pan with mouse drag
    const viewport = modalEl.querySelector('#modal-pan-viewport');
    viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isPanning = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      if (isPanning) {
        isPanning = false;
        viewport.style.cursor = 'grab';
      }
    });

    // Wheel zoom
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.15 : 0.85;
      zoomScale = Math.min(Math.max(zoomScale * delta, 0.2), 5);
      updateTransform();
    }, { passive: false });
  }

  function openZoomModal(svgContent, rawCode) {
    setupModal();
    const canvas = modalEl.querySelector('#modal-diagram-canvas');
    canvas.innerHTML = svgContent;

    // Reset zoom and pan
    zoomScale = 1;
    translateX = 0;
    translateY = 0;
    canvas.style.transform = 'translate(0px, 0px) scale(1)';
    modalEl.querySelector('#zoom-level-label').textContent = '100%';

    // Download SVG handler
    const dlBtn = modalEl.querySelector('#btn-download-svg');
    dlBtn.onclick = () => {
      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mermaid-diagram-${Date.now()}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    // Copy raw code handler
    const copyBtn = modalEl.querySelector('#btn-copy-raw-code');
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(rawCode);
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy Code'; }, 1800);
      } catch (e) {
        console.error('Failed to copy code:', e);
      }
    };

    modalEl.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeZoomModal() {
    if (modalEl) {
      modalEl.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  root.MermaidManager = {
    init: initMermaid,
    clearCache: clearCache,
    processContainer: processContainer,
    setTheme: function (theme) {
      if (theme !== currentTheme) {
        clearCache();
        initMermaid(theme);
      }
    },
    openZoomModal: openZoomModal
  };

})(window);
