const ERROR_PATTERNS = [
  { code: 'PROPOSE_BUTTON_MISSING', pattern: /提案するボタンが見つかりません/ },
  { code: 'FORM_LOAD_TIMEOUT', pattern: /提案フォームの読み込みタイムアウト/ },
  { code: 'PROPOSAL_FILL_FAILED', pattern: /提案文の入力に失敗/ },
  { code: 'CONFIRM_BUTTON_MISSING', pattern: /内容を確認する.*見つかりません/ },
  { code: 'CONFIRM_PAGE_TIMEOUT', pattern: /確認ページの読み込みタイムアウト/ },
  { code: 'SUBMIT_BUTTON_MISSING', pattern: /最終送信ボタンが見つかりません/ },
  { code: 'SUCCESS_PAGE_TIMEOUT', pattern: /提案完了画面の確認に失敗/ },
  { code: 'TAB_LOAD_TIMEOUT', pattern: /ページ読み込みタイムアウト/ },
  { code: 'CONTENT_SCRIPT_NO_RESPONSE', pattern: /コンテンツスクリプトから応答がありません/ },
  { code: 'MESSAGE_SEND_FAILED', pattern: /メッセージ送信失敗/ }
];

export function classifyBidError(errorMessage, pageType = 'unknown') {
  const msg = String(errorMessage || '');
  for (const { code, pattern } of ERROR_PATTERNS) {
    if (pattern.test(msg)) {
      return { errorCode: code, pageType: pageType || 'unknown' };
    }
  }
  return { errorCode: 'UNKNOWN', pageType: pageType || 'unknown' };
}

export function buildErrorFingerprint(errorCode, pageType) {
  return `${errorCode}:${pageType}`;
}

export function findMatchingSolution(errorSolutions, fingerprint, errorCode) {
  if (!errorSolutions || typeof errorSolutions !== 'object') return null;

  if (errorSolutions[fingerprint]) {
    return { key: fingerprint, solution: errorSolutions[fingerprint] };
  }

  const prefix = `${errorCode}:`;
  const matches = Object.entries(errorSolutions)
    .filter(([key]) => key.startsWith(prefix))
    .sort((a, b) => {
      const aCount = a[1].successCount || 0;
      const bCount = b[1].successCount || 0;
      return bCount - aCount;
    });

  if (matches.length > 0) {
    const [key, solution] = matches[0];
    return { key, solution };
  }

  return null;
}

export function normalizeFix(fix) {
  if (!fix || typeof fix !== 'object') return null;

  const action = fix.action;
  const validActions = [
    'wait', 'scroll', 'clickByText', 'clickSelector',
    'scrollAndClick', 'checkNda', 'reload', 'refillForm'
  ];
  if (!validActions.includes(action)) return null;

  return {
    action,
    buttonTexts: Array.isArray(fix.buttonTexts) ? fix.buttonTexts.slice(0, 5) : undefined,
    selector: typeof fix.selector === 'string' ? fix.selector.slice(0, 200) : undefined,
    waitMs: typeof fix.waitMs === 'number' ? Math.min(fix.waitMs, 15000) : undefined,
    scrollTo: ['top', 'bottom'].includes(fix.scrollTo) ? fix.scrollTo : undefined,
    extraWaitBefore: typeof fix.extraWaitBefore === 'number'
      ? Math.min(fix.extraWaitBefore, 10000) : undefined
  };
}
