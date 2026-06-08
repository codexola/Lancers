import {
  stripTags,
  decodeHtmlEntities,
  extractLinks,
  extractTagText,
  extractBlockByClass
} from './html-parser.js';
import { extractProposalCount } from './html-parser-helpers.js';

export { extractProposalCount } from './html-parser-helpers.js';

export function scrapeSearchResultsFromHtml(html) {
  const projects = [];
  const seen = new Set();

  const links = extractLinks(html, /\/work\/detail\/\d+/);

  for (const link of links) {
    let href = link.href;
    if (href.startsWith('/')) href = 'https://www.lancers.jp' + href;

    const match = href.match(/\/work\/detail\/(\d+)/);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);

    const id = match[1];
    let title = link.text.trim();
    let budget = '';
    const category = '';
    let proposalCount = null;

    const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const contextRe = new RegExp(`[\\s\\S]{0,800}${escapedHref}[\\s\\S]{0,1200}`, 'i');
    const ctx = html.match(contextRe);
    if (ctx) {
      const ctxText = stripTags(ctx[0]);
      if (!title || title.length < 4) {
        const titleMatch = ctx[0].match(/class\s*=\s*["'][^"']*title[^"']*["'][^>]*>([^<]+)</i);
        if (titleMatch) title = decodeHtmlEntities(titleMatch[1]).trim();
      }
      const budgetMatch = ctxText.match(/\d[\d,]*\s*円\s*[〜~－\-–—]\s*\d[\d,]*\s*円|\d[\d,]*\s*円/);
      if (budgetMatch) budget = budgetMatch[0];
      proposalCount = extractProposalCount(ctxText);
    }

    if (title && title.length > 3) {
      projects.push({
        id,
        url: `https://www.lancers.jp/work/detail/${id}`,
        title,
        budget,
        category,
        proposalCount,
        scrapedAt: new Date().toISOString()
      });
    } else if (id) {
      const titleFromCtx = ctx ? (ctx[0].match(/class\s*=\s*["'][^"']*title[^"']*["'][^>]*>([^<]+)</i)?.[1] || '').trim() : '';
      projects.push({
        id,
        url: `https://www.lancers.jp/work/detail/${id}`,
        title: titleFromCtx || `案件 #${id}`,
        budget,
        category,
        proposalCount,
        scrapedAt: new Date().toISOString()
      });
    }
  }

  return projects;
}

export function scrapeProjectDetailFromHtml(html, url) {
  const pageText = stripTags(html);

  let title = extractTagText(html, 'h1');
  if (!title) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    title = h1Match ? stripTags(h1Match[1]) : '';
  }

  const budget = extractBudget(pageText, html);
  const description = extractDescription(html, pageText);
  const category = extractCategory(html);
  const proposalCount = extractProposalCount(pageText);
  const desiredDeadline = extractDesiredDeadline(pageText, html);
  const projectType = extractProjectType(pageText);

  const idMatch = url.match(/\/work\/detail\/(\d+)/);

  return {
    id: idMatch ? idMatch[1] : null,
    url,
    title,
    budget,
    description: description.substring(0, 8000),
    category,
    proposalCount,
    desiredDeadline,
    projectType,
    scrapedAt: new Date().toISOString()
  };
}

function extractBudget(pageText, html) {
  const patterns = [
    /(\d[\d,]*)\s*円\s*[〜~－\-–—]\s*(\d[\d,]*)\s*円/,
    /(\d[\d,]*)\s*円/
  ];
  for (const pattern of patterns) {
    const match = pageText.match(pattern);
    if (match) return match[0];
  }

  const dtRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  let m;
  while ((m = dtRe.exec(html)) !== null) {
    const label = stripTags(m[1]);
    const value = stripTags(m[2]);
    if ((label.includes('予算') || label.includes('報酬') || label.includes('金額')) && value.includes('円')) {
      return value;
    }
  }
  return '';
}

function extractDescription(html, pageText) {
  const classFragments = ['description', 'detail-body', 'p-work-detail__body', 'p-work-detail__description'];
  for (const frag of classFragments) {
    const text = extractBlockByClass(html, frag);
    if (text.length > 50) return text;
  }

  const sectionRe = /依頼詳細[\s\S]{0,20}?<[\s\S]*?>([\s\S]{100,8000}?)<\//i;
  const m = html.match(sectionRe);
  if (m) return stripTags(m[1]);

  return pageText.substring(0, 5000);
}

function extractCategory(html) {
  const crumbs = [];
  const blockMatch = html.match(/class\s*=\s*["'][^"']*breadcrumb[^"']*["'][^>]*>[\s\S]*?<\/nav>/i);
  if (blockMatch) {
    const linkRe = /<a[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = linkRe.exec(blockMatch[0])) !== null) {
      crumbs.push(stripTags(m[1]));
    }
  }
  return crumbs.join(' > ');
}

function extractDesiredDeadline(pageText, html) {
  const patterns = [
    /希望納期[：:\s]*([^\n<]+)/,
    /納期[：:\s]*([^\n<]+)/,
    /希望完了日[：:\s]*([^\n<]+)/,
    /(\d{4}[\/年]\d{1,2}[\/月]\d{1,2}日?)/
  ];
  for (const pattern of patterns) {
    const match = pageText.match(pattern);
    if (match) return match[1]?.trim() || match[0];
  }

  const dtRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  let m;
  while ((m = dtRe.exec(html)) !== null) {
    const label = stripTags(m[1]);
    if (label.includes('納期') || label.includes('希望')) {
      return stripTags(m[2]);
    }
  }
  return '';
}

function extractProjectType(pageText) {
  if (pageText.includes('コンペ')) return 'competition';
  if (pageText.includes('タスク')) return 'task';
  if (pageText.includes('プロジェクト')) return 'project';
  return 'unknown';
}

export function isLoginOrErrorPage(html) {
  const hasWorkContent = html.includes('/work/detail/') ||
    html.includes('work/search') ||
    html.includes('p-work-detail') ||
    html.includes('依頼詳細');
  if (hasWorkContent) return false;
  return /ログイン|login-form|signin/i.test(html.substring(0, 5000));
}
