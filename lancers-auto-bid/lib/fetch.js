export async function getLancersCookieHeader() {
  const cookies = await chrome.cookies.getAll({ domain: 'lancers.jp' });
  const wwwCookies = await chrome.cookies.getAll({ domain: 'www.lancers.jp' });
  const all = [...cookies, ...wwwCookies];
  const seen = new Set();
  const parts = [];
  for (const c of all) {
    if (!seen.has(c.name)) {
      seen.add(c.name);
      parts.push(`${c.name}=${c.value}`);
    }
  }
  return parts.join('; ');
}

export async function fetchPageHtml(url) {
  const cookieHeader = await getLancersCookieHeader();

  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Cache-Control': 'no-cache',
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    }
  });

  if (!res.ok) {
    throw new Error(`ページ取得失敗: ${res.status} ${url}`);
  }

  const html = await res.text();
  return html;
}

export function isLoginPage(html) {
  if (html.includes('/work/detail/') || html.includes('work/search') ||
      html.includes('p-work-detail') || html.includes('c-media__title') ||
      html.includes('依頼詳細') || html.includes('p-search-job')) {
    return false;
  }
  return /user\/login|ログイン\s*<\//i.test(html) ||
    (html.includes('ログイン') && html.includes('password') && !html.includes('work'));
}

export function isLoggedInHtml(html) {
  return !isLoginPage(html) && (
    html.includes('/work/detail/') ||
    html.includes('work/search') ||
    html.includes('マイページ') ||
    html.includes('p-search-job')
  );
}
