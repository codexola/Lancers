import { fetchPageHtml, isLoggedInHtml, isLoginPage, getLancersCookieHeader } from './fetch.js';
import { testClaudeConnection } from './claude-api.js';

export async function checkLancersLogin() {
  try {
    const cookieHeader = await getLancersCookieHeader();
    if (!cookieHeader) {
      return { connected: false, message: 'Not logged in' };
    }

    const html = await fetchPageHtml('https://www.lancers.jp/mypage');
    if (isLoginPage(html)) {
      return { connected: false, message: 'Not logged in' };
    }

    const searchHtml = await fetchPageHtml(
      'https://www.lancers.jp/work/search/system?open=1'
    );
    if (isLoggedInHtml(searchHtml)) {
      return { connected: true, message: 'Connected' };
    }

    return { connected: false, message: 'Session expired' };
  } catch (err) {
    return { connected: false, message: err.message };
  }
}

export async function checkClaudeApi(apiKey) {
  return testClaudeConnection(apiKey);
}

export async function checkOpenAIApi(apiKey) {
  if (!apiKey?.trim()) {
    return { connected: false, message: 'No API key' };
  }
  const key = apiKey.trim();
  if (!key.startsWith('sk-')) {
    return { connected: false, message: 'OpenAI APIキーの形式が正しくありません' };
  }
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` }
    });
    if (res.ok) {
      return { connected: true, message: 'Connected' };
    }
    if (res.status === 401) {
      return { connected: false, message: 'APIキーが無効です' };
    }
    const err = await res.text();
    return { connected: false, message: `Error ${res.status}: ${err.substring(0, 100)}` };
  } catch (err) {
    return { connected: false, message: err.message };
  }
}

export async function checkAllConnections(settings) {
  const [lancers, claude, openai] = await Promise.all([
    checkLancersLogin(),
    checkClaudeApi(settings.claudeApiKey),
    checkOpenAIApi(settings.openaiApiKey)
  ]);

  return {
    lancers: { ...lancers, checkedAt: new Date().toISOString() },
    claude: { ...claude, checkedAt: new Date().toISOString() },
    openai: { ...openai, checkedAt: new Date().toISOString() }
  };
}
