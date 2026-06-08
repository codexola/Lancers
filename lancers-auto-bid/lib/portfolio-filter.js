import { INCLUDE_KEYWORDS } from './constants.js';

/**
 * Parse portfolio lines. Supports:
 *   https://example.com/project
 *   https://example.com/project | WordPress LP制作
 */
export function parsePortfolioEntries(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const sep = line.includes('|') ? '|' : (line.includes('\t') ? '\t' : null);
      if (sep) {
        const idx = line.indexOf(sep);
        return {
          url: line.slice(0, idx).trim(),
          description: line.slice(idx + 1).trim()
        };
      }
      return { url: line, description: '' };
    })
    .filter(e => e.url.startsWith('http'));
}

function projectContext(project) {
  return [
    project.title,
    project.description,
    project.category,
    project.budget,
    project.searchSource
  ].filter(Boolean).join(' ').toLowerCase();
}

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[\s/\-_.?=&|、。，・]+/)
    .filter(t => t.length > 1);
}

function urlTokens(url) {
  return tokenize(url).filter(t =>
    !['https', 'http', 'www', 'com', 'jp', 'html', 'htm', 'php', 'index'].includes(t)
  );
}

/**
 * Select portfolio links that match the customer's project requirements.
 * Returns only matching URLs (never all links).
 */
export function selectRelevantPortfolioLinks(project, entries, { maxLinks = 3 } = {}) {
  if (!entries.length) return [];

  const ctx = projectContext(project);
  const ctxTokens = new Set(tokenize(ctx));

  const scored = entries.map(entry => {
    let score = 0;
    const linkText = `${entry.url} ${entry.description}`.toLowerCase();
    const linkToks = urlTokens(entry.url);

    for (const tok of linkToks) {
      if (ctx.includes(tok)) score += 3;
      if (ctxTokens.has(tok)) score += 2;
    }

    if (entry.description) {
      for (const tok of tokenize(entry.description)) {
        if (ctx.includes(tok)) score += 2;
      }
    }

    for (const kw of INCLUDE_KEYWORDS) {
      const kwLower = kw.toLowerCase();
      if (ctx.includes(kwLower) && linkText.includes(kwLower)) score += 4;
    }

    if (project.searchSource === 'system') {
      if (/system|api|bot|auto|backend|python|scraping|連携/.test(linkText)) score += 2;
    }
    if (project.searchSource === 'web') {
      if (/web|lp|wordpress|site|frontend|コーディング|ec|cms/.test(linkText)) score += 2;
    }

    return { url: entry.url, description: entry.description, score };
  });

  const matched = scored
    .filter(s => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxLinks);

  return matched.map(s => s.url);
}

export function getAllPortfolioUrls(raw) {
  return parsePortfolioEntries(raw).map(e => e.url);
}
