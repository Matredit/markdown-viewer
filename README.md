# Markdown Lens ⚡
> **Multi-Engine Markdown & Mermaid Comparator for AI Agent Outputs**

Struggling with unreadable Mermaid diagrams in terminal TUIs or having to manually save and open VS Code previews every time an AI agent responds? 

**Markdown Lens** is a lightweight, zero-build web application designed specifically to preview and compare how different popular JavaScript Markdown libraries render complex AI agent outputs (Mermaid graphs, tables, task lists, code blocks, and GitHub callout alerts) in real-time.

---

## 🌟 Features

- **Side-by-Side Multi-Library Windows**:
  - Compare **Marked**, **markdown-it**, **Showdown**, **Remarkable**, and **Snarkdown** side-by-side in real-time.
  - View both **Visual Preview** and raw **Generated HTML Source** for each library to inspect differences in generated markup.
  - Real-time render latency benchmark badge (`⚡ <0.1ms`) recalculated on every stroke.

- **First-Class Mermaid Graph Support**:
  - Automatically renders all `mermaid` code blocks into interactive SVGs (Flowcharts, Sequence diagrams, State diagrams, Class diagrams).
  - **Interactive Diagram Toolbar**:
    - **`Code`**: Toggle between rendered SVG diagram and raw mermaid code.
    - **`Copy SVG`**: Copy clean SVG markup directly to clipboard.
    - **`Zoom`**: Opens an interactive modal with **pan & zoom controls** (mouse drag, scrollwheel zoom, reset, download SVG).
  - Graceful syntax error handling with clear error badge if an agent produces incomplete diagram syntax.

- **Agent-Centric Workflow**:
  - **📋 Paste Clipboard**: One-click button or standard paste to immediately load what your agent just output.
  - **💾 Local Persistence**: Text is automatically preserved in `localStorage` — no lost drafts on refresh.
  - **📁 File Drop**: Drag & drop any `.md` or `.txt` file onto the window, or use the file picker.
  - **📊 Live Text Statistics**: Real-time Line count, Word count, Character count, and Estimated Read Time.
  - **🧩 Quick Snippet Bar**: Instant buttons to insert Mermaid flowcharts, sequences, tables, task lists, and alerts.
  - **GitHub Callout Alerts**: Full support for `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`.

- **Flexible Layouts & Themes**:
  - **⊞ 2-Column Grid**: Side-by-side multi-window comparison.
  - **📑 Tabbed View**: Single focused window with engine tabs.
  - **☰ 1-Column Grid**: Stacked full-width view.
  - **⛶ Window Maximize**: Pop any individual engine window into full width.
  - **🌙 Dark & ☀️ Light Themes**: Beautiful slate dark theme (agent default) and GitHub light theme.
  - **↔️ Resizable Split Pane**: Drag the divider to adjust the ratio between input and previews.

---

## 📦 Compared Markdown Libraries

| Library | Version | Bundle Size | Specification / Flavor | Verdict for AI Agents |
| :--- | :--- | :--- | :--- | :--- |
| **Marked** | `v18.1` | **47 KB** | GitHub Flavored Markdown (GFM) | 🏆 **Top Pick** — Built-in tables, task lists, high speed, GitHub style |
| **markdown-it** | `v15.0` | **99 KB** | 100% CommonMark + GFM Task Lists | 🥇 **Gold Standard** — Extremely reliable AST parser, standard compliance |
| **Showdown** | `v2.1` | **74 KB** | Classic GFM Converter | ⚙️ **Configurable** — Highly configurable flags, bidirectional conversion |
| **Remarkable** | `v2.0` | **120 KB** | CommonMark + Tables | ⚡ **Fast Alternative** — Predecessor to markdown-it, solid performance |
| **Snarkdown** | `v2.0` | **2.1 KB** | Minimalist CommonMark Subset | ⚠️ **Micro Benchmark** — Ultra-lightweight (1KB gzip), but misses tables/tasks |

---

## 🚀 Quick Start

### 1. Launch with Node (Recommended)
```bash
npm start
```
Or:
```bash
node server.js
```
Then open: **`http://localhost:3000`** in your browser.

### 2. Launch with Python
```bash
python3 -m http.server 3000 -d public
```

### 3. Open Directly (No Server Needed)
You can also open `public/index.html` directly in your browser:
```bash
xdg-open public/index.html
```

---

## 📂 Project Structure

```
.
├── package.json               # Project manifest and scripts
├── server.js                  # Zero-dependency local static HTTP server
├── README.md                  # Documentation and library comparison guide
└── public/
    ├── index.html             # Application shell and UI layout
    ├── css/
    │   ├── style.css          # App layout, toolbars, split panes, modals, themes
    │   └── markdown.css       # GitHub markdown styling, tables, code blocks, alerts
    ├── js/
    │   ├── app.js             # Main application controller, state, event listeners
    │   ├── parsers.js         # Benchmark wrappers for marked, showdown, markdown-it, etc.
    │   ├── mermaid-mgr.js     # Mermaid renderer, cache, theme sync, zoom modal
    │   └── samples.js         # Preloaded agent output samples (Flowchart, Sequence, etc.)
    └── vendor/                # 100% local offline vendor libraries
        ├── marked.min.js
        ├── markdown-it.min.js
        ├── markdown-it-task-lists.min.js
        ├── showdown.min.js
        ├── remarkable.min.js
        ├── snarkdown.min.js
        ├── mermaid.min.js
        ├── prism.min.js
        ├── prism-tomorrow.css
        └── prism-components/  # Python, Bash, JSON, TS, YAML syntax highlighters
```

---

## 💡 Recommendation for Agent Workflows

If you are picking one library for an app or preview tool:
1. **Choose [Marked](https://marked.js.org/)** if you want built-in GitHub Flavored Markdown (tables and `- [x]` task lists work out of the box with zero extra plugins) and minimal configuration.
2. **Choose [markdown-it](https://github.com/markdown-it/markdown-it)** if you need strict CommonMark compliance, syntax safety, and AST-level plugin extensibility (e.g., footnotes, anchor headings, math, containers).
3. Combine either of them with **[Mermaid.js](https://mermaid.js.org/)** for diagram rendering by hooking into `<pre><code class="language-mermaid">` blocks.
