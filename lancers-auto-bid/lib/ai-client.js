import { callClaudeApi } from './claude-api.js';

export async function callAI(settings, prompt, options = {}) {
  const maxTokens = options.maxTokens || 4096;
  const useFast = options.fast !== false;

  if (settings.aiProvider === 'openai' && settings.openaiApiKey) {
    const model = useFast ? 'gpt-4o-mini' : 'gpt-4o';
    return callOpenAI(settings.openaiApiKey, prompt, maxTokens, model);
  }
  if (settings.claudeApiKey) {
    return callClaudeApi(settings.claudeApiKey, prompt, maxTokens, useFast);
  }
  if (settings.openaiApiKey) {
    const model = useFast ? 'gpt-4o-mini' : 'gpt-4o';
    return callOpenAI(settings.openaiApiKey, prompt, maxTokens, model);
  }
  throw new Error('APIキーが設定されていません');
}

export async function callAIWithProvider(settings, provider, prompt, options = {}) {
  const maxTokens = options.maxTokens || 4096;
  const useFast = options.fast !== false;

  if (provider === 'openai') {
    if (!settings.openaiApiKey) throw new Error('OpenAI APIキーが設定されていません');
    const model = useFast ? 'gpt-4o-mini' : 'gpt-4o';
    return callOpenAI(settings.openaiApiKey, prompt, maxTokens, model);
  }
  if (provider === 'claude') {
    if (!settings.claudeApiKey) throw new Error('Claude APIキーが設定されていません');
    return callClaudeApi(settings.claudeApiKey, prompt, maxTokens, useFast);
  }
  throw new Error(`不明なAIプロバイダー: ${provider}`);
}

async function callOpenAI(apiKey, prompt, maxTokens, model) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

export function parseJsonFromResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch { /* ignore */ }
  return null;
}
