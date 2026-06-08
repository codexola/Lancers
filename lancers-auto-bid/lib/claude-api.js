export const CLAUDE_API_VERSION = '2023-06-01';

export const CLAUDE_MODELS_FAST = [
  'claude-3-5-haiku-latest',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
  'claude-sonnet-4-20250514'
];

export const CLAUDE_MODELS_FULL = [
  'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-latest'
];

function claudeHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey.trim(),
    'anthropic-version': CLAUDE_API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true'
  };
}

export function parseAnthropicError(text) {
  try {
    const data = JSON.parse(text);
    return data?.error?.message || data?.message || text;
  } catch {
    return text;
  }
}

export async function testClaudeConnection(apiKey) {
  const key = apiKey?.trim();
  if (!key) {
    return { connected: false, message: 'APIキーが未入力です' };
  }
  if (!key.startsWith('sk-ant-')) {
    return { connected: false, message: 'Claude APIキーの形式が正しくありません（sk-ant-で始まる必要があります）' };
  }

  try {
    const modelsRes = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: claudeHeaders(key)
    });

    if (modelsRes.ok) {
      return { connected: true, message: 'Connected' };
    }

    if (modelsRes.status === 401 || modelsRes.status === 403) {
      return { connected: false, message: 'APIキーが無効です' };
    }
  } catch (err) {
    return { connected: false, message: `ネットワークエラー: ${err.message}` };
  }

  for (const model of CLAUDE_MODELS_FAST) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: claudeHeaders(key),
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'test' }]
        })
      });

      if (res.ok) {
        return { connected: true, message: 'Connected', model };
      }

      const errText = await res.text();
      const errMsg = parseAnthropicError(errText);

      if (res.status === 401 || res.status === 403) {
        return { connected: false, message: 'APIキーが無効です' };
      }

      if (res.status === 404 || errMsg.includes('model')) {
        continue;
      }

      return { connected: false, message: errMsg.substring(0, 120) };
    } catch (err) {
      return { connected: false, message: err.message };
    }
  }

  return { connected: false, message: '利用可能なClaudeモデルが見つかりませんでした' };
}

export async function callClaudeApi(apiKey, prompt, maxTokens, preferFast = true) {
  const key = apiKey.trim();
  const models = preferFast ? CLAUDE_MODELS_FAST : CLAUDE_MODELS_FULL;
  let lastError = '';

  for (const model of models) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: claudeHeaders(key),
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (res.ok) {
      const data = await res.json();
      return data.content[0].text;
    }

    const errText = await res.text();
    lastError = parseAnthropicError(errText);

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Claude API error: ${res.status} - ${lastError}`);
    }

    if (res.status === 404 || lastError.includes('model')) {
      continue;
    }

    throw new Error(`Claude API error: ${res.status} - ${lastError}`);
  }

  throw new Error(`Claude API error: すべてのモデルで失敗 - ${lastError}`);
}
