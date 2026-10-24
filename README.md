# Markdown Viewer (Showdown)
> Simple, dark neutral Markdown and Mermaid diagram viewer for AI agent outputs.

## Features
- **Showdown Engine**: GitHub Flavored Markdown (tables, task lists, strikethrough, autolinks, code blocks).
- **Mermaid Support**: Renders flowcharts, sequence diagrams, class diagrams, etc.
- **Dark Neutral Theme**: Clean zinc/charcoal palette with zero blue tint and custom scrollbars.
- **Diagram Inspector**: Pan & zoom modal for complex Mermaid diagrams with SVG export.
- **Blank by Default**: Opens clean and ready for your text (auto-saves draft to `localStorage`).

## Handy Keyboard Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Alt + 1`** or **`Alt + S`** | **Split View** | Side-by-side editor and preview |
| **`Alt + 2`** or **`Alt + P`** | **Preview Only** | Full-width reading view (hides editor) |
| **`Alt + 3`** or **`Alt + E`** | **Editor Only** | Full-width editor |
| **`Alt + V`** | **Paste** | Paste from clipboard |
| **`Alt + C`** or **`Alt + K`** | **Clear** | Wipe editor content |
| **`Alt + T`** | **Sample** | Load agent sample template |
| **`Alt + H`** | **Copy HTML** | Copy rendered HTML to clipboard |
| **`Esc`** | **Close Modal** | Close diagram zoom inspector |

## Quick Start
```bash
npm start
# or
node server.js
```
Open **`http://localhost:3000`** in your browser.
