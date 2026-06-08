import { callAI, parseJsonFromResponse } from './ai-client.js';
import {
  classifyBidError,
  buildErrorFingerprint,
  normalizeFix
} from './error-solutions.js';
import {
  getErrorSolution,
  saveErrorSolution,
  incrementSolutionUsage
} from './storage.js';
import { assertRunning } from './run-control.js';

const RESOLUTION_PROMPT = `あなたはLancers.jpの入札フォーム自動操作のエラー解決AIです。
入札DOM操作でエラーが発生しました。ページ診断情報を分析し、修復アクションをJSONで返してください。

## 利用可能なアクション (action)
- "wait" — ページ読み込み待機 (waitMs 必須)
- "scroll" — ページスクロール (scrollTo: "top"|"bottom")
- "clickByText" — ボタンをテキストでクリック (buttonTexts 必須)
- "clickSelector" — CSSセレクタでクリック (selector 必須)
- "scrollAndClick" — 下にスクロールしてからボタンクリック (buttonTexts 必須)
- "checkNda" — 秘密保持契約チェックボックスをチェック
- "reload" — ページをリロード
- "refillForm" — フォームを再入力

## 出力形式（JSONのみ）
{
  "action": "wait|scroll|clickByText|clickSelector|scrollAndClick|checkNda|reload|refillForm",
  "buttonTexts": ["ボタン文言1", "ボタン文言2"],
  "selector": "CSSセレクタ（任意）",
  "waitMs": 2000,
  "scrollTo": "top|bottom",
  "extraWaitBefore": 1000,
  "explanation": "なぜこの修復が有効か（日本語）"
}`;

function getProviderOrder(settings) {
  const primary = settings.aiProvider === 'openai' ? 'openai' : 'claude';
  const secondary = primary === 'openai' ? 'claude' : 'openai';
  const order = [];

  if (primary === 'openai' && settings.openaiApiKey) order.push('openai');
  if (primary === 'claude' && settings.claudeApiKey) order.push('claude');
  if (secondary === 'openai' && settings.openaiApiKey && !order.includes('openai')) {
    order.push('openai');
  }
  if (secondary === 'claude' && settings.claudeApiKey && !order.includes('claude')) {
    order.push('claude');
  }
  return order;
}

function buildResolutionPrompt(context) {
  const tried = context.triedFixes?.length
    ? context.triedFixes.map(t => `- ${t.action}: ${t.explanation || t.source || ''}`).join('\n')
    : '（なし）';

  return `${RESOLUTION_PROMPT}

## エラー情報
- エラーコード: ${context.errorCode}
- エラーメッセージ: ${context.errorMessage}
- ページ種別: ${context.pageType}
- 試行回数: ${context.attempt + 1}

## ページ診断
- URL: ${context.diagnostics?.url || '不明'}
- 表示ボタン: ${(context.diagnostics?.buttons || []).slice(0, 15).join(', ') || 'なし'}
- テキストエリア: ${context.diagnostics?.hasTextarea ? 'あり' : 'なし'}
- 提案文フィールド: ${context.diagnostics?.hasProposalField ? 'あり' : 'なし'}
- 金額フィールド: ${context.diagnostics?.hasAmountField ? 'あり' : 'なし'}
- 日付フィールド: ${context.diagnostics?.hasDateField ? 'あり' : 'なし'}
- NDA未チェック: ${context.diagnostics?.ndaUnchecked ? 'はい' : 'いいえ'}

## 既に試した修復（重複禁止）
${tried}`;
}

async function resolveWithProvider(settings, provider, context) {
  const providerSettings = { ...settings, aiProvider: provider };
  const prompt = buildResolutionPrompt(context);
  const response = await callAI(providerSettings, prompt, { maxTokens: 1024, fast: true });
  const parsed = parseJsonFromResponse(response);
  const fix = normalizeFix(parsed);
  if (!fix) return null;

  return {
    fix,
    explanation: parsed.explanation || '',
    source: provider
  };
}

async function resolveWithAI(settings, context) {
  const providers = getProviderOrder(settings);
  if (providers.length === 0) return null;

  for (const provider of providers) {
    try {
      const result = await resolveWithProvider(settings, provider, context);
      if (result) return result;
    } catch (err) {
      console.warn(`Error resolution via ${provider} failed:`, err.message);
    }
  }
  return null;
}

/**
 * Look up cached solution first; if none, resolve via Claude/OpenAI.
 * Returns { fingerprint, fix, source, explanation, fromCache }
 */
export async function resolveBiddingError(context, settings) {
  await assertRunning().catch(() => { throw new Error('入札が停止されました'); });

  const { errorCode, pageType } = classifyBidError(
    context.errorMessage,
    context.diagnostics?.pageType || context.pageType
  );
  const fingerprint = buildErrorFingerprint(errorCode, pageType);

  const resolutionSettings = settings.errorResolutionSettings || {};
  if (resolutionSettings.enabled === false) return null;

  const triedKeys = new Set((context.triedFixes || []).map(t => t.fingerprint));

  if (resolutionSettings.lookupBeforeApi !== false) {
    const cached = await getErrorSolution(fingerprint, errorCode);
    if (cached && !triedKeys.has(cached.key)) {
      const fix = normalizeFix(cached.solution.fix);
      if (fix) {
        return {
          fingerprint: cached.key,
          fix,
          source: cached.solution.source || 'cached',
          explanation: cached.solution.explanation || '保存済みの解決策を適用',
          fromCache: true
        };
      }
    }
  }

  const aiResult = await resolveWithAI(settings, {
    ...context,
    errorCode,
    pageType
  });

  if (!aiResult) return null;

  return {
    fingerprint,
    fix: aiResult.fix,
    source: aiResult.source,
    explanation: aiResult.explanation,
    fromCache: false
  };
}

export async function recordSolutionSuccess(fingerprint, fix, source, explanation) {
  await saveErrorSolution(fingerprint, { fix, source, explanation });
  await incrementSolutionUsage(fingerprint, true);
}

export async function recordSolutionFailure(fingerprint) {
  if (fingerprint) await incrementSolutionUsage(fingerprint, false);
}
