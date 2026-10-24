// Markdown Lens - Core Application Controller
(function () {
  'use strict';

  // State
  const urlParams = new URLSearchParams(window.location.search);
  const state = {
    content: '',
    theme: urlParams.get('theme') || localStorage.getItem('markdown_lens_theme') || 'dark',
    layout: urlParams.get('layout') || localStorage.getItem('markdown_lens_layout') || 'grid-2', // 'grid-2', 'grid-1', 'tabbed'
    activeTab: urlParams.get('tab') || 'marked',
    enabledParsers: JSON.parse(localStorage.getItem('markdown_lens_enabled') || '["marked", "markdown-it", "showdown", "remarkable", "snarkdown"]'),
    cardModes: {}, // parserId -> 'preview' | 'html'
    maximizedCard: null,
    syncScroll: localStorage.getItem('markdown_lens_sync_scroll') !== 'false'
  };

  // DOM Elements
  const elements = {
    textarea: document.getElementById('markdown-input'),
    editorPane: document.getElementById('editor-pane'),
    splitDivider: document.getElementById('split-divider'),
    previewsViewport: document.getElementById('previews-viewport'),
    previewsGrid: document.getElementById('previews-grid'),
    tabNavBar: document.getElementById('tab-nav-bar'),
    sampleSelect: document.getElementById('sample-select'),
    btnPaste: document.getElementById('btn-paste-clipboard'),
    btnClear: document.getElementById('btn-clear-input'),
    btnTheme: document.getElementById('btn-toggle-theme'),
    btnLayout: document.getElementById('btn-layout-toggle'),
    btnCompare: document.getElementById('btn-open-matrix'),
    fileInput: document.getElementById('file-input'),
    btnOpenFile: document.getElementById('btn-open-file'),
    dropOverlay: document.getElementById('dropzone-overlay'),
    statLines: document.getElementById('stat-lines'),
    statWords: document.getElementById('stat-words'),
    statChars: document.getElementById('stat-chars'),
    statReadTime: document.getElementById('stat-read-time'),
    toastContainer: document.getElementById('toast-container'),
    matrixModal: document.getElementById('matrix-modal')
  };

  let debounceTimer = null;
  let isScrollingSync = false;

  // Initialize
  function init() {
    // Set initial theme
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();

    // Initialize Parsers & Mermaid
    window.MarkdownParsers.init();
    window.MermaidManager.init(state.theme);

    // Populate Sample Selector
    populateSamples();

    // Restore saved split width
    const savedSplit = localStorage.getItem('markdown_lens_split_width');
    if (savedSplit && elements.editorPane) {
      elements.editorPane.style.width = savedSplit;
    }

    // Set initial content (from URL query, localStorage, or default sample)
    const urlSample = urlParams.get('sample');
    if (urlSample && window.MARKDOWN_SAMPLES && window.MARKDOWN_SAMPLES[urlSample]) {
      state.content = window.MARKDOWN_SAMPLES[urlSample].content;
      elements.sampleSelect.value = urlSample;
    } else {
      const savedContent = localStorage.getItem('markdown_lens_content');
      if (savedContent && savedContent.trim().length > 0) {
        state.content = savedContent;
      } else if (window.MARKDOWN_SAMPLES && window.MARKDOWN_SAMPLES.engine_differences) {
        state.content = window.MARKDOWN_SAMPLES.engine_differences.content;
        elements.sampleSelect.value = 'engine_differences';
      }
    }

    elements.textarea.value = state.content;
    updateStats(state.content);

    // Build the preview cards
    renderCardsStructure();

    // Perform initial render
    renderAllPreviews();

    // Bind event listeners
    bindEvents();
  }

  // Populate sample dropdown
  function populateSamples() {
    if (!window.MARKDOWN_SAMPLES) return;
    elements.sampleSelect.innerHTML = '<option value="" disabled selected>📂 Load Agent Sample...</option>';
    for (const [key, sample] of Object.entries(window.MARKDOWN_SAMPLES)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${sample.name}`;
      elements.sampleSelect.appendChild(opt);
    }
  }

  // Bind UI Events
  function bindEvents() {
    // Textarea input with debounce
    elements.textarea.addEventListener('input', () => {
      state.content = elements.textarea.value;
      updateStats(state.content);
      localStorage.setItem('markdown_lens_content', state.content);

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        renderAllPreviews();
      }, 120);
    });

    // Sample Selector
    elements.sampleSelect.addEventListener('change', () => {
      const sampleKey = elements.sampleSelect.value;
      if (sampleKey && window.MARKDOWN_SAMPLES[sampleKey]) {
        state.content = window.MARKDOWN_SAMPLES[sampleKey].content;
        elements.textarea.value = state.content;
        updateStats(state.content);
        localStorage.setItem('markdown_lens_content', state.content);
        renderAllPreviews();
        showToast(`Loaded "${window.MARKDOWN_SAMPLES[sampleKey].name}"`);
      }
    });

    // Paste from Clipboard
    elements.btnPaste.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          state.content = text;
          elements.textarea.value = text;
          updateStats(text);
          localStorage.setItem('markdown_lens_content', text);
          renderAllPreviews();
          showToast('Pasted markdown from clipboard!');
        } else {
          showToast('Clipboard was empty.');
        }
      } catch (err) {
        showToast('Clipboard permission denied. Use Ctrl+V in editor.');
      }
    });

    // Clear Button
    elements.btnClear.addEventListener('click', () => {
      if (!elements.textarea.value.trim()) return;
      if (confirm('Clear current markdown text?')) {
        state.content = '';
        elements.textarea.value = '';
        updateStats('');
        localStorage.removeItem('markdown_lens_content');
        renderAllPreviews();
        showToast('Cleared input.');
      }
    });

    // Open File Button
    elements.btnOpenFile.addEventListener('click', () => {
      elements.fileInput.click();
    });

    elements.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        state.content = evt.target.result;
        elements.textarea.value = state.content;
        updateStats(state.content);
        localStorage.setItem('markdown_lens_content', state.content);
        renderAllPreviews();
        showToast(`Opened "${file.name}"`);
      };
      reader.readAsText(file);
      elements.fileInput.value = '';
    });

    // Drag and Drop File handling
    setupDragAndDrop();

    // Split Pane Resizing
    setupSplitResize();

    // Theme Toggle
    elements.btnTheme.addEventListener('click', toggleTheme);

    // Layout Toggle
    elements.btnLayout.addEventListener('click', cycleLayout);

    // Comparison Matrix Modal
    elements.btnCompare.addEventListener('click', openMatrixModal);

    // Snippet Insert Buttons
    document.querySelectorAll('.btn-snippet').forEach(btn => {
      btn.addEventListener('click', () => {
        const snippetType = btn.dataset.snippet;
        insertSnippet(snippetType);
      });
    });

    // Scroll Syncing
    setupScrollSync();
  }

  // Insert Snippet Helpers
  function insertSnippet(type) {
    let snippet = '';
    if (type === 'mermaid-flow') {
      snippet = `\n\`\`\`mermaid\nflowchart TD\n    A[Start] --> B{Condition}\n    B -->|Yes| C[Success]\n    B -->|No| D[Retry]\n\`\`\`\n`;
    } else if (type === 'mermaid-seq') {
      snippet = `\n\`\`\`mermaid\nsequenceDiagram\n    User->>Agent: Request\n    Agent->>Tool: Execute\n    Tool-->>Agent: Output\n    Agent-->>User: Response\n\`\`\`\n`;
    } else if (type === 'table') {
      snippet = `\n| Column 1 | Column 2 | Column 3 |\n| :--- | :---: | ---: |\n| Value A | Value B | Value C |\n| Data 1 | Data 2 | Data 3 |\n`;
    } else if (type === 'alert') {
      snippet = `\n> [!NOTE]\n> Here is an important note or callout from the agent.\n`;
    } else if (type === 'task') {
      snippet = `\n- [x] Completed task item\n- [ ] Pending task item\n`;
    }

    const textarea = elements.textarea;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;

    textarea.value = currentVal.substring(0, start) + snippet + currentVal.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
    textarea.focus();

    state.content = textarea.value;
    updateStats(state.content);
    localStorage.setItem('markdown_lens_content', state.content);
    renderAllPreviews();
  }

  // Drag and Drop setup
  function setupDragAndDrop() {
    const dropzone = window;
    let dragCounter = 0;

    dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      elements.dropOverlay.classList.add('active');
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        elements.dropOverlay.classList.remove('active');
        dragCounter = 0;
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      elements.dropOverlay.classList.remove('active');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (evt) => {
          state.content = evt.target.result;
          elements.textarea.value = state.content;
          updateStats(state.content);
          localStorage.setItem('markdown_lens_content', state.content);
          renderAllPreviews();
          showToast(`Dropped "${file.name}"`);
        };
        reader.readAsText(file);
      }
    });
  }

  // Split Pane Resizing
  function setupSplitResize() {
    let isDragging = false;

    elements.splitDivider.addEventListener('mousedown', (e) => {
      isDragging = true;
      elements.splitDivider.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const containerWidth = document.querySelector('.main-workspace').getBoundingClientRect().width;
      const newWidth = Math.max(260, Math.min(e.clientX, containerWidth - 320));
      elements.editorPane.style.width = `${newWidth}px`;
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        elements.splitDivider.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('markdown_lens_split_width', elements.editorPane.style.width);
      }
    });
  }

  // Scroll Syncing
  function setupScrollSync() {
    elements.textarea.addEventListener('scroll', () => {
      if (!state.syncScroll || isScrollingSync) return;
      isScrollingSync = true;
      const scrollRatio = elements.textarea.scrollTop / (elements.textarea.scrollHeight - elements.textarea.clientHeight || 1);

      document.querySelectorAll('.window-card-body').forEach(body => {
        body.scrollTop = scrollRatio * (body.scrollHeight - body.clientHeight);
      });

      setTimeout(() => { isScrollingSync = false; }, 40);
    });
  }

  // Render Cards Structure in DOM
  function renderCardsStructure() {
    const parsers = window.MarkdownParsers.getAll();
    elements.previewsGrid.innerHTML = '';
    elements.tabNavBar.innerHTML = '';

    // Set grid class based on layout mode
    updateLayoutClasses();

    parsers.forEach(parser => {
      // 1. Tab Nav Item
      const tabBtn = document.createElement('button');
      tabBtn.className = `tab-nav-item ${parser.id === state.activeTab ? 'active' : ''}`;
      tabBtn.dataset.parserId = parser.id;
      tabBtn.innerHTML = `
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${parser.badgeColor};"></span>
        ${parser.name}
      `;
      tabBtn.addEventListener('click', () => {
        state.activeTab = parser.id;
        document.querySelectorAll('.tab-nav-item').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
        updateCardVisibility();
      });
      elements.tabNavBar.appendChild(tabBtn);

      // 2. Window Card
      const card = document.createElement('div');
      card.className = 'window-card';
      card.id = `card-${parser.id}`;
      card.dataset.parserId = parser.id;

      card.innerHTML = `
        <div class="window-card-header">
          <div class="window-title-group">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${parser.badgeColor};"></span>
            <span class="window-title">${parser.name}</span>
            <span class="engine-version">${parser.version}</span>
            <span class="latency-badge" id="latency-${parser.id}">⚡ 0.0ms</span>
          </div>
          <div class="window-controls">
            <div class="mode-toggle">
              <button class="mode-btn active" data-mode="preview" title="Rendered HTML & Visual Diagrams">Preview</button>
              <button class="mode-btn" data-mode="html" title="Inspect Raw HTML Output">HTML</button>
            </div>
            <button class="btn-win-action btn-copy-card-html" title="Copy Output HTML">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="btn-win-action btn-maximize-card" title="Maximize Window">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            </button>
          </div>
        </div>
        <div class="window-card-body" id="body-${parser.id}">
          <div class="markdown-body" id="preview-${parser.id}"></div>
          <pre class="html-source-view" id="source-${parser.id}" style="display: none;"></pre>
        </div>
        <div class="window-card-footer">
          <span class="spec-tag" title="GFM Table Support">📋 Tables: ${parser.features ? (parser.features.tables ? '✅' : '❌') : '—'}</span>
          <span class="spec-tag" title="Task List Checkboxes">☑️ Tasks: ${parser.features ? (parser.features.tasks ? '✅' : '❌') : '—'}</span>
          <span class="spec-tag" title="Bundle Size">📦 ${parser.bundleSize}</span>
          <span class="spec-tag" style="color:${parser.badgeColor};font-weight:600;">${parser.agentRating}</span>
        </div>
      `;

      // Event: Mode toggle (preview vs raw HTML)
      const modeBtns = card.querySelectorAll('.mode-btn');
      const previewEl = card.querySelector(`#preview-${parser.id}`);
      const sourceEl = card.querySelector(`#source-${parser.id}`);

      modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          modeBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const mode = btn.dataset.mode;
          state.cardModes[parser.id] = mode;

          if (mode === 'html') {
            previewEl.style.display = 'none';
            sourceEl.style.display = 'block';
          } else {
            previewEl.style.display = 'block';
            sourceEl.style.display = 'none';
          }
        });
      });

      // Event: Copy HTML
      const copyBtn = card.querySelector('.btn-copy-card-html');
      copyBtn.addEventListener('click', async () => {
        const html = sourceEl.textContent;
        try {
          await navigator.clipboard.writeText(html);
          showToast(`Copied ${parser.name} HTML!`);
        } catch (e) {
          showToast('Failed to copy.');
        }
      });

      // Event: Maximize Window
      const maxBtn = card.querySelector('.btn-maximize-card');
      maxBtn.addEventListener('click', () => {
        if (state.maximizedCard === parser.id) {
          card.classList.remove('maximized');
          state.maximizedCard = null;
        } else {
          document.querySelectorAll('.window-card').forEach(c => c.classList.remove('maximized'));
          card.classList.add('maximized');
          state.maximizedCard = parser.id;
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      elements.previewsGrid.appendChild(card);
    });

    updateCardVisibility();
  }

  // Update layout classes
  function updateLayoutClasses() {
    if (state.layout === 'tabbed') {
      elements.tabNavBar.style.display = 'flex';
      elements.previewsGrid.className = 'previews-grid cols-1';
    } else if (state.layout === 'grid-1') {
      elements.tabNavBar.style.display = 'none';
      elements.previewsGrid.className = 'previews-grid cols-1';
    } else {
      elements.tabNavBar.style.display = 'none';
      elements.previewsGrid.className = 'previews-grid cols-2';
    }
  }

  // Update which cards are visible
  function updateCardVisibility() {
    const parsers = window.MarkdownParsers.getAll();
    parsers.forEach(parser => {
      const card = document.getElementById(`card-${parser.id}`);
      if (!card) return;

      const isEnabled = state.enabledParsers.includes(parser.id);
      if (!isEnabled) {
        card.style.display = 'none';
        return;
      }

      if (state.layout === 'tabbed') {
        card.style.display = (parser.id === state.activeTab) ? 'flex' : 'none';
      } else {
        card.style.display = 'flex';
      }
    });
  }

  // Render all enabled previews
  async function renderAllPreviews() {
    const parsers = window.MarkdownParsers.getAll();
    const markdown = state.content;

    for (const parser of parsers) {
      if (!state.enabledParsers.includes(parser.id)) continue;

      // Benchmark & parse
      const { html, durationMs } = window.MarkdownParsers.benchmark(parser.id, markdown);

      // Latency badge
      const latencyBadge = document.getElementById(`latency-${parser.id}`);
      if (latencyBadge) {
        const formattedLatency = durationMs < 0.1 ? '<0.1ms' : `${durationMs.toFixed(1)}ms`;
        latencyBadge.textContent = `⚡ ${formattedLatency}`;
        latencyBadge.style.color = durationMs > 15 ? '#f59e0b' : '#10b981';
      }

      // Raw HTML view
      const sourceEl = document.getElementById(`source-${parser.id}`);
      if (sourceEl) {
        sourceEl.textContent = html;
      }

      // Visual preview
      const previewEl = document.getElementById(`preview-${parser.id}`);
      if (previewEl) {
        previewEl.innerHTML = html;

        // Post-process GitHub Callout Alerts (> [!NOTE], etc.)
        enhanceAlerts(previewEl);

        // Highlight code blocks with Prism (excluding mermaid)
        highlightCodeBlocks(previewEl);

        // Process Mermaid diagrams
        await window.MermaidManager.processContainer(previewEl);
      }
    }
  }

  // Enhance GitHub-style Callouts (> [!NOTE], > [!TIP], etc.)
  function enhanceAlerts(container) {
    const blockquotes = container.querySelectorAll('blockquote');
    blockquotes.forEach(bq => {
      const firstP = bq.querySelector('p');
      if (!firstP) return;

      const text = firstP.innerHTML.trim();
      const match = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](\s*<br\s*\/?>|\s+)?([\s\S]*)/i);

      if (match) {
        const type = match[1].toLowerCase();
        const restContent = match[3] || '';

        const iconMap = {
          note: 'ℹ️',
          tip: '💡',
          important: '🟣',
          warning: '⚠️',
          caution: '🛑'
        };

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert-callout alert-${type}`;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'alert-callout-header';
        headerDiv.innerHTML = `<span>${iconMap[type] || '📌'}</span> ${type.toUpperCase()}`;

        alertDiv.appendChild(headerDiv);

        firstP.innerHTML = restContent;
        while (bq.firstChild) {
          alertDiv.appendChild(bq.firstChild);
        }

        if (bq.parentNode) {
          bq.parentNode.replaceChild(alertDiv, bq);
        }
      }
    });
  }

  // Syntax highlighting with Prism
  function highlightCodeBlocks(container) {
    if (typeof window.Prism === 'undefined') return;

    const codeBlocks = container.querySelectorAll('pre > code');
    codeBlocks.forEach(code => {
      // Skip mermaid diagrams
      if (code.classList.contains('language-mermaid') || code.classList.contains('mermaid')) {
        return;
      }

      try {
        window.Prism.highlightElement(code);
      } catch (e) {
        // Fallback gracefully if language not supported
      }
    });
  }

  // Stats calculation
  function updateStats(text) {
    const lines = text ? text.split('\n').length : 0;
    const words = text ? (text.trim().match(/\S+/g) || []).length : 0;
    const chars = text ? text.length : 0;
    const readTimeMin = Math.ceil(words / 200);

    elements.statLines.textContent = lines.toLocaleString();
    elements.statWords.textContent = words.toLocaleString();
    elements.statChars.textContent = chars.toLocaleString();
    elements.statReadTime.textContent = words > 0 ? `${readTimeMin} min` : '0 min';
  }

  // Theme toggle
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('markdown_lens_theme', state.theme);
    updateThemeIcon();

    window.MermaidManager.setTheme(state.theme);
    renderAllPreviews();
    showToast(`Switched to ${state.theme} mode`);
  }

  function updateThemeIcon() {
    elements.btnTheme.innerHTML = state.theme === 'dark'
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  }

  // Layout cycle: grid-2 -> tabbed -> grid-1 -> grid-2
  function cycleLayout() {
    if (state.layout === 'grid-2') {
      state.layout = 'tabbed';
      elements.btnLayout.innerHTML = `📑 Tabbed`;
    } else if (state.layout === 'tabbed') {
      state.layout = 'grid-1';
      elements.btnLayout.innerHTML = `☰ 1-Col`;
    } else {
      state.layout = 'grid-2';
      elements.btnLayout.innerHTML = `⊞ 2-Col`;
    }

    localStorage.setItem('markdown_lens_layout', state.layout);
    updateLayoutClasses();
    updateCardVisibility();
  }

  // Comparison Matrix Modal
  function openMatrixModal() {
    const parsers = window.MarkdownParsers.getAll();
    const tbody = document.getElementById('matrix-tbody');
    tbody.innerHTML = '';

    parsers.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;"><span style="color:${p.badgeColor};">●</span> ${p.name}</td>
        <td><code>${p.version}</code></td>
        <td><strong>${p.bundleSize}</strong></td>
        <td>${p.gfmScore}</td>
        <td><span style="color:${p.badgeColor};font-weight:600;">${p.agentRating}</span></td>
        <td style="font-size:0.8rem;color:var(--text-secondary);">${p.pros[0]}</td>
      `;
      tbody.appendChild(tr);
    });

    elements.matrixModal.classList.add('active');
  }

  // Toast Notification
  function showToast(message, duration = 2400) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>💬</span> <span>${message}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, duration);
  }

  // Close matrix modal handler
  document.getElementById('btn-close-matrix')?.addEventListener('click', () => {
    elements.matrixModal.classList.remove('active');
  });

  elements.matrixModal?.addEventListener('click', (e) => {
    if (e.target === elements.matrixModal) {
      elements.matrixModal.classList.remove('active');
    }
  });

  // Run init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
