# Markdown Viewer (Showdown)
> Simple, dark neutral Markdown and Mermaid diagram viewer for AI agent outputs.

## Features
- **Showdown Engine**: GitHub Flavored Markdown (tables, task lists, strikethrough, autolinks, code blocks).
- **Mermaid Support**: Renders flowcharts, sequence diagrams, class diagrams, etc.
- **Dark Neutral Theme**: Clean zinc/charcoal palette with zero blue tint and custom scrollbars.
- **Diagram Inspector**: Pan & zoom modal for complex Mermaid diagrams with SVG export.
- **Markdown Cheatsheet & Guide (`Alt + /`)**: Built-in guide covering non-intuitive formatting rules (spaces, line breaks, table delimiters) specifically tailored for Word & Google Docs users.
- **Blank by Default**: Opens clean and ready for your text (auto-saves draft to `localStorage`).

## Handy Keyboard Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Alt + /`** | **Guide** | Open Markdown Cheatsheet for Word & Docs users |
| **`Alt + C`** | **Copy MD** | Copy original Markdown source to clipboard |
| **`Shift + Alt + C`** | **Clear** | Wipe editor content instantly (with Undo) |
| **`Alt + V`** | **Paste** | Paste from clipboard |
| **`Alt + H`** | **Copy HTML** | Copy rendered HTML to clipboard |
| **`Alt + T`** | **Sample** | Load agent sample template |
| **`Alt + 1`** or **`Alt + S`** | **Split View** | Side-by-side editor and preview |
| **`Alt + 2`** or **`Alt + P`** | **Preview Only** | Full-width reading view (hides editor) |
| **`Alt + 3`** or **`Alt + E`** | **Editor Only** | Full-width editor |
| **`Esc`** | **Close Modal** | Close Guide or diagram zoom inspector |

## Quick Start
```bash
npm start
# or
node server.js
```
Open **`http://localhost:3000`** in your browser.
