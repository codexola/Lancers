/**
 * Service-worker-safe HTML utilities.
 * DOMParser is unavailable in Chrome extension service workers.
 */

export function parseHtml(html) {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(html, 'text/html');
  }
  return new SwHtmlDocument(html);
}

export function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

class SwHtmlDocument {
  constructor(html) {
    this._html = html;
    this.body = {
      textContent: stripTags(html)
    };
  }

  querySelectorAll(selector) {
    return queryAll(this._html, selector);
  }

  querySelector(selector) {
    return queryAll(this._html, selector)[0] || null;
  }
}

class SwElement {
  constructor(html, tag) {
    this._html = html;
    this.tagName = tag.toUpperCase();
    this.id = extractAttr(html, 'id') || '';
  }

  get textContent() {
    return stripTags(this._innerHtml());
  }

  get innerHTML() {
    return this._innerHtml();
  }

  getAttribute(name) {
    return extractAttr(this._html, name);
  }

  get href() {
    return this.getAttribute('href');
  }

  querySelectorAll(selector) {
    return queryAll(this._innerHtml(), selector);
  }

  querySelector(selector) {
    return queryAll(this._innerHtml(), selector)[0] || null;
  }

  closest() {
    return this;
  }

  get parentElement() {
    return null;
  }

  get nextElementSibling() {
    return null;
  }

  _innerHtml() {
    const m = this._html.match(new RegExp(`<${this.tagName}[^>]*>([\\s\\S]*)</${this.tagName}>`, 'i'));
    return m ? m[1] : '';
  }
}

function extractAttr(tagHtml, name) {
  const m = tagHtml.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? decodeHtmlEntities(m[1]) : null;
}

function queryAll(html, selector) {
  const results = [];

  if (selector.includes('[href*=')) {
    const attrMatch = selector.match(/\[href\*="([^"]+)"\]/);
    const needle = attrMatch ? attrMatch[1] : '';
    const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (needle && !m[1].includes(needle)) continue;
      results.push(wrapTag(m[0], 'a'));
    }
    return results;
  }

  if (selector.includes('[href]')) {
    const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      results.push(wrapTag(m[0], 'a'));
    }
    return results;
  }

  if (selector.startsWith('.')) {
    const cls = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return matchByClass(html, cls);
  }

  const tagMatch = selector.match(/^([a-z\d]+)/i);
  if (tagMatch) {
    const tag = tagMatch[1];
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi');
    let m;
    while ((m = re.exec(html)) !== null) {
      results.push(wrapTag(m[0], tag));
    }
  }

  return results;
}

function matchByClass(html, className) {
  const results = [];
  const re = /<([a-z][a-z0-9]*)\b[^>]*class\s*=\s*["'][^"']*\b([^"']*\b)?[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const full = m[0];
    if (full.includes(className)) {
      results.push(wrapTag(full, m[1]));
    }
  }
  return results;
}

function wrapTag(tagHtml, tag) {
  return new SwElement(tagHtml, tag);
}

export function extractLinks(html, pattern) {
  const links = [];
  const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!pattern || pattern.test(m[1])) {
      links.push({
        href: decodeHtmlEntities(m[1]),
        text: stripTags(m[2])
      });
    }
  }
  return links;
}

export function extractAllLinks(html) {
  return extractLinks(html, null);
}

export function extractTagText(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = html.match(re);
  return m ? stripTags(m[1]) : '';
}

export function extractFormFields(html) {
  const forms = [];
  const formRe = /<form\b[^>]*>([\s\S]*?)<\/form>/gi;
  let fm;
  while ((fm = formRe.exec(html)) !== null) {
    const formTag = fm[0].match(/<form\b[^>]*>/i)[0];
    const action = extractAttr(formTag, 'action') || '';
    const method = (extractAttr(formTag, 'method') || 'get').toLowerCase();
    const fields = {};
    const inner = fm[1];

    const inputRe = /<(?:input|textarea|select)\b[^>]*>/gi;
    let im;
    while ((im = inputRe.exec(inner)) !== null) {
      const tag = im[0];
      const name = extractAttr(tag, 'name');
      if (!name) continue;
      const type = (extractAttr(tag, 'type') || '').toLowerCase();

      if (type === 'submit' || type === 'button' || type === 'image') continue;

      if (tag.startsWith('<textarea')) {
        const block = inner.slice(im.index, im.index + 2000);
        const textMatch = block.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
        fields[name] = textMatch ? decodeHtmlEntities(textMatch[1]) : '';
      } else if (tag.startsWith('<select')) {
        const block = inner.slice(im.index, im.index + 3000);
        const selectBlock = block.match(/<select[^>]*>([\s\S]*?)<\/select>/i);
        if (selectBlock) {
          const selected = selectBlock[1].match(/<option[^>]*selected[^>]*value\s*=\s*["']([^"']*)["']/i) ||
            selectBlock[1].match(/<option[^>]*value\s*=\s*["']([^"']*)["'][^>]*selected/i) ||
            selectBlock[1].match(/<option[^>]*value\s*=\s*["']([^"']*)["']/i);
          fields[name] = selected ? decodeHtmlEntities(selected[1]) : '';
        }
      } else if (type === 'checkbox' || type === 'radio') {
        if (/\bchecked\b/i.test(tag)) {
          fields[name] = extractAttr(tag, 'value') || '1';
        }
      } else {
        fields[name] = extractAttr(tag, 'value') || '';
      }
    }

    forms.push({ action, method, fields, formHtml: fm[0] });
  }
  return forms;
}

export function extractBlockByClass(html, classFragment) {
  const re = new RegExp(
    `<([a-z][a-z0-9]*)\\b[^>]*class\\s*=\\s*["'][^"']*${classFragment}[^"']*["'][^>]*>([\\s\\S]*?)</\\1>`,
    'i'
  );
  const m = html.match(re);
  return m ? stripTags(m[2]) : '';
}
