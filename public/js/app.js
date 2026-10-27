// Simple Dark Neutral Markdown Viewer using Showdown
(function () {
  'use strict';

  // Sample agent markdown content
  const DEFAULT_SAMPLE = `# Agent Workflow & Execution Plan

> System initialized. Worker pool ready with isolated task sandboxes.

## 1. System Architecture

\`\`\`mermaid
flowchart TD
    User([User Prompt]) --> Agent[Primary Agent]
    Agent --> Planner{Task Planner}
    
    Planner -->|Execute Tool| Sandbox[Tool Sandbox]
    Planner -->|Direct Response| Output([Final Result])
    
    Sandbox --> Results[(Execution Output)]
    Results --> Planner
\`\`\`

## 2. Interaction Sequence

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant Agent as Agent CLI
    participant LLM as Model Gateway
    participant Tool as Sandbox

    Dev->>Agent: Send task prompt
    Agent->>LLM: Stream prompt + tools
    LLM-->>Agent: Function call: run_command
    Agent->>Tool: Execute script
    Tool-->>Agent: Exit code 0 + stdout
    Agent->>LLM: Send execution output
    LLM-->>Agent: Final response
    Agent-->>Dev: Ready view
\`\`\`

## 3. Implementation Checklist

- [x] Configure Showdown with GFM tables and task lists
- [x] Style neutral dark theme with zero blue tint
- [x] Integrate Mermaid dark theme rendering
- [ ] Implement user custom snippet shortcuts

## 4. Parameter Specification

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| \`maxConcurrency\` | \`number\` | \`4\` | Max concurrent subagents |
| \`timeoutMs\` | \`number\` | \`10000\` | Process timeout limit |
| \`streamMode\` | \`boolean\` | \`true\` | Stream tokens directly |

## 5. Sample Script

\`\`\`bash
# Run local viewer
npm start
\`\`\`
`;

  // Initialize Showdown Converter
  let converter = null;
  if (typeof window.showdown !== 'undefined') {
    converter = new window.showdown.Converter({
      tables: true,
      tasklists: true,
      strikethrough: true,
      ghCodeBlocks: true,
      simplifiedAutoLink: true,
      openLinksInNewWindow: true,
      emoji: true,
      simpleLineBreaks: false,
      ghCompatibleHeaderId: true,
      parseImgDimensions: true,
      smoothLiveStreaming: true
    });
  }

  // Initialize Mermaid with Dark Neutral Theme
  let mermaidReady = false;
  if (typeof window.mermaid !== 'undefined') {
    try {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        themeVariables: {
          darkMode: true,
          background: '#161616',
          primaryColor: '#262626',
          primaryTextColor: '#e5e5e5',
          primaryBorderColor: '#444444',
          lineColor: '#777777',
          secondaryColor: '#202020',
          tertiaryColor: '#181818',
          mainBkg: '#222222',
          nodeBorder: '#444444',
          clusterBkg: '#1a1a1a',
          clusterBorder: '#333333',
          defaultLinkColor: '#777777',
          titleColor: '#e5e5e5',
          edgeLabelBackground: '#1e1e1e',
          actorBkg: '#222222',
          actorBorder: '#444444',
          actorTextColor: '#e5e5e5',
          signalColor: '#888888',
          signalTextColor: '#e5e5e5'
        }
      });
      mermaidReady = true;
    } catch (e) {
      console.error('Mermaid init error:', e);
    }
  }

  // DOM Elements
  const elements = {
    textarea: document.getElementById('markdown-input'),
    preview: document.getElementById('preview-content'),
    previewContainer: document.querySelector('.preview-content'),
    workspace: document.getElementById('workspace'),
    editorPane: document.getElementById('editor-pane'),
    splitDivider: document.getElementById('split-divider'),
    btnPaste: document.getElementById('btn-paste'),
    btnCopyMd: document.getElementById('btn-copy-md'),
    btnCopyHtml: document.getElementById('btn-copy-html'),
    btnGuide: document.getElementById('btn-guide'),
    btnClear: document.getElementById('btn-clear'),
    btnSync: document.getElementById('btn-sync'),
    btnSample: document.getElementById('btn-sample'),
    modeBtns: document.querySelectorAll('.btn-mode'),
    statLines: document.getElementById('stat-lines'),
    statWords: document.getElementById('stat-words'),
    statChars: document.getElementById('stat-chars'),
    dropOverlay: document.getElementById('drop-overlay'),
    toastContainer: document.getElementById('toast-container'),
    zoomModal: document.getElementById('zoom-modal'),
    modalCanvas: document.getElementById('modal-canvas'),
    modalLabel: document.getElementById('zoom-label'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnZoomReset: document.getElementById('btn-zoom-reset'),
    btnDownloadSvg: document.getElementById('btn-download-svg'),
    viewport: document.getElementById('modal-viewport'),
    guideModal: document.getElementById('guide-modal'),
    btnCloseGuide: document.getElementById('btn-close-guide'),
    guideSearch: document.getElementById('guide-search')
  };

  let debounceTimer = null;
  let renderCounter = 0;
  let currentSvg = '';
  let zoomScale = 1;
  let isPanning = false;
  let startX = 0, startY = 0, translateX = 0, translateY = 0;

  // Sync scroll state (Option 2: Section & Heading Anchors)
  let syncScrollEnabled = localStorage.getItem('markdown_viewer_sync_scroll') !== 'false';
  let syncPairs = [];
  let activeScrollSource = null;
  let isSyncing = false;
  let syncRafId = null;

  // Initialize
  function init() {
    // Restore saved split width
    const savedSplit = localStorage.getItem('markdown_viewer_split_width');
    if (savedSplit && elements.editorPane) {
      elements.editorPane.style.width = savedSplit;
    }

    // Restore saved view mode
    const urlMode = new URLSearchParams(window.location.search).get('mode');
    const savedMode = urlMode || localStorage.getItem('markdown_viewer_mode') || 'split';
    setViewMode(savedMode);

    // Initial content (defaults to blank unless previously saved by user or ?sample=true)
    const urlSample = new URLSearchParams(window.location.search).get('sample');
    const savedContent = localStorage.getItem('markdown_viewer_content');
    let content = '';

    if (urlSample === 'true' || urlSample === '1') {
      content = DEFAULT_SAMPLE;
    } else if (savedContent !== null) {
      content = savedContent;
    }

    elements.textarea.value = content;
    updateStats(content);
    renderMarkdown(content);

    // Expose clean bridge for NotesManager and future refactoring
    window.MarkdownViewer = {
      getContent: () => elements.textarea.value,
      setContent: (val) => {
        elements.textarea.value = val;
        updateStats(val);
        localStorage.setItem('markdown_viewer_content', val);
        renderMarkdown(val);
      },
      showToast: (msg, duration, onUndo) => showToast(msg, duration, onUndo),
      render: (val) => renderMarkdown(val)
    };

    bindEvents();
    setupHotkeys();
    setupSyncScroll();

    if (new URLSearchParams(window.location.search).get('guide') === 'true') {
      openGuideModal();
    }
  }

  // Action Handlers
  let lastClearedContent = '';

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        elements.textarea.value = text;
        updateStats(text);
        localStorage.setItem('markdown_viewer_content', text);
        renderMarkdown(text);
        showToast('Pasted from clipboard');
      } else {
        showToast('Clipboard is empty');
      }
    } catch (err) {
      showToast('Use Ctrl+V to paste');
    }
  }

  function handleClear() {
    if (!elements.textarea.value) return;
    lastClearedContent = elements.textarea.value;
    const prevActiveId = window.NotesManager ? window.NotesManager.activeNoteId : null;
    if (window.NotesManager) {
      window.NotesManager.onEditorCleared();
    }
    elements.textarea.value = '';
    updateStats('');
    localStorage.removeItem('markdown_viewer_content');
    renderMarkdown('');
    showToast('Cleared editor', 3200, async () => {
      elements.textarea.value = lastClearedContent;
      updateStats(lastClearedContent);
      localStorage.setItem('markdown_viewer_content', lastClearedContent);
      renderMarkdown(lastClearedContent);
      if (prevActiveId && window.NotesManager) {
        const note = await window.NotesManager.db.get(prevActiveId);
        if (note) window.NotesManager.setActiveNote(note);
      }
      showToast('Restored content');
    });
  }

  function handleSample() {
    elements.textarea.value = DEFAULT_SAMPLE;
    updateStats(DEFAULT_SAMPLE);
    localStorage.setItem('markdown_viewer_content', DEFAULT_SAMPLE);
    renderMarkdown(DEFAULT_SAMPLE);
    showToast('Loaded sample');
  }

  async function handleCopyHtml() {
    if (!converter) return;
    const html = converter.makeHtml(elements.textarea.value);
    try {
      await navigator.clipboard.writeText(html);
      showToast('Copied HTML to clipboard');
    } catch (e) {
      showToast('Failed to copy');
    }
  }

  async function handleCopyMarkdown() {
    const md = elements.textarea.value;
    if (!md) {
      showToast('Nothing to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(md);
      showToast('Copied Markdown (Alt+C)');
    } catch (e) {
      showToast('Failed to copy');
    }
  }

  // Bind Events
  function bindEvents() {
    // Live typing with debounce
    elements.textarea.addEventListener('input', () => {
      const text = elements.textarea.value;
      updateStats(text);
      localStorage.setItem('markdown_viewer_content', text);
      if (window.NotesManager) {
        window.NotesManager.markDirty();
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        renderMarkdown(text);
      }, 100);
    });

    elements.btnPaste.addEventListener('click', handlePaste);
    elements.btnCopyMd.addEventListener('click', handleCopyMarkdown);
    elements.btnClear.addEventListener('click', handleClear);
    elements.btnSample.addEventListener('click', handleSample);
    elements.btnCopyHtml.addEventListener('click', handleCopyHtml);

    // View mode buttons
    elements.modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        setViewMode(mode);
        localStorage.setItem('markdown_viewer_mode', mode);
      });
    });

    // Split pane resize
    setupSplitResize();

    // Drag and drop files
    setupDragAndDrop();

    // Zoom modal events
    setupModalEvents();
  }

  // Keyboard Shortcuts (Hotkeys)
  function setupHotkeys() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger standard workspace hotkeys if any modal is open
      const hasActiveModal = elements.zoomModal.classList.contains('active') ||
        elements.guideModal.classList.contains('active') ||
        (document.getElementById('notes-modal') && document.getElementById('notes-modal').classList.contains('active')) ||
        (document.getElementById('save-modal') && document.getElementById('save-modal').classList.contains('active'));

      if (hasActiveModal) return;

      // Check for Alt key shortcuts
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();

        // Clear: Shift+Alt+C or Shift+Alt+K
        if (e.shiftKey && (key === 'c' || key === 'k')) {
          e.preventDefault();
          handleClear();
          return;
        }

        // Copy Markdown: Alt+C (without shift)
        if (!e.shiftKey && key === 'c') {
          e.preventDefault();
          handleCopyMarkdown();
          return;
        }

        // Guide / Cheatsheet: Alt+/ or Alt+?
        if (key === '/' || key === '?') {
          e.preventDefault();
          if (elements.guideModal.classList.contains('active')) {
            closeGuideModal();
          } else {
            openGuideModal();
          }
          return;
        }

        // For other keys, ignore if Shift is held down
        if (e.shiftKey) return;

        // Alt+1 or Alt+S: Split mode
        if (key === '1' || key === 's') {
          e.preventDefault();
          setViewMode('split');
          localStorage.setItem('markdown_viewer_mode', 'split');
          showToast('View: Split (Alt+1)');
        }
        // Alt+2 or Alt+P: Preview mode
        else if (key === '2' || key === 'p') {
          e.preventDefault();
          setViewMode('preview');
          localStorage.setItem('markdown_viewer_mode', 'preview');
          showToast('View: Preview (Alt+2)');
        }
        // Alt+3 or Alt+E: Editor mode
        else if (key === '3' || key === 'e') {
          e.preventDefault();
          setViewMode('editor');
          localStorage.setItem('markdown_viewer_mode', 'editor');
          showToast('View: Editor (Alt+3)');
        }
        // Alt+V: Paste from clipboard
        else if (key === 'v') {
          e.preventDefault();
          handlePaste();
        }
        // Alt+T: Sample template
        else if (key === 't') {
          e.preventDefault();
          handleSample();
        }
        // Alt+H: Copy HTML
        else if (key === 'h') {
          e.preventDefault();
          handleCopyHtml();
        }
        // Alt+X: Toggle sync scroll
        else if (key === 'x') {
          e.preventDefault();
          toggleSyncScroll();
        }
      }
    });
  }

  // Set View Mode: 'split' | 'preview' | 'editor'
  function setViewMode(mode) {
    elements.modeBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    elements.workspace.classList.remove('preview-only', 'editor-only');
    if (mode === 'preview') {
      elements.workspace.classList.add('preview-only');
      if (elements.btnSync) elements.btnSync.style.display = 'none';
    } else if (mode === 'editor') {
      elements.workspace.classList.add('editor-only');
      if (elements.btnSync) elements.btnSync.style.display = 'none';
    } else {
      if (elements.btnSync) elements.btnSync.style.display = '';
      setTimeout(buildSyncAnchors, 60);
    }
  }

  // Render Markdown using Showdown + Mermaid + Prism
  async function renderMarkdown(markdown) {
    if (!converter) {
      elements.preview.innerHTML = '<p style="color:#ef4444;">Showdown library not loaded.</p>';
      return;
    }

    if (!markdown || !markdown.trim()) {
      syncPairs = [];
      elements.preview.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✍️</div>
          <div class="empty-state-title">Ready for Markdown</div>
          <div class="empty-state-desc">Paste text from your agent on the left or press <kbd>Alt+T</kbd> to load sample.</div>
        </div>
      `;
      return;
    }

    // 1. Convert markdown to HTML via Showdown
    const html = converter.makeHtml(markdown);
    elements.preview.innerHTML = html;

    // 2. Syntax highlighting with Prism (exclude mermaid)
    if (typeof window.Prism !== 'undefined') {
      elements.preview.querySelectorAll('pre > code').forEach(code => {
        if (!code.classList.contains('mermaid') && !code.classList.contains('language-mermaid')) {
          try {
            window.Prism.highlightElement(code);
          } catch (e) {}
        }
      });
    }

    // 3. Process Mermaid Diagrams
    await processMermaidDiagrams(elements.preview);

    // 4. Update sync scroll anchors
    buildSyncAnchors();
  }

  // Process Mermaid Blocks
  async function processMermaidDiagrams(container) {
    if (!mermaidReady || !window.mermaid || !window.mermaid.render) return;

    const selector = 'pre > code.mermaid, pre > code.language-mermaid, pre.mermaid';
    const elementsList = Array.from(container.querySelectorAll(selector));

    for (const codeEl of elementsList) {
      const preEl = codeEl.tagName.toLowerCase() === 'pre' ? codeEl : codeEl.closest('pre');
      if (!preEl || preEl.dataset.processed === 'true') continue;

      const rawCode = codeEl.textContent.trim();
      if (!rawCode) continue;

      preEl.dataset.processed = 'true';

      // Create diagram wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-wrapper';

      const toolbar = document.createElement('div');
      toolbar.className = 'mermaid-toolbar';
      toolbar.innerHTML = `
        <span class="mermaid-label">Diagram</span>
        <div class="mermaid-actions">
          <button type="button" class="btn-diagram-tool btn-toggle-code" title="Toggle Code / Diagram">Code</button>
          <button type="button" class="btn-diagram-tool btn-copy-svg" title="Copy Diagram SVG">Copy SVG</button>
          <button type="button" class="btn-diagram-tool btn-zoom-diagram" title="Inspect & Zoom">Zoom</button>
        </div>
      `;

      const renderArea = document.createElement('div');
      renderArea.className = 'mermaid-render-area';

      preEl.classList.add('mermaid-raw-code');
      preEl.style.display = 'none';

      wrapper.appendChild(toolbar);
      wrapper.appendChild(renderArea);

      preEl.parentNode.insertBefore(wrapper, preEl);
      wrapper.appendChild(preEl);

      // Toggle code/diagram
      const btnToggle = toolbar.querySelector('.btn-toggle-code');
      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const codeHidden = preEl.style.display === 'none';
        if (codeHidden) {
          preEl.style.display = 'block';
          renderArea.style.display = 'none';
          btnToggle.classList.add('active');
        } else {
          preEl.style.display = 'none';
          renderArea.style.display = 'flex';
          btnToggle.classList.remove('active');
        }
      });

      // Render SVG
      renderCounter++;
      const id = `mermaid-svg-${Date.now()}-${renderCounter}`;

      try {
        const res = await window.mermaid.render(id, rawCode);
        const svg = res.svg || '';
        renderArea.innerHTML = svg;

        // Copy SVG button
        const btnCopy = toolbar.querySelector('.btn-copy-svg');
        btnCopy.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(svg);
            btnCopy.textContent = 'Copied!';
            setTimeout(() => { btnCopy.textContent = 'Copy SVG'; }, 1800);
          } catch (err) {
            console.error(err);
          }
        });

        // Zoom button
        const btnZoom = toolbar.querySelector('.btn-zoom-diagram');
        btnZoom.addEventListener('click', (e) => {
          e.stopPropagation();
          openZoomModal(svg);
        });

      } catch (err) {
        // Clean up temporary DOM artifacts if any
        const tempEl = document.getElementById(id) || document.getElementById('d' + id);
        if (tempEl && tempEl.parentNode) tempEl.parentNode.removeChild(tempEl);

        renderArea.innerHTML = `
          <div class="mermaid-error-notice">
            <strong>Mermaid Syntax Notice</strong>
            <div class="mermaid-error-msg">${escapeHtml(err.message || 'Syntax error')}</div>
          </div>
        `;
        preEl.style.display = 'block';
        btnToggle.classList.add('active');
      }
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Modal Events (Zoom & Guide)
  function setupModalEvents() {
    // Zoom Modal
    elements.btnCloseModal.addEventListener('click', closeZoomModal);

    elements.zoomModal.addEventListener('click', (e) => {
      if (e.target === elements.zoomModal) closeZoomModal();
    });

    // Guide Modal
    elements.btnGuide?.addEventListener('click', openGuideModal);
    elements.btnCloseGuide?.addEventListener('click', closeGuideModal);

    elements.guideModal?.addEventListener('click', (e) => {
      if (e.target === elements.guideModal) closeGuideModal();
    });

    elements.guideSearch?.addEventListener('input', () => {
      filterGuide(elements.guideSearch.value);
    });

    // Copy syntax snippets in guide
    document.querySelectorAll('.btn-copy-syntax').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = btn.dataset.copy;
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = orig; }, 1400);
          showToast('Copied snippet to clipboard');
        } catch (err) {
          console.error(err);
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (elements.guideModal.classList.contains('active')) {
          closeGuideModal();
        } else if (elements.zoomModal.classList.contains('active')) {
          closeZoomModal();
        }
      } else if (elements.zoomModal.classList.contains('active')) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          zoomScale = Math.min(zoomScale * 1.25, 5);
          updateTransform();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          zoomScale = Math.max(zoomScale / 1.25, 0.2);
          updateTransform();
        } else if (e.key === '0') {
          e.preventDefault();
          zoomScale = 1;
          translateX = 0;
          translateY = 0;
          updateTransform();
        }
      }
    });

    function updateTransform() {
      elements.modalCanvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomScale})`;
      elements.modalLabel.textContent = `${Math.round(zoomScale * 100)}%`;
    }

    elements.btnZoomIn.addEventListener('click', () => {
      zoomScale = Math.min(zoomScale * 1.25, 5);
      updateTransform();
    });

    elements.btnZoomOut.addEventListener('click', () => {
      zoomScale = Math.max(zoomScale / 1.25, 0.2);
      updateTransform();
    });

    elements.btnZoomReset.addEventListener('click', () => {
      zoomScale = 1;
      translateX = 0;
      translateY = 0;
      updateTransform();
    });

    elements.btnDownloadSvg.addEventListener('click', () => {
      if (!currentSvg) return;
      const blob = new Blob([currentSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagram-${Date.now()}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Mouse drag to pan
    elements.viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isPanning = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      elements.viewport.style.cursor = 'grabbing';
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
        elements.viewport.style.cursor = 'grab';
      }
    });

    // Scrollwheel to zoom
    elements.viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.15 : 0.85;
      zoomScale = Math.min(Math.max(zoomScale * delta, 0.2), 5);
      updateTransform();
    }, { passive: false });
  }

  function openZoomModal(svgContent) {
    currentSvg = svgContent;
    elements.modalCanvas.innerHTML = svgContent;

    const svgEl = elements.modalCanvas.querySelector('svg');
    if (svgEl) {
      // Clear restrictive inline max-width so zoom modal can control sizing
      svgEl.style.maxWidth = '';
      svgEl.style.minWidth = '';

      // Ensure explicit width & height attributes from viewBox so flexbox calculates intrinsic dimensions
      let vbWidth = 0;
      let vbHeight = 0;
      if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width > 0) {
        vbWidth = svgEl.viewBox.baseVal.width;
        vbHeight = svgEl.viewBox.baseVal.height;
      } else {
        const vb = svgEl.getAttribute('viewBox');
        if (vb) {
          const parts = vb.trim().split(/[\s,]+/).map(Number);
          if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
            vbWidth = parts[2];
            vbHeight = parts[3];
          }
        }
      }
      if (vbWidth > 0 && vbHeight > 0) {
        svgEl.setAttribute('width', vbWidth);
        svgEl.setAttribute('height', vbHeight);
      }
    }

    zoomScale = 1;
    translateX = 0;
    translateY = 0;
    elements.modalCanvas.style.transform = 'translate(0px, 0px) scale(1)';
    elements.modalLabel.textContent = '100%';
    elements.zoomModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeZoomModal() {
    elements.zoomModal.classList.remove('active');
    document.body.style.overflow = '';
    elements.modalCanvas.innerHTML = '';
  }

  // Guide Modal Controls
  function openGuideModal() {
    elements.guideModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    elements.guideSearch.value = '';
    filterGuide('');
    setTimeout(() => elements.guideSearch.focus(), 60);
  }

  function closeGuideModal() {
    elements.guideModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  function filterGuide(query) {
    const q = (query || '').trim().toLowerCase();
    const cards = elements.guideModal.querySelectorAll('.pitfall-card, .syntax-card');
    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      const tags = (card.dataset.tags || '').toLowerCase();
      const matches = !q || text.includes(q) || tags.includes(q);
      card.style.display = matches ? 'flex' : 'none';
    });
  }

  // Split resize
  function setupSplitResize() {
    let isDragging = false;

    elements.splitDivider.addEventListener('mousedown', () => {
      isDragging = true;
      elements.splitDivider.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const containerWidth = elements.workspace.getBoundingClientRect().width;
      const newWidth = Math.max(260, Math.min(e.clientX, containerWidth - 280));
      elements.editorPane.style.width = `${newWidth}px`;
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        elements.splitDivider.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('markdown_viewer_split_width', elements.editorPane.style.width);
        buildSyncAnchors();
      }
    });
  }


  // ==========================================
  // Synchronized Scrolling (Accurate Block & Line Measurement)
  // ==========================================
  function buildSyncAnchors() {
    if (!elements.textarea || !elements.previewContainer || !elements.preview) return;

    const text = elements.textarea.value;
    if (!text || !text.trim()) {
      syncPairs = [];
      return;
    }

    const lines = text.split('\n');
    const cs = window.getComputedStyle(elements.textarea);

    // 1. Measure exact line pixel positions using a hidden mirror div
    // This perfectly accounts for font metrics, paddings, and soft-wrapped lines.
    const mirror = document.createElement('div');
    mirror.style.position = 'absolute';
    mirror.style.top = '-9999px';
    mirror.style.left = '-9999px';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.boxSizing = cs.boxSizing;
    mirror.style.width = elements.textarea.clientWidth + 'px';
    mirror.style.padding = cs.padding;
    mirror.style.border = cs.border;
    mirror.style.fontFamily = cs.fontFamily;
    mirror.style.fontSize = cs.fontSize;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordBreak = 'break-word';
    mirror.style.tabSize = cs.tabSize;

    let mirrorHtml = '';
    for (let i = 0; i < lines.length; i++) {
      const escaped = lines[i] ? lines[i].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '&nbsp;';
      mirrorHtml += '<span id="sync-l-' + i + '">' + escaped + '</span>\n';
    }
    mirror.innerHTML = mirrorHtml;
    document.body.appendChild(mirror);

    const paddingTop = parseFloat(cs.paddingTop) || 0;
    const lineTops = new Float32Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
      const el = document.getElementById('sync-l-' + i);
      lineTops[i] = el ? Math.max(0, el.offsetTop - paddingTop) : 0;
    }
    document.body.removeChild(mirror);

    // 2. Identify rich block elements in markdown (headings, code/diagrams, tables, lists, quotes, paragraphs)
    const mdBlocks = [];
    let inCode = false;
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        if (!inCode) {
          mdBlocks.push({ type: 'code', line: idx, text: trimmed });
        }
        inCode = !inCode;
        return;
      }
      if (inCode) return;

      if (/^#{1,6}\s+/.test(trimmed)) {
        const level = trimmed.match(/^#{1,6}/)[0].length;
        mdBlocks.push({ type: 'heading', level, line: idx, text: trimmed.replace(/^#{1,6}\s+/, '').trim() });
      } else if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
        mdBlocks.push({ type: 'hr', line: idx, text: '---' });
      } else if (/^\|.+\|\s*$/.test(trimmed)) {
        if (idx === 0 || !/^\|.+\|\s*$/.test(lines[idx - 1].trim())) {
          mdBlocks.push({ type: 'table', line: idx, text: 'table' });
        }
      } else if (/^\s*([*+-]|\d+\.)\s+/.test(line)) {
        mdBlocks.push({ type: 'li', line: idx, text: trimmed.slice(0, 40) });
      } else if (/^>\s+/.test(trimmed)) {
        if (idx === 0 || !/^>\s+/.test(lines[idx - 1].trim())) {
          mdBlocks.push({ type: 'quote', line: idx, text: trimmed.slice(0, 40) });
        }
      } else if (trimmed.length > 0 && (idx === 0 || lines[idx - 1].trim().length === 0)) {
        mdBlocks.push({ type: 'p', line: idx, text: trimmed.slice(0, 40) });
      }
    });

    // 3. Match with preview block elements
    const previewBlocks = Array.from(elements.preview.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, hr, table, pre, .mermaid-wrapper, blockquote, ul > li, ol > li, p'
    )).filter(el => {
      if (el.closest('.mermaid-wrapper') && !el.classList.contains('mermaid-wrapper')) return false;
      if (el.tagName === 'P' && !el.textContent.trim()) return false;
      return true;
    });

    const maxEditor = Math.max(1, elements.textarea.scrollHeight - elements.textarea.clientHeight);
    const maxPreview = Math.max(1, elements.previewContainer.scrollHeight - elements.previewContainer.clientHeight);
    const cRect = elements.previewContainer.getBoundingClientRect();
    const cScrollTop = elements.previewContainer.scrollTop;

    const rawPairs = [
      { editorOffset: 0, previewOffset: 0 }
    ];

    let pSearchIdx = 0;
    mdBlocks.forEach((mb) => {
      const eTop = lineTops[mb.line];

      let foundIdx = -1;
      for (let pi = pSearchIdx; pi < Math.min(pSearchIdx + 6, previewBlocks.length); pi++) {
        const pEl = previewBlocks[pi];
        const pTag = pEl.tagName.toLowerCase();

        let matches = false;
        if (mb.type === 'heading' && pTag === 'h' + mb.level) matches = true;
        else if (mb.type === 'hr' && pTag === 'hr') matches = true;
        else if (mb.type === 'table' && pTag === 'table') matches = true;
        else if (mb.type === 'code' && (pTag === 'pre' || pEl.classList.contains('mermaid-wrapper'))) matches = true;
        else if (mb.type === 'li' && pTag === 'li') matches = true;
        else if (mb.type === 'quote' && pTag === 'blockquote') matches = true;
        else if (mb.type === 'p' && pTag === 'p') matches = true;

        if (matches) {
          foundIdx = pi;
          break;
        }
      }

      if (foundIdx !== -1) {
        const pEl = previewBlocks[foundIdx];
        const pRect = pEl.getBoundingClientRect();
        const pTop = Math.max(0, pRect.top - cRect.top + cScrollTop);

        rawPairs.push({
          editorOffset: Math.min(maxEditor, Math.max(0, Math.round(eTop))),
          previewOffset: Math.min(maxPreview, Math.max(0, Math.round(pTop)))
        });
        pSearchIdx = foundIdx + 1;
      }
    });

    rawPairs.push({ editorOffset: maxEditor, previewOffset: maxPreview });
    rawPairs.sort((a, b) => a.editorOffset - b.editorOffset);

    // Filter to ensure strictly monotonic non-decreasing progression
    const clean = [rawPairs[0]];
    for (let i = 1; i < rawPairs.length; i++) {
      const curr = rawPairs[i];
      const prev = clean[clean.length - 1];
      if (curr.editorOffset >= prev.editorOffset && curr.previewOffset >= prev.previewOffset) {
        if (curr.editorOffset === prev.editorOffset && curr.previewOffset === prev.previewOffset) continue;
        clean.push(curr);
      }
    }

    if (clean[clean.length - 1].editorOffset !== maxEditor || clean[clean.length - 1].previewOffset !== maxPreview) {
      clean.push({ editorOffset: maxEditor, previewOffset: maxPreview });
    }

    syncPairs = clean;
  }

  function getSyncTarget(sourcePos, sourceKey, targetKey) {
    if (!syncPairs || syncPairs.length === 0) return 0;
    if (sourcePos <= syncPairs[0][sourceKey]) return syncPairs[0][targetKey];
    const last = syncPairs[syncPairs.length - 1];
    if (sourcePos >= last[sourceKey]) return last[targetKey];

    for (let i = 0; i < syncPairs.length - 1; i++) {
      const a = syncPairs[i];
      const b = syncPairs[i + 1];
      if (sourcePos >= a[sourceKey] && sourcePos <= b[sourceKey]) {
        const span = b[sourceKey] - a[sourceKey];
        if (span <= 0) return a[targetKey];
        const ratio = (sourcePos - a[sourceKey]) / span;
        return Math.round(a[targetKey] + ratio * (b[targetKey] - a[targetKey]));
      }
    }
    return last[targetKey];
  }

  function setupSyncScroll() {
    if (!elements.textarea || !elements.previewContainer) return;

    // Track which pane is actively driven by user
    elements.textarea.addEventListener('mouseenter', () => { activeScrollSource = 'editor'; });
    elements.previewContainer.addEventListener('mouseenter', () => { activeScrollSource = 'preview'; });

    elements.textarea.addEventListener('pointerdown', () => { activeScrollSource = 'editor'; });
    elements.previewContainer.addEventListener('pointerdown', () => { activeScrollSource = 'preview'; });

    elements.textarea.addEventListener('wheel', () => { activeScrollSource = 'editor'; }, { passive: true });
    elements.previewContainer.addEventListener('wheel', () => { activeScrollSource = 'preview'; }, { passive: true });

    elements.textarea.addEventListener('touchstart', () => { activeScrollSource = 'editor'; }, { passive: true });
    elements.previewContainer.addEventListener('touchstart', () => { activeScrollSource = 'preview'; }, { passive: true });

    // Editor scroll -> syncs Preview
    elements.textarea.addEventListener('scroll', () => {
      if (!syncScrollEnabled || isSyncing || activeScrollSource === 'preview') return;
      if (syncRafId) cancelAnimationFrame(syncRafId);
      syncRafId = requestAnimationFrame(() => {
        isSyncing = true;
        const target = getSyncTarget(elements.textarea.scrollTop, 'editorOffset', 'previewOffset');
        elements.previewContainer.scrollTop = target;
        requestAnimationFrame(() => { isSyncing = false; });
      });
    }, { passive: true });

    // Preview scroll -> syncs Editor
    elements.previewContainer.addEventListener('scroll', () => {
      if (!syncScrollEnabled || isSyncing || activeScrollSource === 'editor') return;
      if (syncRafId) cancelAnimationFrame(syncRafId);
      syncRafId = requestAnimationFrame(() => {
        isSyncing = true;
        const target = getSyncTarget(elements.previewContainer.scrollTop, 'previewOffset', 'editorOffset');
        elements.textarea.scrollTop = target;
        requestAnimationFrame(() => { isSyncing = false; });
      });
    }, { passive: true });

    window.addEventListener('resize', () => {
      buildSyncAnchors();
    });

    elements.btnSync?.addEventListener('click', toggleSyncScroll);
    updateSyncButtonUI();
  }

  function toggleSyncScroll() {
    syncScrollEnabled = !syncScrollEnabled;
    localStorage.setItem('markdown_viewer_sync_scroll', syncScrollEnabled);
    updateSyncButtonUI();
    showToast(syncScrollEnabled ? 'Sync Scroll: Enabled (Alt+X)' : 'Sync Scroll: Disabled (Alt+X)');
  }

  function updateSyncButtonUI() {
    if (!elements.btnSync) return;
    if (syncScrollEnabled) {
      elements.btnSync.classList.add('active');
      elements.btnSync.title = 'Synchronized scrolling is ON in Split view (Alt+X)';
    } else {
      elements.btnSync.classList.remove('active');
      elements.btnSync.title = 'Synchronized scrolling is OFF (Alt+X)';
    }
  }

  // Drag and drop
  function setupDragAndDrop() {
    let counter = 0;
    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      counter++;
      elements.dropOverlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      counter--;
      if (counter <= 0) {
        elements.dropOverlay.classList.remove('active');
        counter = 0;
      }
    });

    window.addEventListener('dragover', (e) => e.preventDefault());

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      counter = 0;
      elements.dropOverlay.classList.remove('active');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (evt) => {
          elements.textarea.value = evt.target.result;
          updateStats(evt.target.result);
          localStorage.setItem('markdown_viewer_content', evt.target.result);
          renderMarkdown(evt.target.result);
          showToast(`Opened ${file.name}`);
        };
        reader.readAsText(file);
      }
    });
  }

  // Stats
  function updateStats(text) {
    const lines = text ? text.split('\n').length : 0;
    const words = text ? (text.trim().match(/\S+/g) || []).length : 0;
    const chars = text ? text.length : 0;

    elements.statLines.textContent = lines.toLocaleString();
    elements.statWords.textContent = words.toLocaleString();
    elements.statChars.textContent = chars.toLocaleString();
  }

  // Toast
  function showToast(message, duration = 2000, onUndo = null) {
    const toast = document.createElement('div');
    toast.className = 'toast';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    if (onUndo) {
      const undoBtn = document.createElement('button');
      undoBtn.textContent = 'Undo';
      undoBtn.style.cssText = 'background: #2b2b2b; border: 1px solid #444444; color: #ffffff; border-radius: 3px; padding: 0.15rem 0.45rem; cursor: pointer; font-size: 0.74rem; margin-left: 0.55rem;';
      undoBtn.onclick = (e) => {
        e.stopPropagation();
        onUndo();
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      };
      toast.appendChild(undoBtn);
    }

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
    }, duration);
  }

  // Run on ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
