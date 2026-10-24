// Markdown Parsers Registry & Benchmark Engine
(function (root) {
  'use strict';

  // Instantiate parser instances
  let mdItInstance = null;
  let showdownInstance = null;
  let remarkableInstance = null;

  function initParsers() {
    // 1. markdown-it setup
    if (typeof window.markdownit === 'function') {
      mdItInstance = window.markdownit({
        html: true,
        xhtmlOut: false,
        breaks: false,
        langPrefix: 'language-',
        linkify: true,
        typographer: true
      });

      if (typeof window.markdownItTaskLists === 'function') {
        mdItInstance.use(window.markdownItTaskLists);
      }
    }

    // 2. showdown setup
    if (typeof window.showdown !== 'undefined' && window.showdown.Converter) {
      showdownInstance = new window.showdown.Converter({
        tables: true,
        tasklists: true,
        strikethrough: true,
        ghCodeBlocks: true,
        emoji: true,
        simplifiedAutoLink: true,
        simpleLineBreaks: false,
        ghCompatibleHeaderId: true,
        parseImgDimensions: true
      });
    }

    // 3. remarkable setup
    if (typeof window.remarkable !== 'undefined' && window.remarkable.Remarkable) {
      remarkableInstance = new window.remarkable.Remarkable({
        html: true,
        xhtmlOut: false,
        breaks: false,
        langPrefix: 'language-',
        typographer: true
      });
    }
  }

  // Registry of supported parsers
  const PARSERS = [
    {
      id: 'marked',
      name: 'Marked',
      version: 'v18.1',
      tagline: 'High-speed, GitHub Flavored Markdown parser',
      bundleSize: '47 KB',
      gfmScore: '100% GFM',
      agentRating: 'Top Pick for Agents',
      badgeColor: '#10b981',
      features: {
        tables: true,
        tasks: true,
        autoLink: true,
        headingIds: false,
        strikeTag: '<del>'
      },
      pros: [
        'Built-in GFM tables & task lists without extra plugins',
        'Consistently fast parsing throughput',
        'Direct <code class="language-*"> classes ready for Prism/Mermaid',
        'Active maintenance & robust ecosystem'
      ],
      cons: [
        'Extensibility is via hooks/walkTokens rather than AST plugins'
      ],
      parse: function (markdown) {
        if (!window.marked || typeof window.marked.parse !== 'function') {
          return '<p class="parse-error">Marked library failed to load.</p>';
        }
        return window.marked.parse(markdown);
      }
    },
    {
      id: 'markdown-it',
      name: 'markdown-it',
      version: 'v15.0',
      tagline: 'Gold standard CommonMark compliant parser',
      bundleSize: '99 KB',
      gfmScore: '100% CommonMark + GFM',
      agentRating: 'Industry Standard',
      badgeColor: '#3b82f6',
      features: {
        tables: true,
        tasks: true,
        autoLink: true,
        headingIds: false,
        strikeTag: '<s>'
      },
      pros: [
        '100% CommonMark spec compliance',
        'Massive plugin ecosystem (task lists, math, footnotes, anchors)',
        'Extremely reliable AST token stream',
        'Used by VS Code, Prettier, and VitePress'
      ],
      cons: [
        'Slightly larger footprint',
        'Task lists and some GFM features require plugins'
      ],
      parse: function (markdown) {
        if (!mdItInstance) initParsers();
        if (!mdItInstance) {
          return '<p class="parse-error">markdown-it library failed to load.</p>';
        }
        return mdItInstance.render(markdown);
      }
    },
    {
      id: 'showdown',
      name: 'Showdown',
      version: 'v2.1',
      tagline: 'Classic bidirectional Markdown-HTML converter',
      bundleSize: '74 KB',
      gfmScore: 'Configurable GFM',
      agentRating: 'Feature-Rich',
      badgeColor: '#8b5cf6',
      features: {
        tables: true,
        tasks: true,
        autoLink: true,
        headingIds: true,
        strikeTag: '<del>'
      },
      pros: [
        'Huge set of toggleable flags (tables, tasklists, emoji, headers)',
        'Supports two-way conversion (HTML to Markdown as well)',
        'Zero external dependencies'
      ],
      cons: [
        'Adds inline styles to task lists (<li style="margin: ...">)',
        'Slightly non-standard HTML output in edge cases',
        'Legacy codebase'
      ],
      parse: function (markdown) {
        if (!showdownInstance) initParsers();
        if (!showdownInstance) {
          return '<p class="parse-error">Showdown library failed to load.</p>';
        }
        return showdownInstance.makeHtml(markdown);
      }
    },
    {
      id: 'remarkable',
      name: 'Remarkable',
      version: 'v2.0',
      tagline: 'High-performance CommonMark parser',
      bundleSize: '120 KB',
      gfmScore: 'CommonMark + Tables',
      agentRating: 'Fast Alternative',
      badgeColor: '#ec4899',
      features: {
        tables: true,
        tasks: false,
        autoLink: true,
        headingIds: false,
        strikeTag: '<del>'
      },
      pros: [
        'Fast parsing speed',
        'CommonMark compatible',
        'Built-in tables and typographer'
      ],
      cons: [
        'Task lists require manual parsing',
        'Development slowed down in favor of markdown-it'
      ],
      parse: function (markdown) {
        if (!remarkableInstance) initParsers();
        if (!remarkableInstance) {
          return '<p class="parse-error">Remarkable library failed to load.</p>';
        }
        return remarkableInstance.render(markdown);
      }
    },
    {
      id: 'snarkdown',
      name: 'Snarkdown',
      version: 'v2.0',
      tagline: 'Ultra-lightweight ~1KB micro-parser by Jason Miller',
      bundleSize: '2.1 KB',
      gfmScore: 'Minimalist (No Tables)',
      agentRating: 'Educational / Micro',
      badgeColor: '#f59e0b',
      features: {
        tables: false,
        tasks: false,
        autoLink: false,
        headingIds: false,
        strikeTag: '<s>'
      },
      pros: [
        'Incredibly small bundle footprint (~1KB gzip)',
        'Instant startup, zero overhead',
        'Great for simple single-paragraph snippets'
      ],
      cons: [
        'Does not support GFM tables (renders raw pipes)',
        'Breaks on task lists [x]',
        'Not recommended for complex agent markdown'
      ],
      parse: function (markdown) {
        if (typeof window.snarkdown !== 'function') {
          return '<p class="parse-error">Snarkdown library failed to load.</p>';
        }
        return window.snarkdown(markdown);
      }
    }
  ];

  // Benchmark function to time a parse run
  function runBenchmark(parserId, markdown) {
    const parser = PARSERS.find(p => p.id === parserId);
    if (!parser) return { html: '', durationMs: 0, error: 'Parser not found' };

    const start = performance.now();
    try {
      const html = parser.parse(markdown);
      const durationMs = performance.now() - start;
      return { html, durationMs: Math.round(durationMs * 100) / 100, error: null };
    } catch (err) {
      const durationMs = performance.now() - start;
      return {
        html: `<div class="render-error-box"><p><strong>Error parsing markdown with ${parser.name}:</strong></p><pre>${err.message}</pre></div>`,
        durationMs: Math.round(durationMs * 100) / 100,
        error: err.message
      };
    }
  }

  // Export to global scope
  root.MarkdownParsers = {
    getAll: () => PARSERS,
    get: id => PARSERS.find(p => p.id === id),
    init: initParsers,
    benchmark: runBenchmark
  };

})(window);
