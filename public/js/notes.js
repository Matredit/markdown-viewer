/**
 * Notes Manager & Storage Module for Markdown Viewer
 * 
 * Architecture:
 * 1. NotesDB: Persistent IndexedDB storage for markdown notes
 * 2. ZipBuilder: Zero-dependency in-browser standard ZIP archive generator
 * 3. NotesBackupManager: ZIP packaging, JSON backup restore, and multi-file .md import
 * 4. NotesManager: UI controller for Search Palette (Ctrl+K), quick save (Ctrl+S),
 *    Edit Note modal (F2), MRU sorting, and active session tracking.
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
            store.createIndex('lastOpenedAt', 'lastOpenedAt', { unique: false });
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
          // Normalize legacy entries if any
          list.forEach(note => {
            if (!note.description) note.description = '';
            if (!note.lastOpenedAt) note.lastOpenedAt = note.updatedAt || note.createdAt || Date.now();
          });
          list.sort((a, b) => (b.lastOpenedAt || b.updatedAt || 0) - (a.lastOpenedAt || a.updatedAt || 0));
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

    async importBatch(notesList) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        notesList.forEach(note => store.put(note));
        tx.oncomplete = () => resolve(notesList.length);
        tx.onerror = (e) => reject(e.target.error);
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
        lv.setUint16(8, 0, true);      // Stored (Uncompressed)
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
  function formatDatePrefix(timestamp) {
    const d = new Date(timestamp || Date.now());
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateSimple(timestamp) {
    if (!timestamp) return 'unknown';
    const d = new Date(timestamp);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'never';
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
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function formatNoteMeta(note) {
    const lines = note.content ? note.content.split('\n').length : 0;
    const bytes = new Blob([note.content || '']).size;
    let sizeStr = `${bytes} B`;
    if (bytes >= 1024) sizeStr = `${(bytes / 1024).toFixed(1)} KB`;

    const openedStr = `Opened ${formatTimeAgo(note.lastOpenedAt || note.updatedAt)}`;
    const updatedStr = `Updated ${formatTimeAgo(note.updatedAt)}`;
    const createdStr = `Created ${formatDateSimple(note.createdAt)}`;

    return `${openedStr} • ${updatedStr} • ${createdStr} • ${lines} lines • ${sizeStr}`;
  }

  function sanitizeSlug(str) {
    if (!str) return 'untitled';
    return str
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled';
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

  function extractSuggestedTitle(content) {
    if (!content) return 'untitled';
    const lines = content.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('#')) {
        const clean = line.replace(/^#+\s*/, '').trim();
        if (clean) return clean.slice(0, 48);
      }
    }
    return 'untitled';
  }

  // =========================================================================
  // 4. NotesBackupManager: ZIP Export, JSON Restore & MD Import
  // =========================================================================
  class NotesBackupManager {
    static async exportAllZip(notes) {
      if (!notes || notes.length === 0) {
        throw new Error('No saved notes to export');
      }

      const files = [];

      // 1. Individual .md files with date prefix
      notes.forEach(note => {
        const datePrefix = formatDatePrefix(note.createdAt || note.updatedAt);
        let slug = sanitizeSlug(note.title);
        if (slug.toLowerCase().endsWith('.md')) slug = slug.slice(0, -3);
        const fileName = `${datePrefix}_${slug}.md`;

        files.push({
          name: fileName,
          content: note.content || ''
        });
      });

      // 2. Structured backup JSON containing all metadata + content
      const backupData = {
        version: 1,
        appName: 'Markdown Viewer',
        exportedAt: Date.now(),
        notesCount: notes.length,
        notes: notes.map(n => ({
          id: n.id,
          title: n.title,
          description: n.description || '',
          content: n.content || '',
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          lastOpenedAt: n.lastOpenedAt
        }))
      };

      files.push({
        name: 'markdown-viewer-backup.json',
        content: JSON.stringify(backupData, null, 2)
      });

      const zipBytes = ZipBuilder.build(files);
      const blob = new Blob([zipBytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      const dateStr = formatDatePrefix(Date.now());
      a.href = url;
      a.download = `markdown-notes-${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return notes.length;
    }

    static async parseJsonBackup(file) {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Invalid JSON file format');
      }

      const rawNotes = Array.isArray(data) ? data : (data.notes || []);
      if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
        throw new Error('No valid notes found in backup JSON');
      }

      const cleanedNotes = rawNotes.map(n => {
        const now = Date.now();
        return {
          id: n.id || `note_${now}_${Math.random().toString(36).slice(2, 7)}`,
          title: (n.title || 'Untitled Note').trim(),
          description: (n.description || '').trim(),
          content: n.content || '',
          createdAt: Number(n.createdAt) || now,
          updatedAt: Number(n.updatedAt) || now,
          lastOpenedAt: Number(n.lastOpenedAt) || Number(n.updatedAt) || now
        };
      });

      return cleanedNotes;
    }

    static async parseMarkdownFiles(files) {
      const cleanedNotes = [];
      const now = Date.now();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const content = await file.text();
        
        // Strip extension
        let title = file.name.replace(/\.(md|markdown|txt)$/i, '');
        // Strip leading date prefix if present (e.g. 2026-10-27_)
        title = title.replace(/^\d{4}-\d{2}-\d{2}[_-]?/, '').trim() || file.name;

        cleanedNotes.push({
          id: `note_${now + i}_${Math.random().toString(36).slice(2, 7)}`,
          title: title,
          description: '',
          content: content,
          createdAt: file.lastModified || now,
          updatedAt: file.lastModified || now,
          lastOpenedAt: now
        });
      }

      return cleanedNotes;
    }
  }

  // =========================================================================
  // 5. NotesManager: UI Orchestrator
  // =========================================================================
  class NotesManager {
    constructor() {
      this.db = new NotesDB();
      this.searchEngine = window.NotesSearch ? new window.NotesSearch.NotesSearchEngine() : null;
      this.cachedNotes = [];
      this.searchResults = [];
      this.selectedIndex = 0;
      this.activeNoteId = null;
      this.activeNoteTitle = null;
      this.isDirty = false;
      this.editingNote = null;
    }

    async init() {
      await this.db.open();
      this.bindDOMElements();
      this.bindEvents();
      this.restoreActiveSession();
    }

    bindDOMElements() {
      this.elements = {
        // Main header
        btnNotes: document.getElementById('btn-notes'),
        btnSave: document.getElementById('btn-save'),
        activeNoteIndicator: document.getElementById('active-note-indicator'),
        activeNoteTitle: document.getElementById('active-note-title'),
        activeNoteDirty: document.getElementById('active-note-dirty'),
        btnUnlinkNote: document.getElementById('btn-unlink-note'),

        // Search Palette Modal
        notesModal: document.getElementById('notes-modal'),
        notesSearchInput: document.getElementById('notes-search-input'),
        notesCountText: document.getElementById('notes-count-text'),
        notesList: document.getElementById('notes-list'),
        btnNotesExport: document.getElementById('btn-notes-export'),
        btnNotesImportJson: document.getElementById('btn-notes-import-json'),
        btnNotesImportMd: document.getElementById('btn-notes-import-md'),
        fileImportJson: document.getElementById('file-import-json'),
        fileImportMd: document.getElementById('file-import-md'),
        btnCloseNotes: document.getElementById('btn-close-notes'),

        // Save Modal
        saveModal: document.getElementById('save-modal'),
        saveNoteTitle: document.getElementById('save-note-title'),
        saveNoteDesc: document.getElementById('save-note-desc'),
        saveFilenamePreview: document.getElementById('save-filename-preview'),
        btnConfirmSave: document.getElementById('btn-confirm-save'),
        btnCancelSave: document.getElementById('btn-cancel-save'),
        btnCloseSave: document.getElementById('btn-close-save'),

        // Edit Note Modal
        editModal: document.getElementById('edit-note-modal'),
        editNoteTitle: document.getElementById('edit-note-title'),
        editNoteDesc: document.getElementById('edit-note-desc'),
        btnConfirmEdit: document.getElementById('btn-confirm-edit'),
        btnCancelEdit: document.getElementById('btn-cancel-edit'),
        btnCloseEdit: document.getElementById('btn-close-edit')
      };
    }

    bindEvents() {
      // Header buttons
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

      // Notes Modal controls
      if (this.elements.btnCloseNotes) {
        this.elements.btnCloseNotes.addEventListener('click', () => this.closeNotesModal());
      }
      if (this.elements.btnNotesExport) {
        this.elements.btnNotesExport.addEventListener('click', () => this.exportAllZip());
      }

      // Import buttons & file inputs
      if (this.elements.btnNotesImportJson && this.elements.fileImportJson) {
        this.elements.btnNotesImportJson.addEventListener('click', () => {
          this.elements.fileImportJson.value = '';
          this.elements.fileImportJson.click();
        });
        this.elements.fileImportJson.addEventListener('change', (e) => this.handleImportJson(e));
      }

      if (this.elements.btnNotesImportMd && this.elements.fileImportMd) {
        this.elements.btnNotesImportMd.addEventListener('click', () => {
          this.elements.fileImportMd.value = '';
          this.elements.fileImportMd.click();
        });
        this.elements.fileImportMd.addEventListener('change', (e) => this.handleImportMd(e));
      }

      // Drag and drop onto Notes modal
      if (this.elements.notesModal) {
        const dialog = this.elements.notesModal.querySelector('.modal-dialog');
        if (dialog) {
          dialog.addEventListener('dragover', (e) => {
            e.preventDefault();
            dialog.classList.add('drag-over');
          });
          dialog.addEventListener('dragleave', () => {
            dialog.classList.remove('drag-over');
          });
          dialog.addEventListener('drop', (e) => {
            e.preventDefault();
            dialog.classList.remove('drag-over');
            this.handleDroppedFiles(e.dataTransfer.files);
          });
        }
      }

      // Search input live filtering & keyboard navigation
      if (this.elements.notesSearchInput) {
        this.elements.notesSearchInput.addEventListener('input', () => {
          this.filterNotes(this.elements.notesSearchInput.value);
        });

        this.elements.notesSearchInput.addEventListener('keydown', (e) => {
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
            this.openEditModalForSelected();
          }
        });
      }

      // Save Modal events
      if (this.elements.btnCloseSave) {
        this.elements.btnCloseSave.addEventListener('click', () => this.closeSaveModal());
      }
      if (this.elements.btnCancelSave) {
        this.elements.btnCancelSave.addEventListener('click', () => this.closeSaveModal());
      }
      if (this.elements.btnConfirmSave) {
        this.elements.btnConfirmSave.addEventListener('click', () => this.confirmSaveModal());
      }

      if (this.elements.saveNoteTitle) {
        this.elements.saveNoteTitle.addEventListener('input', () => this.updateSavePreview());
        this.elements.saveNoteTitle.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.confirmSaveModal();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.closeSaveModal();
          }
        });
      }

      if (this.elements.saveNoteDesc) {
        this.elements.saveNoteDesc.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.confirmSaveModal();
          }
        });
      }

      // Edit Modal events
      if (this.elements.btnCloseEdit) {
        this.elements.btnCloseEdit.addEventListener('click', () => this.closeEditModal());
      }
      if (this.elements.btnCancelEdit) {
        this.elements.btnCancelEdit.addEventListener('click', () => this.closeEditModal());
      }
      if (this.elements.btnConfirmEdit) {
        this.elements.btnConfirmEdit.addEventListener('click', () => this.confirmEditModal());
      }

      if (this.elements.editNoteTitle) {
        this.elements.editNoteTitle.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.confirmEditModal();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.closeEditModal();
          }
        });
      }

      if (this.elements.editNoteDesc) {
        this.elements.editNoteDesc.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.confirmEditModal();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.closeEditModal();
          }
        });
      }

      // Global Hotkeys
      window.addEventListener('keydown', (e) => {
        const isCtrlOrMeta = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();

        const isNotesOpen = this.elements.notesModal && this.elements.notesModal.classList.contains('active');
        const isSaveOpen = this.elements.saveModal && this.elements.saveModal.classList.contains('active');
        const isEditOpen = this.elements.editModal && this.elements.editModal.classList.contains('active');

        // Esc closes topmost modal
        if (e.key === 'Escape') {
          if (isEditOpen) {
            e.preventDefault();
            this.closeEditModal();
            return;
          }
          if (isSaveOpen) {
            e.preventDefault();
            this.closeSaveModal();
            return;
          }
          if (isNotesOpen) {
            e.preventDefault();
            this.closeNotesModal();
            return;
          }
        }

        // Ctrl+S / Cmd+S: Save note
        if (isCtrlOrMeta && key === 's') {
          e.preventDefault();
          if (e.shiftKey) {
            this.openSaveModal();
          } else {
            this.handleSaveAction();
          }
          return;
        }

        // Notes Palette: Ctrl+K, Alt+K, Ctrl+O, Alt+O (4 binds)
        const isNotesKey = key === 'k' || key === 'o' || e.code === 'KeyK' || e.code === 'KeyO';
        const isNotesMod = (isCtrlOrMeta && !e.altKey) || (e.altKey && !isCtrlOrMeta);
        if (isNotesMod && isNotesKey && !e.shiftKey) {
          if (isSaveOpen || isEditOpen) return;
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
    // Save Note Flow
    // =========================================================================
    async handleSaveAction() {
      if (window.MarkdownViewer && window.MarkdownViewer.flush) {
        window.MarkdownViewer.flush();
      }
      const content = window.MarkdownViewer ? window.MarkdownViewer.getContent() : '';
      if (!content || !content.trim()) {
        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast('Editor is empty, nothing to save');
        }
        return;
      }

      // If active note already exists, update in-place
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

      // Otherwise, open Save Modal
      this.openSaveModal();
    }

    openSaveModal() {
      const content = window.MarkdownViewer ? window.MarkdownViewer.getContent() : '';
      const suggestedTitle = extractSuggestedTitle(content);

      if (this.elements.saveNoteTitle) {
        this.elements.saveNoteTitle.value = suggestedTitle;
      }
      if (this.elements.saveNoteDesc) {
        this.elements.saveNoteDesc.value = '';
      }

      this.updateSavePreview();

      if (this.elements.saveModal) {
        this.elements.saveModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
          if (this.elements.saveNoteTitle) {
            this.elements.saveNoteTitle.focus();
            this.elements.saveNoteTitle.select();
          }
        }, 50);
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
      const raw = this.elements.saveNoteTitle ? this.elements.saveNoteTitle.value.trim() : '';
      let slug = sanitizeSlug(raw) || 'untitled';
      if (slug.toLowerCase().endsWith('.md')) slug = slug.slice(0, -3);
      const datePrefix = formatDatePrefix(Date.now());
      this.elements.saveFilenamePreview.textContent = `${datePrefix}_${slug}.md`;
    }

    async confirmSaveModal() {
      const rawTitle = this.elements.saveNoteTitle ? this.elements.saveNoteTitle.value.trim() : '';
      let cleanTitle = rawTitle || 'Untitled Note';
      if (cleanTitle.toLowerCase().endsWith('.md')) {
        cleanTitle = cleanTitle.slice(0, -3);
      }

      const description = this.elements.saveNoteDesc ? this.elements.saveNoteDesc.value.trim() : '';
      const content = window.MarkdownViewer ? window.MarkdownViewer.getContent() : '';
      const now = Date.now();

      const newNote = {
        id: `note_${now}_${Math.random().toString(36).slice(2, 7)}`,
        title: cleanTitle,
        description: description,
        content: content,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now
      };

      try {
        await this.db.put(newNote);
        this.setActiveNote(newNote);
        this.closeSaveModal();
        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(`Saved note "${cleanTitle}"`);
        }
      } catch (err) {
        console.error('Error saving note:', err);
        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast('Failed to save note');
        }
      }
    }

    // =========================================================================
    // Edit Note Modal (Rename + Description)
    // =========================================================================
    openEditModalForSelected() {
      if (this.searchResults.length === 0) return;
      const item = this.searchResults[this.selectedIndex];
      if (item && item.note) {
        this.openEditModal(item.note);
      }
    }

    openEditModal(note) {
      if (!note) return;
      this.editingNote = note;

      if (this.elements.editNoteTitle) {
        this.elements.editNoteTitle.value = note.title || '';
      }
      if (this.elements.editNoteDesc) {
        this.elements.editNoteDesc.value = note.description || '';
      }

      if (this.elements.editModal) {
        this.elements.editModal.classList.add('active');
        setTimeout(() => {
          if (this.elements.editNoteTitle) {
            this.elements.editNoteTitle.focus();
            this.elements.editNoteTitle.select();
          }
        }, 50);
      }
    }

    closeEditModal() {
      if (this.elements.editModal) {
        this.elements.editModal.classList.remove('active');
      }
      this.editingNote = null;
    }

    async confirmEditModal() {
      if (!this.editingNote) return;
      const newTitle = (this.elements.editNoteTitle ? this.elements.editNoteTitle.value.trim() : '') || 'Untitled Note';
      const newDesc = this.elements.editNoteDesc ? this.elements.editNoteDesc.value.trim() : '';

      this.editingNote.title = newTitle;
      this.editingNote.description = newDesc;
      this.editingNote.updatedAt = Date.now();

      try {
        await this.db.put(this.editingNote);

        if (this.activeNoteId === this.editingNote.id) {
          this.activeNoteTitle = newTitle;
          this.updateActiveNoteUI();
        }

        // Re-index search engine
        if (this.searchEngine) {
          this.searchEngine.buildIndex(this.cachedNotes);
        }

        this.closeEditModal();
        this.filterNotes(this.elements.notesSearchInput ? this.elements.notesSearchInput.value : '');

        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(`Updated "${newTitle}"`);
        }
      } catch (err) {
        console.error('Error updating note:', err);
      }
    }

    // =========================================================================
    // Search Palette Flow
    // =========================================================================
    async openNotesModal() {
      try {
        this.cachedNotes = await this.db.getAll();
        if (this.searchEngine) {
          this.searchEngine.buildIndex(this.cachedNotes);
        }
      } catch (err) {
        console.error('Error loading notes:', err);
        this.cachedNotes = [];
      }

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
    }

    filterNotes(query) {
      if (this.searchEngine) {
        this.searchResults = this.searchEngine.search(query);
      } else {
        this.searchResults = this.cachedNotes.map(n => ({ note: n, score: 0, titleIndices: [], snippetHtml: '' }));
      }

      this.selectedIndex = 0;
      this.renderList();
    }

    renderList() {
      if (!this.elements.notesList) return;

      const totalCount = this.cachedNotes.length;
      if (this.elements.notesCountText) {
        const query = this.elements.notesSearchInput ? this.elements.notesSearchInput.value.trim() : '';
        if (query) {
          this.elements.notesCountText.textContent = `${this.searchResults.length} matching of ${totalCount} saved`;
        } else {
          this.elements.notesCountText.textContent = `${totalCount} saved ${totalCount === 1 ? 'note' : 'notes'}`;
        }
      }

      if (this.searchResults.length === 0) {
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

      this.searchResults.forEach((item, index) => {
        const note = item.note;
        const isActive = note.id === this.activeNoteId;
        const isSelected = index === this.selectedIndex;

        const el = document.createElement('div');
        el.className = `note-item${isSelected ? ' selected' : ''}${isActive ? ' is-active' : ''}`;
        el.dataset.id = note.id;
        el.dataset.index = index;

        const highlightedTitle = window.NotesSearch && item.titleIndices
          ? window.NotesSearch.highlightMatches(note.title, item.indices || item.titleIndices)
          : escapeHtml(note.title);

        const metaStr = formatNoteMeta(note);

        // Optional Description Row
        let descHtml = '';
        if (note.description) {
          descHtml = `<div class="note-description">${escapeHtml(note.description)}</div>`;
        }

        // Optional Content Match Snippet
        let snippetHtml = '';
        if (item.snippetHtml) {
          snippetHtml = `<div class="note-snippet"><span class="snippet-icon">🔍</span> ${item.snippetHtml}</div>`;
        }

        el.innerHTML = `
          <div class="note-item-left">
            <span class="note-type-icon">${isActive ? '📌' : '📄'}</span>
            <div class="note-details">
              <div class="note-title-row">
                <span class="note-title" title="${escapeHtml(note.title)}">${highlightedTitle}</span>
                ${isActive ? '<span class="note-badge-active">Opened</span>' : ''}
                ${item.matchTier === 'desc' ? '<span class="note-badge-match">in description</span>' : ''}
                ${item.matchTier === 'content' ? '<span class="note-badge-match">in content</span>' : ''}
              </div>
              ${descHtml}
              ${snippetHtml}
              <div class="note-meta">${metaStr}</div>
            </div>
          </div>
          <div class="note-actions">
            <button type="button" class="btn-note-action btn-note-edit" title="Edit title & description (F2)">Edit</button>
            <button type="button" class="btn-note-action btn-note-delete" title="Delete note (Del)">Delete</button>
          </div>
        `;

        // Click on item to open
        el.addEventListener('click', (e) => {
          if (e.target.closest('.btn-note-action')) return;
          this.openNote(note);
        });

        // Hover selects item
        el.addEventListener('mouseenter', () => {
          if (this.selectedIndex !== index) {
            this.selectedIndex = index;
            this.updateSelectionClasses();
          }
        });

        // Edit button
        const btnEdit = el.querySelector('.btn-note-edit');
        btnEdit.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openEditModal(note);
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
      if (this.searchResults.length === 0) return;
      this.selectedIndex = Math.max(0, Math.min(this.searchResults.length - 1, this.selectedIndex + delta));
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
      if (this.searchResults.length === 0) return;
      const selected = this.searchResults[this.selectedIndex];
      if (selected && selected.note) {
        this.openNote(selected.note);
      }
    }

    async openNote(note) {
      if (!note) return;

      // Update MRU timestamp
      note.lastOpenedAt = Date.now();
      try {
        await this.db.put(note);
      } catch (e) {
        console.warn('Failed to update lastOpenedAt:', e);
      }

      if (window.MarkdownViewer && window.MarkdownViewer.setContent) {
        window.MarkdownViewer.setContent(note.content || '');
      }

      this.setActiveNote(note);
      this.closeNotesModal();

      if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
        window.MarkdownViewer.showToast(`Opened "${note.title}"`);
      }
    }

    deleteSelectedNote() {
      if (this.searchResults.length === 0) return;
      const selected = this.searchResults[this.selectedIndex];
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
        if (this.searchEngine) {
          this.searchEngine.buildIndex(this.cachedNotes);
        }

        this.filterNotes(this.elements.notesSearchInput ? this.elements.notesSearchInput.value : '');

        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(`Deleted "${note.title}"`, null, async () => {
            await this.db.put(noteBackup);
            this.cachedNotes.unshift(noteBackup);
            if (this.searchEngine) {
              this.searchEngine.buildIndex(this.cachedNotes);
            }
            this.filterNotes(this.elements.notesSearchInput ? this.elements.notesSearchInput.value : '');
            window.MarkdownViewer.showToast(`Restored "${noteBackup.title}"`);
          });
        }
      } catch (err) {
        console.error('Error deleting note:', err);
      }
    }

    startNewNote() {
      this.closeNotesModal();
      if (window.MarkdownViewer && window.MarkdownViewer.startNewNote) {
        window.MarkdownViewer.startNewNote();
      } else {
        this.unsetActiveNote();
        if (window.MarkdownViewer) {
          window.MarkdownViewer.setContent('');
        }
      }
    }

    // =========================================================================
    // Backup & Import Actions
    // =========================================================================
    async exportAllZip() {
      try {
        const allNotes = await this.db.getAll();
        const count = await NotesBackupManager.exportAllZip(allNotes);
        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(`Exported ${count} notes to ZIP archive`);
        }
      } catch (err) {
        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(err.message || 'Failed to export notes archive');
        }
      }
    }

    async handleImportJson(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        const notes = await NotesBackupManager.parseJsonBackup(file);
        const count = await this.db.importBatch(notes);

        this.cachedNotes = await this.db.getAll();
        if (this.searchEngine) {
          this.searchEngine.buildIndex(this.cachedNotes);
        }
        this.filterNotes(this.elements.notesSearchInput ? this.elements.notesSearchInput.value : '');

        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(`Imported ${count} notes from backup JSON`);
        }
      } catch (err) {
        console.error('Import JSON error:', err);
        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(err.message || 'Failed to import JSON backup');
        }
      }
    }

    async handleImportMd(e) {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      try {
        const notes = await NotesBackupManager.parseMarkdownFiles(files);
        const count = await this.db.importBatch(notes);

        this.cachedNotes = await this.db.getAll();
        if (this.searchEngine) {
          this.searchEngine.buildIndex(this.cachedNotes);
        }
        this.filterNotes(this.elements.notesSearchInput ? this.elements.notesSearchInput.value : '');

        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(`Imported ${count} markdown ${count === 1 ? 'file' : 'files'}`);
        }
      } catch (err) {
        console.error('Import MD error:', err);
        if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
          window.MarkdownViewer.showToast(err.message || 'Failed to import markdown files');
        }
      }
    }

    async handleDroppedFiles(fileList) {
      if (!fileList || fileList.length === 0) return;

      const files = Array.from(fileList);
      const jsonFile = files.find(f => f.name.toLowerCase().endsWith('.json'));

      if (jsonFile) {
        try {
          const notes = await NotesBackupManager.parseJsonBackup(jsonFile);
          const count = await this.db.importBatch(notes);
          this.cachedNotes = await this.db.getAll();
          if (this.searchEngine) this.searchEngine.buildIndex(this.cachedNotes);
          this.filterNotes(this.elements.notesSearchInput ? this.elements.notesSearchInput.value : '');
          if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
            window.MarkdownViewer.showToast(`Imported ${count} notes from dropped backup`);
          }
        } catch (err) {
          if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
            window.MarkdownViewer.showToast(err.message || 'Failed to parse dropped JSON');
          }
        }
        return;
      }

      const mdFiles = files.filter(f => /\.(md|markdown|txt)$/i.test(f.name));
      if (mdFiles.length > 0) {
        try {
          const notes = await NotesBackupManager.parseMarkdownFiles(mdFiles);
          const count = await this.db.importBatch(notes);
          this.cachedNotes = await this.db.getAll();
          if (this.searchEngine) this.searchEngine.buildIndex(this.cachedNotes);
          this.filterNotes(this.elements.notesSearchInput ? this.elements.notesSearchInput.value : '');
          if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
            window.MarkdownViewer.showToast(`Imported ${count} dropped markdown files`);
          }
        } catch (err) {
          if (window.MarkdownViewer && window.MarkdownViewer.showToast) {
            window.MarkdownViewer.showToast(err.message || 'Failed to import dropped files');
          }
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
