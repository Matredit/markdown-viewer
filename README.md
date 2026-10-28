# Markdown Viewer (Showdown)
> Simple, keyboard-driven dark neutral Markdown and Mermaid diagram viewer with persistent note management for AI agent outputs.

## Features

### Markdown & Diagram Rendering
- **Showdown Engine**: GitHub Flavored Markdown (tables, task lists, strikethrough, autolinks, code blocks).
- **Syntax Highlighting**: Code syntax styling powered by Prism (Tomorrow theme).
- **Mermaid Support**: Renders flowcharts, sequence diagrams, state diagrams, class diagrams, entity-relationship diagrams, and XY charts.
- **Diagram Inspector**: Pan & zoom modal for complex Mermaid diagrams with one-click SVG export.
- **Synchronized Scrolling (`Alt + X`)**: Proportional bidirectional scrolling locked across section and heading anchors in Split view.
- **Markdown Cheatsheet & Guide (`Alt + /`)**: Built-in guide covering non-intuitive formatting rules (spaces, line breaks, table delimiters) specifically tailored for Word & Google Docs users.

### Note Management & Storage
- **Persistent IndexedDB Storage**: Notes are stored directly in your browser's IndexedDB—never vanishing across restarts or reboots.
- **Debounced Draft Persistence**: Active editor text is preserved in `localStorage` with a 500ms debounce during typing and immediately flushed on tab close (`beforeunload`), page navigation (`pagehide`), or manual save (<kbd>Ctrl + S</kbd>).
- **Command Palette & Search (`Ctrl + K` / `Alt + O`)**: Fast keyboard-driven modal to search, open, edit, and delete notes without touching your mouse.
- **Dual-Path Content & Title Search**:
  - **Path A (Literal / Full-Sentence)**: Matches exact phrases, multi-word sentences across hard-wrapped newlines, tables, and raw code syntax (`npm start`, `| Key | Type |`).
  - **Path B (Markdown-Stripped & Fuzzy Token Cluster)**: Strips formatting tags to match across bold/italic styles (`hello **world**`) and scores by keyword density.
  - **Smart Excerpt Snippets**: Centers list preview snippets directly around matched phrases or word density clusters with yellow highlighting.
- **Clean Display Titles & Chronological Export**: Notes maintain clean titles inside the app UI (`agent-memory`), while date prefixes are automatically applied on disk export (`2026-10-27_agent-memory.md`).
- **Multiline Descriptions**: Optional descriptions for notes that appear in search results and are indexed by the search engine.
- **Active Note Pill & Draft Lifecycle**:
  - Indicates the currently active note in the header.
  - Displays a yellow bullet dot (`•`) when there are unsaved changes.
  - Quick detach button (`✕`) unlinks the note into an independent scratchpad draft without losing text.
- **Size Health Warnings**: Notes modal displays exact byte/KB/MB sizes; highlights notes **$\ge$ 100 KB in yellow (`Large`)** and **$\ge$ 500 KB in red (`Too large`)** to flag potential browser overhead.
- **Full Backup & Restore**:
  - **Export All (`.zip`)**: Generates a standard binary ZIP archive containing all individual `.md` files alongside a complete `markdown-viewer-backup.json` metadata file.
  - **Import**: Restore backup files (`.json`) or batch-import multiple markdown files (`.md`) via toolbar buttons or drag-and-drop.
- **Non-Blocking 6-Second Undo Toasts**: Safety net for deletions, editor clears, and paste overwrites with clickable Undo buttons.
- **Dark Neutral Theme**: Clean zinc/charcoal palette (`#111111` / `#181818` / `#202020`) with zero blue tint and custom scrollbars.

---

## Keyboard Shortcuts

### Note Management
| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Ctrl/Alt + K/O`** | **Notes Palette** | Open search and note management palette (`Ctrl+K`, `Alt+K`, `Ctrl+O`, `Alt+O`) |
| **`Ctrl + S`** | **Save** | Save new note or update current note in-place |
| **`Ctrl + Shift + S`** | **Save As** | Save current editor content as a new note (prompts title & description) |
| **`F2`** | **Edit Note** | Edit title and description (works inside search palette or on active note) |
| **`↑` / `↓`** | **Navigate** | Move selection up and down in Notes Palette |
| **`Enter`** | **Open / Confirm** | Open selected note in search palette or confirm modal actions |
| **`Delete`** | **Delete Note** | Delete selected note in search palette (with 6s Undo toast) |

### Workspace & Editing
| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Alt + N`** | **New Note** | Close active note and start a blank note / clear editor (with 6s Undo) |
| **`Alt + V`** | **Paste** | Paste clipboard into editor (marks open note dirty with yellow dot `•` and 6s Undo) |
| **`Alt + Shift + V`** | **Paste Draft** | Automatically unlinks any active note and pastes as a fresh draft (with 6s Undo) |
| **`Alt + C`** | **Copy MD** | Copy original Markdown source to clipboard |
| **`Alt + H`** | **Copy HTML** | Copy rendered HTML to clipboard |
| **`Alt + T`** | **Sample** | Load agent sample template (with 6s Undo) |
| **`Alt + /`** | **Guide** | Open Markdown Cheatsheet for Word & Google Docs users |
| **`Esc`** | **Close Modal** | Close any active modal (Notes, Save, Edit, Guide, or Zoom) |

### View Modes & Layout
| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Alt + 1`** | **Split View** | Side-by-side editor and preview |
| **`Alt + 2`** | **Preview Only** | Full-width reading view (hides editor) |
| **`Alt + 3`** | **Editor Only** | Full-width editing view |
| **`Alt + X`** | **Sync Scroll** | Toggle synchronized scrolling between editor and preview |

---

## Quick Start

```bash
npm start
# or
node server.js
```

Open **`http://localhost:3000`** in your browser.
