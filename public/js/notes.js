/**
 * Notes Manager & Storage Module for Markdown Viewer
 * 
 * Provides:
 * 1. NotesDB: Persistent IndexedDB storage for unlimited agent markdown notes
 * 2. ZipBuilder: Zero-dependency in-browser standard ZIP archive generator
 * 3. NotesManager: Keyboard-driven Command Palette (Ctrl+K), quick save (Ctrl+S),
 *    fuzzy search, inline rename, delete with undo, and bulk zip export.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. NotesDB: IndexedDB Persistence Layer
  // =========================================================================
  class NotesDB {
    constructor(dbName = 'MarkdownViewerDB', version = 1) {
      this.dbName = dbName;
      this.version = version;
      this.db = null;
    }

    async open() {
      if (this.db) return this.db;
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('notes')) {
            const store = db.createObjectStore('notes', { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
            store.createIndex('title', 'title', { unique: false });
          }
        };
        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    }

    async getAll() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const request = store.getAll();
        request.onsuccess = () => {
          const list = request.result || [];
          list.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(list);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    }

    async get(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (e) => reject(e.target.error);
      });
    }

    async put(note) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        const request = store.put(note);
        request.onsuccess = () => resolve(note);
        request.onerror = (e) => reject(e.target.error);
      });
    }

    async delete(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
      });
    }
  }

  // =========================================================================
  // 2. ZipBuilder: Zero-Dependency Pure JS Standard ZIP Archive Generator
  // =========================================================================
  class ZipBuilder {
    static makeCrcTable() {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
      }
      return table;
    }

    static crc32(bytes) {
      if (!ZipBuilder._crcTable) ZipBuilder._crcTable = ZipBuilder.makeCrcTable();
      const table = ZipBuilder._crcTable;
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < bytes.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    static build(files) {
      const enc = new TextEncoder();
      const fileRecords = [];
      let offset = 0;

      const now = new Date();
      const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
      const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

      for (const f of files) {
        const nameBytes = enc.encode(f.name);
        const contentBytes = enc.encode(f.content || '');
        const crc = ZipBuilder.crc32(contentBytes);
        const size = contentBytes.length;

        // Local file header: 30 bytes + nameLen
        const localHeader = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(localHeader.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0x0800, true); // UTF-8 filename bit
        lv.setUint16(8, 0, true);      // Uncompressed (Stored)
        lv.setUint16(10, dosTime, true);
        lv.setUint16(12, dosDate, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        localHeader.set(nameBytes, 30);

        fileRecords.push({
          nameBytes,
          contentBytes,
          crc,
          size,
          dosTime,
          dosDate,
          localHeader,
          offset
        });

        offset += localHeader.length + size;
      }

      // Central directory records
      let cdSize = 0;
      const cdRecords = [];
      for (const r of fileRecords) {
        const cdHeader = new Uint8Array(46 + r.nameBytes.length);
        const cv = new DataView(cdHeader.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0x0800, true); // UTF-8
        cv.setUint16(10, 0, true);
        cv.setUint16(12, r.dosTime, true);
        cv.setUint16(14, r.dosDate, true);
        cv.setUint32(16, r.crc, true);
        cv.setUint32(20, r.size, true);
        cv.setUint32(24, r.size, true);
        cv.setUint16(28, r.nameBytes.length, true);
        cv.setUint16(30, 0, true);
        cv.setUint16(32, 0, true);
        cv.setUint16(34, 0, true);
        cv.setUint16(36, 0, true);
        cv.setUint32(38, 0, true);
        cv.setUint32(42, r.offset, true);
        cdHeader.set(r.nameBytes, 46);

        cdRecords.push(cdHeader);
        cdSize += cdHeader.length;
      }

      // End of central directory record (22 bytes)
      const eocd = new Uint8Array(22);
      const ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(4, 0, true);
      ev.setUint16(6, 0, true);
      ev.setUint16(8, fileRecords.length, true);
      ev.setUint16(10, fileRecords.length, true);
      ev.setUint32(12, cdSize, true);
      ev.setUint32(16, offset, true);
      ev.setUint16(20, 0, true);

      // Concatenate
      const totalLength = offset + cdSize + 22;
      const out = new Uint8Array(totalLength);
      let pos = 0;
      for (const r of fileRecords) {
        out.set(r.localHeader, pos);
        pos += r.localHeader.length;
        out.set(r.contentBytes, pos);
        pos += r.contentBytes.length;
      }
      for (const cd of cdRecords) {
        out.set(cd, pos);
        pos += cd.length;
      }
      out.set(eocd, pos);
      return out;
    }
  }

  // =========================================================================
  // 3. Helper Functions
  // =========================================================================
  function getTimestampPrefix() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}_`;
  }

  function sanitizeSlug(str) {
    if (!str) return '';
    return str
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTimeAgo(timestamp) {
    const diff = Math.max(0, Date.now() - timestamp);
    const seconds = Math.floor(diff / 1000);
    if (seconds < 45) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatNoteMeta(content, updatedAt) {
    const lines = content ? content.split('\n').length : 0;
    const bytes = new Blob([content || '']).size;
    let sizeStr = `${bytes} B`;
    if (bytes >= 1024) sizeStr = `${(bytes / 1024).toFixed(1)} KB`;
    return `${formatTimeAgo(updatedAt)} • ${lines} lines • ${sizeStr}`;
  }

  function extractSuggestedTitle(content) {
    if (!content) return 'untitled';
    const lines = content.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('#')) {
        const clean = line.replace(/^#+\s*/, '').trim();
        const slug = sanitizeSlug(clean);
        if (slug) return slug.slice(0, 36);
      }
    }
    return 'note';
  }

  // Fuzzy Matcher returning match boolean, score, and matched char indices
  function fuzzyMatch(text, query) {
    if (!query) return { match: true, score: 0, indices: [] };
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim();

    // 1. Direct Substring Match
    const subIdx = lowerText.indexOf(lowerQuery);
    if (subIdx !== -1) {
      const indices = [];
      for (let i = 0; i < lowerQuery.length; i++) indices.push(subIdx + i);
      return { match: true, score: 2000 - subIdx, indices };
    }

    // 2. Multi-word search
    const words = lowerQuery.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const allFound = words.every(w => lowerText.includes(w));
      if (allFound) {
        const indices = [];
        words.forEach(w => {
          let idx = lowerText.indexOf(w);
          while (idx !== -1 && idx < lowerText.length) {
            for (let i = 0; i < w.length; i++) indices.push(idx + i);
            idx = lowerText.indexOf(w, idx + w.length);
          }
        });
        return { match: true, score: 1000, indices };
      }
    }

    // 3. Subsequence fuzzy match
    let tIdx = 0;
    let score = 0;
    let consecutive = 0;
    const indices = [];
    for (let qIdx = 0; qIdx < lowerQuery.length; qIdx++) {
      const qChar = lowerQuery[qIdx];
      let found = false;
      while (tIdx < lowerText.length) {
        if (lowerText[tIdx] === qChar) {
          found = true;
          indices.push(tIdx);
          consecutive++;
          score += consecutive * 15;
          if (tIdx === 0 || /[\s_\-]/.test(lowerText[tIdx - 1])) {
            score += 40;
          }
          tIdx++;
          break;
        }
        consecutive = 0;
        tIdx++;
      }
      if (!found) return { match: false, score: 0, indices: [] };
    }
    return { match: true, score, indices };
  }

  function highlightMatches(text, indices) {
    if (!indices || indices.length === 0) return escapeHtml(text);
    const indexSet = new Set(indices);
    let html = '';
    for (let i = 0; i < text.length; i++) {
      const char = escapeHtml(text[i]);
      if (indexSet.has(i)) {
        html += `<mark class="search-match">${char}</mark>`;
      } else {
        html += char;
      }
    }
    return html;
  }

  // =========================================================================
  // 4. NotesManager: UI Orchestrator
  // =========================================================================
  class NotesManager {
    constructor() {
      this.db = new NotesDB();
      this.cachedNotes = [];
      this.filteredNotes = [];
      this.selectedIndex = 0;
      this.activeNoteId = null;
      this.activeNoteTitle = null;
      this.isDirty = false;
      this.isRenaming = false;

      this.currentSavePrefix = '';
    }

    async init() {
      await this.db.open();
      this.bindDOMElements();
      this.bindEvents();
      this.restoreActiveSession();
    }

    bindDOMElements() {
      this.elements = {
        // Main header additions
        btnNotes: document.getElementById('btn-notes'),
        btnSave: document.getElementById('btn-save'),
        activeNoteIndicator: document.getElementById('active-note-indicator'),
        activeNoteTitle: document.getElementById('active-note-title'),
        activeNoteDirty: document.getElementById('active-note-dirty'),
        btnUnlinkNote: document.getElementById('btn-unlink-note'),

        // Notes Search / Command Palette Modal
        notesModal: document.getElementById('notes-modal'),
        notesSearchInput: document.getElementById('notes-search-input'),
        notesCountText: document.getElementById('notes-count-text'),
        notesList: document.getElementById('notes-list'),
        btnNotesNew: document.getElementById('btn-notes-new'),
        btnNotesExport: document.getElementById('btn-notes-export'),
        btnCloseNotes: document.getElementById('btn-close-notes'),

        // Save Note Modal
        saveModal: document.getElementById('save-modal'),
        saveTimestampPrefix: document.getElementById('save-timestamp-prefix'),
        saveNoteName: document.getElementById('save-note-name'),
        saveFilenamePreview: document.getElementById('save-filename-preview'),
        btnConfirmSave: document.getElementById('btn-confirm-save'),
        btnCancelSave: document.getElementById('btn-cancel-save'),
        btnCloseSave: document.getElementById('btn-close-save')
      };
    }

    bindEvents() {
      // Header button triggers
      if (this.elements.btnNotes) {
        this.elements.btnNotes.addEventListener('click', () => this.openNotesModal());
      }
      if (this.elements.btnSave) {
        this.elements.btnSave.addEventListener('click', () => this.handleSaveAction());
      }
      if (this.elements.btnUnlinkNote) {
        this.elements.btnUnlinkNote.addEventListener('click', (e) => {
          e.stopPropagation();
          this.unsetActiveNote();
          if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
            window.MarkdownViewer.showToast('Unlinked note (editing as fresh draft)');
          }
        });
      }

      // Notes Modal actions
      if (this.elements.btnCloseNotes) {
        this.elements.btnCloseNotes.addEventListener('click', () => this.closeNotesModal());
      }
      if (this.elements.btnNotesNew) {
        this.elements.btnNotesNew.addEventListener('click', () => this.startNewNote());
      }
      if (this.elements.btnNotesExport) {
        this.elements.btnNotesExport.addEventListener('click', () => this.exportAllZip());
      }

      // Live search input filtering
      if (this.elements.notesSearchInput) {
        this.elements.notesSearchInput.addEventListener('input', () => {
          this.filterNotes(this.elements.notesSearchInput.value);
        });

        // Search input keyboard navigation
        this.elements.notesSearchInput.addEventListener('keydown', (e) => {
          if (this.isRenaming) return;

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.navigateList(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.navigateList(-1);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            this.openSelectedNote();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.closeNotesModal();
          } else if (e.key === 'Delete') {
            e.preventDefault();
            this.deleteSelectedNote();
          } else if (e.key === 'F2') {
            e.preventDefault();
            this.startRenameSelected();
          }
        });
      }

      // Save Modal actions
      if (this.elements.btnCloseSave) {
        this.elements.btnCloseSave.addEventListener('click', () => this.closeSaveModal());
      }
      if (this.elements.btnCancelSave) {
        this.elements.btnCancelSave.addEventListener('click', () => this.closeSaveModal());
      }
      if (this.elements.btnConfirmSave) {
        this.elements.btnConfirmSave.addEventListener('click', () => this.confirmSaveModal());
      }

      // Live filename preview in Save modal
      if (this.elements.saveNoteName) {
        this.elements.saveNoteName.addEventListener('input', () => this.updateSavePreview());
        this.elements.saveNoteName.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.confirmSaveModal();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.closeSaveModal();
          }
        });
      }

      // Global Hotkeys (Ctrl+S for save, Ctrl+K / Alt+O for notes search)
      window.addEventListener('keydown', (e) => {
        const isCtrlOrMeta = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();

        // Check if our modals are currently open
        const isNotesOpen = this.elements.notesModal && this.elements.notesModal.classList.contains('active');
        const isSaveOpen = this.elements.saveModal && this.elements.saveModal.classList.contains('active');

        // Esc closes active note modals
        if (e.key === 'Escape') {
          if (isNotesOpen) {
            e.preventDefault();
            this.closeNotesModal();
            return;
          }
          if (isSaveOpen) {
            e.preventDefault();
            this.closeSaveModal();
            return;
          }
        }

        // Ctrl+S / Cmd+S: Save note
        if (isCtrlOrMeta && key === 's') {
          e.preventDefault();
          if (e.shiftKey) {
            // Ctrl+Shift+S -> Force "Save As..."
            this.openSaveModal();
          } else {
            this.handleSaveAction();
          }
          return;
        }

        // Ctrl+K / Cmd+K or Alt+O: Search / Command Palette
        if ((isCtrlOrMeta && key === 'k') || (e.altKey && !isCtrlOrMeta && key === 'o')) {
          e.preventDefault();
          if (isNotesOpen) {
            this.closeNotesModal();
          } else {
            this.openNotesModal();
          }
          return;
        }
      });
    }

    // =========================================================================
    // Active Note State & Session Persistence
    // =========================================================================
    async restoreActiveSession() {
      const savedActiveId = localStorage.getItem('markdown_viewer_active_note_id');
      if (savedActiveId) {
        try {
          const note = await this.db.get(savedActiveId);
          if (note) {
            this.activeNoteId = note.id;
            this.activeNoteTitle = note.title;
            this.updateActiveNoteUI();
          } else {
            localStorage.removeItem('markdown_viewer_active_note_id');
          }
        } catch (e) {
          console.warn('Failed to restore active note:', e);
        }
      }
    }

    setActiveNote(note) {
      if (!note) return;
      this.activeNoteId = note.id;
      this.activeNoteTitle = note.title;
      this.isDirty = false;
      localStorage.setItem('markdown_viewer_active_note_id', note.id);
      this.updateActiveNoteUI();
    }

    unsetActiveNote() {
      this.activeNoteId = null;
      this.activeNoteTitle = null;
      this.isDirty = false;
      localStorage.removeItem('markdown_viewer_active_note_id');
      this.updateActiveNoteUI();
    }

    markDirty() {
      if (!this.activeNoteId) return;
      if (!this.isDirty) {
        this.isDirty = true;
        this.updateActiveNoteUI();
      }
    }

    setClean() {
      this.isDirty = false;
      this.updateActiveNoteUI();
    }

    updateActiveNoteUI() {
      if (!this.elements.activeNoteIndicator) return;
      if (this.activeNoteId && this.activeNoteTitle) {
        this.elements.activeNoteIndicator.style.display = 'inline-flex';
        this.elements.activeNoteTitle.textContent = this.activeNoteTitle;
        if (this.elements.activeNoteDirty) {
          this.elements.activeNoteDirty.style.display = this.isDirty ? 'inline' : 'none';
        }
      } else {
        this.elements.activeNoteIndicator.style.display = 'none';
        if (this.elements.activeNoteDirty) {
          this.elements.activeNoteDirty.style.display = 'none';
        }
      }
    }

    onEditorCleared() {
      this.unsetActiveNote();
    }

    // =========================================================================
    // Save Action Flow
    // =========================================================================
    async handleSaveAction() {
      const content = window.MarkdownViewer ? window.MarkdownViewer.getContent() : '';
      if (!content || !content.trim()) {
        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast('Editor is empty, nothing to save');
        }
        return;
      }

      // If note was already opened/saved before, update in-place
      if (this.activeNoteId) {
        try {
          const note = await this.db.get(this.activeNoteId);
          if (note) {
            note.content = content;
            note.updatedAt = Date.now();
            await this.db.put(note);
            this.setClean();
            if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
              window.MarkdownViewer.showToast(`Updated "${note.title}"`);
            }
            return;
          }
        } catch (err) {
          console.error('Error updating note:', err);
        }
      }

      // Otherwise, open Save Modal for naming
      this.openSaveModal();
    }

    openSaveModal() {
      const content = window.MarkdownViewer ? window.MarkdownViewer.getContent() : '';
      this.currentSavePrefix = getTimestampPrefix();
      
      const suggestedSlug = extractSuggestedTitle(content);
      
      if (this.elements.saveTimestampPrefix) {
        this.elements.saveTimestampPrefix.textContent = this.currentSavePrefix;
      }
      if (this.elements.saveNoteName) {
        this.elements.saveNoteName.value = suggestedSlug;
      }

      this.updateSavePreview();

      if (this.elements.saveModal) {
        this.elements.saveModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
          if (this.elements.saveNoteName) {
            this.elements.saveNoteName.focus();
            this.elements.saveNoteName.select();
          }
        }, 60);
      }
    }

    closeSaveModal() {
      if (this.elements.saveModal) {
        this.elements.saveModal.classList.remove('active');
        document.body.style.overflow = '';
      }
    }

    updateSavePreview() {
      if (!this.elements.saveFilenamePreview) return;
      const raw = this.elements.saveNoteName ? this.elements.saveNoteName.value.trim() : '';
      let slug = sanitizeSlug(raw) || 'note';
      if (slug.toLowerCase().endsWith('.md')) {
        slug = slug.slice(0, -3);
      }
      const fullFilename = `${this.currentSavePrefix}${slug}.md`;
      this.elements.saveFilenamePreview.textContent = fullFilename;
    }

    async confirmSaveModal() {
      const raw = this.elements.saveNoteName ? this.elements.saveNoteName.value.trim() : '';
      let slug = sanitizeSlug(raw) || 'note';
      if (slug.toLowerCase().endsWith('.md')) {
        slug = slug.slice(0, -3);
      }
      const fullFilename = `${this.currentSavePrefix}${slug}.md`;

      const content = window.MarkdownViewer ? window.MarkdownViewer.getContent() : '';
      const now = Date.now();
      const newNote = {
        id: `note_${now}_${Math.random().toString(36).slice(2, 7)}`,
        title: fullFilename,
        content: content,
        createdAt: now,
        updatedAt: now
      };

      try {
        await this.db.put(newNote);
        this.setActiveNote(newNote);
        this.closeSaveModal();
        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(`Saved note "${fullFilename}"`);
        }
      } catch (err) {
        console.error('Error saving note:', err);
        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast('Failed to save note');
        }
      }
    }

    // =========================================================================
    // Search / Command Palette Modal Flow
    // =========================================================================
    async openNotesModal() {
      try {
        this.cachedNotes = await this.db.getAll();
      } catch (err) {
        console.error('Error loading notes:', err);
        this.cachedNotes = [];
      }

      this.isRenaming = false;
      this.selectedIndex = 0;

      if (this.elements.notesSearchInput) {
        this.elements.notesSearchInput.value = '';
      }

      this.filterNotes('');

      if (this.elements.notesModal) {
        this.elements.notesModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
          if (this.elements.notesSearchInput) {
            this.elements.notesSearchInput.focus();
          }
        }, 50);
      }
    }

    closeNotesModal() {
      if (this.elements.notesModal) {
        this.elements.notesModal.classList.remove('active');
        document.body.style.overflow = '';
      }
      this.isRenaming = false;
    }

    filterNotes(query) {
      const q = (query || '').trim();
      const results = [];

      for (const note of this.cachedNotes) {
        const matchInfo = fuzzyMatch(note.title, q);
        if (matchInfo.match) {
          results.push({
            note,
            score: matchInfo.score,
            indices: matchInfo.indices
          });
        }
      }

      if (q) {
        results.sort((a, b) => b.score - a.score);
      }

      this.filteredNotes = results;
      this.selectedIndex = 0;
      this.renderList();
    }

    renderList() {
      if (!this.elements.notesList) return;

      const totalCount = this.cachedNotes.length;
      if (this.elements.notesCountText) {
        const query = this.elements.notesSearchInput ? this.elements.notesSearchInput.value.trim() : '';
        if (query) {
          this.elements.notesCountText.textContent = `${this.filteredNotes.length} matching of ${totalCount} saved`;
        } else {
          this.elements.notesCountText.textContent = `${totalCount} saved ${totalCount === 1 ? 'note' : 'notes'}`;
        }
      }

      if (this.filteredNotes.length === 0) {
        const query = this.elements.notesSearchInput ? this.elements.notesSearchInput.value.trim() : '';
        if (totalCount === 0) {
          this.elements.notesList.innerHTML = `
            <div class="notes-empty-state">
              <div class="empty-icon">📁</div>
              <div class="empty-title">No saved notes yet</div>
              <div class="empty-desc">Press <kbd>Ctrl+S</kbd> anytime to save your current markdown doc.</div>
            </div>
          `;
        } else {
          this.elements.notesList.innerHTML = `
            <div class="notes-empty-state">
              <div class="empty-icon">🔍</div>
              <div class="empty-title">No notes matching "${escapeHtml(query)}"</div>
              <div class="empty-desc">Try another keyword or press Esc to close.</div>
            </div>
          `;
        }
        return;
      }

      const fragment = document.createDocumentFragment();

      this.filteredNotes.forEach((item, index) => {
        const note = item.note;
        const isActive = note.id === this.activeNoteId;
        const isSelected = index === this.selectedIndex;

        const el = document.createElement('div');
        el.className = `note-item${isSelected ? ' selected' : ''}${isActive ? ' is-active' : ''}`;
        el.dataset.id = note.id;
        el.dataset.index = index;

        const highlightedTitle = highlightMatches(note.title, item.indices);
        const metaStr = formatNoteMeta(note.content, note.updatedAt);

        el.innerHTML = `
          <div class="note-item-left">
            <span class="note-type-icon">${isActive ? '📌' : '📄'}</span>
            <div class="note-details">
              <div class="note-title-row">
                <span class="note-title" title="${escapeHtml(note.title)}">${highlightedTitle}</span>
                ${isActive ? '<span class="note-badge-active">Opened</span>' : ''}
              </div>
              <div class="note-meta">${metaStr}</div>
            </div>
          </div>
          <div class="note-actions">
            <button type="button" class="btn-note-action btn-note-rename" title="Rename note (F2)">Rename</button>
            <button type="button" class="btn-note-action btn-note-delete" title="Delete note (Del)">Delete</button>
          </div>
        `;

        // Click to open note
        el.addEventListener('click', (e) => {
          if (e.target.closest('.btn-note-action') || this.isRenaming) return;
          this.openNote(note);
        });

        // Hover selects item
        el.addEventListener('mouseenter', () => {
          if (!this.isRenaming && this.selectedIndex !== index) {
            this.selectedIndex = index;
            this.updateSelectionClasses();
          }
        });

        // Rename button
        const btnRename = el.querySelector('.btn-note-rename');
        btnRename.addEventListener('click', (e) => {
          e.stopPropagation();
          this.startInlineRename(el, note);
        });

        // Delete button
        const btnDelete = el.querySelector('.btn-note-delete');
        btnDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteNote(note);
        });

        fragment.appendChild(el);
      });

      this.elements.notesList.innerHTML = '';
      this.elements.notesList.appendChild(fragment);

      this.scrollSelectedIntoView();
    }

    updateSelectionClasses() {
      if (!this.elements.notesList) return;
      const items = this.elements.notesList.querySelectorAll('.note-item');
      items.forEach((it, idx) => {
        it.classList.toggle('selected', idx === this.selectedIndex);
      });
    }

    navigateList(delta) {
      if (this.filteredNotes.length === 0) return;
      this.selectedIndex = Math.max(0, Math.min(this.filteredNotes.length - 1, this.selectedIndex + delta));
      this.updateSelectionClasses();
      this.scrollSelectedIntoView();
    }

    scrollSelectedIntoView() {
      if (!this.elements.notesList) return;
      const items = this.elements.notesList.querySelectorAll('.note-item');
      const selected = items[this.selectedIndex];
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }

    openSelectedNote() {
      if (this.filteredNotes.length === 0) return;
      const selected = this.filteredNotes[this.selectedIndex];
      if (selected && selected.note) {
        this.openNote(selected.note);
      }
    }

    openNote(note) {
      if (!note) return;
      if (window.MarkdownViewer && window.MarkdownViewer.setContent) {
        window.MarkdownViewer.setContent(note.content || '');
      }
      this.setActiveNote(note);
      this.closeNotesModal();
      if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
        window.MarkdownViewer.showToast(`Opened "${note.title}"`);
      }
    }

    // =========================================================================
    // Rename Action
    // =========================================================================
    startRenameSelected() {
      if (this.filteredNotes.length === 0) return;
      const selected = this.filteredNotes[this.selectedIndex];
      if (!selected) return;

      const items = this.elements.notesList.querySelectorAll('.note-item');
      const itemEl = items[this.selectedIndex];
      if (itemEl) {
        this.startInlineRename(itemEl, selected.note);
      }
    }

    startInlineRename(itemEl, note) {
      this.isRenaming = true;
      const titleSpan = itemEl.querySelector('.note-title');
      if (!titleSpan) return;

      const currentTitle = note.title;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'note-rename-input';
      input.value = currentTitle;

      titleSpan.replaceWith(input);
      input.focus();

      // Select filename before .md
      const dotIdx = currentTitle.lastIndexOf('.md');
      if (dotIdx > 0) {
        input.setSelectionRange(0, dotIdx);
      } else {
        input.select();
      }

      let committed = false;

      const commit = async () => {
        if (committed) return;
        committed = true;
        this.isRenaming = false;

        let newName = sanitizeSlug(input.value.trim());
        if (!newName) {
          newName = currentTitle;
        } else if (!newName.toLowerCase().endsWith('.md')) {
          newName = `${newName}.md`;
        }

        if (newName !== currentTitle) {
          note.title = newName;
          note.updatedAt = Date.now();
          await this.db.put(note);

          if (this.activeNoteId === note.id) {
            this.activeNoteTitle = newName;
            this.updateActiveNoteUI();
          }

          if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
            window.MarkdownViewer.showToast(`Renamed to "${newName}"`);
          }
        }

        this.filterNotes(this.elements.notesSearchInput ? this.elements.notesSearchInput.value : '');
      };

      const cancel = () => {
        if (committed) return;
        committed = true;
        this.isRenaming = false;
        this.filterNotes(this.elements.notesSearchInput ? this.elements.notesSearchInput.value : '');
      };

      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      });

      input.addEventListener('blur', () => {
        commit();
      });
    }

    // =========================================================================
    // Delete Action with Instant Undo Toast
    // =========================================================================
    deleteSelectedNote() {
      if (this.filteredNotes.length === 0) return;
      const selected = this.filteredNotes[this.selectedIndex];
      if (selected && selected.note) {
        this.deleteNote(selected.note);
      }
    }

    async deleteNote(note) {
      if (!note) return;
      const noteBackup = { ...note };

      try {
        await this.db.delete(note.id);

        if (this.activeNoteId === note.id) {
          this.unsetActiveNote();
        }

        this.cachedNotes = this.cachedNotes.filter(n => n.id !== note.id);
        this.filterNotes(this.elements.notesSearchInput ? this.elements.notesSearchInput.value : '');

        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(`Deleted "${note.title}"`, null, async () => {
            // Undo handler
            await this.db.put(noteBackup);
            this.cachedNotes.unshift(noteBackup);
            this.filterNotes(this.elements.notesSearchInput ? this.elements.notesSearchInput.value : '');
            window.MarkdownViewer.showToast(`Restored "${noteBackup.title}"`);
          });
        }
      } catch (err) {
        console.error('Error deleting note:', err);
      }
    }

    // =========================================================================
    // Start New Note Flow
    // =========================================================================
    startNewNote() {
      this.closeNotesModal();
      this.unsetActiveNote();

      if (window.MarkdownViewer) {
        const prevContent = window.MarkdownViewer.getContent();
        window.MarkdownViewer.setContent('');

        if (window.MarkdownViewer.showToast && prevContent && prevContent.trim()) {
          window.MarkdownViewer.showToast('Started new note', null, () => {
            window.MarkdownViewer.setContent(prevContent);
          });
        } else if (window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast('Started new note');
        }
      }
    }

    // =========================================================================
    // Export All Notes as standard ZIP Archive
    // =========================================================================
    async exportAllZip() {
      try {
        const allNotes = await this.db.getAll();
        if (allNotes.length === 0) {
          if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
            window.MarkdownViewer.showToast('No saved notes to export');
          }
          return;
        }

        const files = allNotes.map(n => ({
          name: n.title.endsWith('.md') ? n.title : `${n.title}.md`,
          content: n.content || ''
        }));

        const zipBytes = ZipBuilder.build(files);
        const blob = new Blob([zipBytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        a.href = url;
        a.download = `markdown-notes-${dateStr}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(`Exported ${files.length} notes to ZIP archive`);
        }
      } catch (err) {
        console.error('Export ZIP error:', err);
        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast('Failed to export notes archive');
        }
      }
    }
  }

  // Attach instance to window
  window.NotesManager = new NotesManager();

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.NotesManager.init());
  } else {
    window.NotesManager.init();
  }

})();
