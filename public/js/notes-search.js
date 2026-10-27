/**
 * Notes Search Engine & Text Processing Module
 * 
 * Provides:
 * 1. Markdown syntax stripper for clean plaintext matching
 * 2. Multi-tier weighted search:
 *    - Tier 1: Filename / Title (fuzzy subsequence + prefix bonus)
 *    - Tier 2: Description (word matches)
 *    - Tier 3: Content (plaintext substring + word matches with context snippet)
 * 3. Highlights & Snippet generator
 */

(function () {
  'use strict';

  // Strip markdown formatting symbols for plaintext indexing
  function stripMarkdown(text) {
    if (!text) return '';
    return text
      // Remove code fences content markers
      .replace(/```[\s\S]*?```/g, m => m.replace(/```/g, ''))
      // Remove inline code ticks
      .replace(/`([^`]+)`/g, '$1')
      // Remove images & links syntax, keep text/alt
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Remove bold & italic markers
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/~~(.*?)~~/g, '$1')
      // Remove headers, list bullets, blockquotes
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^[\s]*[-+*]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      .replace(/^>\s+/gm, '')
      // Remove table delimiters
      .replace(/\|/g, ' ')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
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

  // Fuzzy match for titles (returns match boolean, score, and matched char indices)
  function fuzzyMatchTitle(text, query) {
    if (!query) return { match: true, score: 0, indices: [] };
    const lowerText = (text || '').toLowerCase();
    const lowerQuery = query.toLowerCase().trim();

    // 1. Exact Substring Match
    const subIdx = lowerText.indexOf(lowerQuery);
    if (subIdx !== -1) {
      const indices = [];
      for (let i = 0; i < lowerQuery.length; i++) indices.push(subIdx + i);
      // Extra bonus if substring is at start of string or after word boundary
      let bonus = 0;
      if (subIdx === 0) bonus = 500;
      else if (/[\s_\-]/.test(lowerText[subIdx - 1])) bonus = 250;
      return { match: true, score: 2000 - subIdx + bonus, indices };
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

  // Highlight matched character indices in title
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

  // Highlight words in arbitrary text
  function highlightWords(text, queryWords) {
    if (!text || !queryWords || queryWords.length === 0) return escapeHtml(text);
    const escapedWords = queryWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
    if (escapedWords.length === 0) return escapeHtml(text);
    const regex = new RegExp(`(${escapedWords.join('|')})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark class="search-match">$1</mark>');
  }

  // Extract surrounding context snippet when match is found in content
  function extractContentSnippet(rawContent, queryWords, maxChars = 110) {
    if (!rawContent || !queryWords || queryWords.length === 0) return '';
    const lower = rawContent.toLowerCase();

    // Find the first word that appears in content
    let matchIdx = -1;
    let matchedWord = '';
    for (const w of queryWords) {
      const idx = lower.indexOf(w);
      if (idx !== -1 && (matchIdx === -1 || idx < matchIdx)) {
        matchIdx = idx;
        matchedWord = w;
      }
    }

    if (matchIdx === -1) return '';

    // Calculate window around match
    const half = Math.floor((maxChars - matchedWord.length) / 2);
    let start = Math.max(0, matchIdx - half);
    let end = Math.min(rawContent.length, start + maxChars);

    // Snap to word boundaries if possible
    if (start > 0) {
      const nextSpace = rawContent.indexOf(' ', start);
      if (nextSpace !== -1 && nextSpace < matchIdx) start = nextSpace + 1;
    }
    if (end < rawContent.length) {
      const prevSpace = rawContent.lastIndexOf(' ', end);
      if (prevSpace > matchIdx) end = prevSpace;
    }

    let snippet = rawContent.slice(start, end).replace(/\s+/g, ' ').trim();
    if (start > 0) snippet = '… ' + snippet;
    if (end < rawContent.length) snippet = snippet + ' …';

    return highlightWords(snippet, queryWords);
  }

  // Search Engine Class
  class NotesSearchEngine {
    constructor() {
      this.indexedNotes = [];
    }

    // Build in-memory index for fast keystroke filtering
    buildIndex(notes) {
      this.indexedNotes = (notes || []).map(note => ({
        note,
        titleLower: (note.title || '').toLowerCase(),
        descLower: (note.description || '').toLowerCase(),
        // Pre-computed plaintext representation
        plainText: stripMarkdown(note.content || '')
      }));
    }

    search(query) {
      const q = (query || '').trim();
      const qLower = q.toLowerCase();
      const queryWords = qLower.split(/\s+/).filter(Boolean);

      // If query is blank: sort by MRU (lastOpenedAt descending, falling back to updatedAt)
      if (!q || queryWords.length === 0) {
        const sorted = [...this.indexedNotes].sort((a, b) => {
          const aTime = a.note.lastOpenedAt || a.note.updatedAt || a.note.createdAt || 0;
          const bTime = b.note.lastOpenedAt || b.note.updatedAt || b.note.createdAt || 0;
          return bTime - aTime;
        });

        return sorted.map(item => ({
          note: item.note,
          score: 0,
          titleIndices: [],
          matchTier: 'none',
          snippetHtml: ''
        }));
      }

      const results = [];

      for (const item of this.indexedNotes) {
        const note = item.note;
        let score = 0;
        let titleIndices = [];
        let matchTier = 'none';
        let snippetHtml = '';

        // Tier 1: Title match (Fuzzy)
        const titleMatch = fuzzyMatchTitle(note.title, q);
        if (titleMatch.match && titleMatch.score > 0) {
          score += 1000 + titleMatch.score;
          titleIndices = titleMatch.indices;
          matchTier = 'title';
        }

        // Tier 2: Description match (Whole query or all words)
        if (item.descLower) {
          const descHasFull = item.descLower.includes(qLower);
          const descHasAllWords = queryWords.length > 1 && queryWords.every(w => item.descLower.includes(w));
          if (descHasFull || descHasAllWords) {
            score += descHasFull ? 350 : 250;
            if (matchTier === 'none') matchTier = 'desc';
          }
        }

        // Tier 3: Content match (Stripped markdown search)
        if (item.plainText) {
          const contentHasFull = item.plainText.includes(qLower);
          const contentHasAllWords = queryWords.length > 1 && queryWords.every(w => item.plainText.includes(w));
          if (contentHasFull || contentHasAllWords) {
            score += contentHasFull ? 80 : 50;
            if (matchTier === 'none') {
              matchTier = 'content';
              snippetHtml = extractContentSnippet(note.content, queryWords);
            }
          }
        }

        if (score > 0) {
          results.push({
            note,
            score,
            titleIndices,
            matchTier,
            snippetHtml
          });
        }
      }

      // Sort matching notes by score descending
      results.sort((a, b) => b.score - a.score);
      return results;
    }
  }

  // Export to window
  window.NotesSearch = {
    stripMarkdown,
    fuzzyMatchTitle,
    highlightMatches,
    highlightWords,
    extractContentSnippet,
    NotesSearchEngine
  };

})();
