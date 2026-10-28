/**
 * Notes Search Engine & Text Processing Module
 * 
 * Architecture:
 * 1. Markdown syntax stripper for clean plaintext indexing
 * 2. Dual-Path Content Search:
 *    - Path A: Literal & Flexible Whitespace (Ctrl+F) over raw markdown content
 *    - Path B: Stripped Plaintext & Token Density Cluster over formatted content
 * 3. Density-Based Smart Snippet Generator:
 *    - Anchors on the exact phrase match or on the highest query token density window
 *    - Continuous phrase highlighting (<mark class="search-match">)
 * 4. Multi-tier weighted scoring (Title > Description > Exact Content > Token Content)
 */

(function () {
  'use strict';

  function escapeRegex(str) {
    return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  // Extract clean alphanumeric tokens (strips leading/trailing punctuation)
  function cleanTokens(str) {
    if (!str) return [];
    return str
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/^[^a-z0-9_]+|[^a-z0-9_]+$/gi, ''))
      .filter(w => w.length > 0);
  }

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
      let bonus = 0;
      if (subIdx === 0) bonus = 500;
      else if (/[\s_\-]/.test(lowerText[subIdx - 1])) bonus = 250;
      return { match: true, score: 2000 - subIdx + bonus, indices };
    }

    // 2. Multi-word search
    const words = cleanTokens(lowerQuery);
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
    const escapedWords = queryWords.map(escapeRegex).filter(Boolean);
    if (escapedWords.length === 0) return escapeHtml(text);
    const regex = new RegExp(`(${escapedWords.join('|')})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark class="search-match">$1</mark>');
  }

  // Highlight snippet with continuous phrase support
  function highlightSnippet(snippetText, query, tokens) {
    if (!snippetText) return '';
    let escaped = escapeHtml(snippetText);

    // 1. Exact query phrase
    const trimmed = (query || '').trim();
    if (trimmed.length > 1) {
      const exactRegex = new RegExp(`(${escapeRegex(trimmed)})`, 'gi');
      if (exactRegex.test(escaped)) {
        return escaped.replace(exactRegex, '<mark class="search-match">$1</mark>');
      }
    }

    // 2. Flexible phrase across spaces/newlines
    if (tokens && tokens.length > 1) {
      const flexPattern = tokens.map(escapeRegex).join('\\s+');
      try {
        const flexRegex = new RegExp(`(${flexPattern})`, 'gi');
        if (flexRegex.test(escaped)) {
          return escaped.replace(flexRegex, '<mark class="search-match">$1</mark>');
        }
      } catch (e) {}
    }

    // 3. Fallback to individual word highlights
    return highlightWords(snippetText, tokens);
  }

  // Density-Based Smart Snippet Generator
  function extractSmartSnippet(content, query, queryWords, exactIdx = -1, exactLen = 0, maxChars = 110) {
    if (!content) return '';
    const lower = content.toLowerCase();

    let bestIdx = exactIdx;
    let bestLen = exactLen || (query ? query.length : 0);

    // If no exact match index provided, find highest word cluster density
    if (bestIdx === -1) {
      const tokens = cleanTokens(query);
      if (tokens.length === 0) return '';

      const positions = [];
      tokens.forEach(token => {
        let pos = lower.indexOf(token);
        let count = 0;
        while (pos !== -1 && count < 10) {
          positions.push({ pos, token });
          pos = lower.indexOf(token, pos + token.length);
          count++;
        }
      });

      positions.sort((a, b) => a.pos - b.pos);

      let maxClusterCount = 0;
      for (let i = 0; i < positions.length; i++) {
        const windowStart = positions[i].pos;
        const windowEnd = windowStart + maxChars;
        const seenTokens = new Set();
        for (let j = i; j < positions.length && positions[j].pos < windowEnd; j++) {
          seenTokens.add(positions[j].token);
        }
        if (seenTokens.size > maxClusterCount) {
          maxClusterCount = seenTokens.size;
          bestIdx = windowStart;
          bestLen = positions[i].token.length;
        }
      }
    }

    if (bestIdx === -1) return '';

    // Center window around matched phrase or cluster
    const half = Math.floor((maxChars - bestLen) / 2);
    let start = Math.max(0, bestIdx - half);
    let end = Math.min(content.length, start + maxChars);

    // Snap to word boundaries
    if (start > 0) {
      const nextSpace = content.indexOf(' ', start);
      if (nextSpace !== -1 && nextSpace < bestIdx) start = nextSpace + 1;
    }
    if (end < content.length) {
      const prevSpace = content.lastIndexOf(' ', end);
      if (prevSpace > bestIdx) end = prevSpace;
    }

    let snippet = content.slice(start, end).replace(/\s+/g, ' ').trim();
    if (start > 0) snippet = '… ' + snippet;
    if (end < content.length) snippet = snippet + ' …';

    return highlightSnippet(snippet, query, queryWords);
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
        rawContent: note.content || '',
        contentLower: (note.content || '').toLowerCase(),
        titleLower: (note.title || '').toLowerCase(),
        descLower: (note.description || '').toLowerCase(),
        // Pre-computed plaintext representation
        plainText: stripMarkdown(note.content || '')
      }));
    }

    search(query) {
      const q = (query || '').trim();
      const qLower = q.toLowerCase();
      const queryTokens = cleanTokens(q);

      // If query is blank: sort by MRU (lastOpenedAt descending, falling back to updatedAt)
      if (!q || queryTokens.length === 0) {
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

        // -------------------------------------------------------------------
        // Tier 1: Title match (Fuzzy)
        // -------------------------------------------------------------------
        const titleMatch = fuzzyMatchTitle(note.title, q);
        if (titleMatch.match && titleMatch.score > 0) {
          score += 1000 + titleMatch.score;
          titleIndices = titleMatch.indices;
          matchTier = 'title';
        }

        // -------------------------------------------------------------------
        // Tier 2: Description match
        // -------------------------------------------------------------------
        if (item.descLower) {
          const descHasFull = item.descLower.includes(qLower);
          const descHasAllWords = queryTokens.length > 1 && queryTokens.every(w => item.descLower.includes(w));
          if (descHasFull || descHasAllWords) {
            score += descHasFull ? 350 : 250;
            if (matchTier === 'none') matchTier = 'desc';
          }
        }

        // -------------------------------------------------------------------
        // Tier 3: Content Match (Dual-Path)
        // -------------------------------------------------------------------
        let contentMatched = false;
        let exactIdx = -1;
        let exactLen = q.length;

        // Path A: Literal Raw Content Matching (The "Ctrl+F" Pass)
        // 1. Direct raw content substring (e.g. code snippets, exact markdown tags, full sentences)
        const directRawIdx = item.contentLower.indexOf(qLower);
        if (directRawIdx !== -1) {
          score += 450;
          contentMatched = true;
          exactIdx = directRawIdx;
          exactLen = q.length;
        } else if (queryTokens.length > 1) {
          // 2. Flexible whitespace match (sentence wrapping across newlines/spaces)
          try {
            const flexPattern = queryTokens.map(escapeRegex).join('\\s+');
            const flexRegex = new RegExp(flexPattern, 'i');
            const match = item.rawContent.match(flexRegex);
            if (match) {
              score += 400;
              contentMatched = true;
              exactIdx = match.index;
              exactLen = match[0].length;
            }
          } catch (e) {}
        }

        // Path B: Formatting-Free Stripped Content Matching (The "Fuzzy / Token" Pass)
        if (!contentMatched) {
          // 1. Continuous phrase inside stripped markdown (e.g. hello **world**)
          if (item.plainText.includes(qLower)) {
            score += 250;
            contentMatched = true;
          } else if (queryTokens.length > 0) {
            // 2. All clean tokens found in content
            const allTokensFound = queryTokens.every(w => item.plainText.includes(w) || item.contentLower.includes(w));
            if (allTokensFound) {
              score += 150;
              contentMatched = true;
            } else if (queryTokens.length >= 4) {
              // 3. Partial match (>= 75% of query words matched for long sentences)
              const matchedCount = queryTokens.filter(w => item.plainText.includes(w) || item.contentLower.includes(w)).length;
              if (matchedCount / queryTokens.length >= 0.75) {
                score += 80 + Math.round((matchedCount / queryTokens.length) * 40);
                contentMatched = true;
              }
            }
          }
        }

        // Build context snippet if matched only in content or description
        if (contentMatched) {
          if (matchTier === 'none') {
            matchTier = 'content';
          }
          snippetHtml = extractSmartSnippet(item.rawContent, q, queryTokens, exactIdx, exactLen);
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
    highlightSnippet,
    extractSmartSnippet,
    NotesSearchEngine
  };

})();
