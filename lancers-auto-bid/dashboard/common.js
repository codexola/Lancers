export async function sendMessage(action, data = {}) {
  return chrome.runtime.sendMessage({ action, ...data });
}

export function $(sel) {
  return document.querySelector(sel);
}

export function $$(sel) {
  return document.querySelectorAll(sel);
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

export function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.textContent = message;
  const bg = type === 'error' ? '#f87171' : '#34d399';
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; padding: 12px 24px;
    background: ${bg}; color: #1a1d27; border-radius: 8px; font-weight: 600;
    font-size: 0.875rem; z-index: 9999;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

export function updateConnectionUI(status) {
  if (!status) return;

  const map = {
    lancers: '#connLancers',
    claude: '#connClaude',
    openai: '#connOpenai'
  };

  for (const [key, selector] of Object.entries(map)) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const info = status[key] || {};
    const light = el.querySelector('.connection-light');
    const text = el.querySelector('.connection-status-text');

    if (info.connected) {
      light.classList.add('connected');
      light.classList.remove('disconnected');
      text.textContent = 'Connected';
      text.classList.add('connected-text');
    } else {
      light.classList.remove('connected');
      light.classList.add('disconnected');
      text.textContent = info.message || 'Disconnected';
      text.classList.remove('connected-text');
    }
  }
}

export function getStatusLabel(status) {
  const labels = {
    detected: '検出',
    bid_submitted: '入札済み',
    skipped: 'スキップ',
    error: 'エラー',
    processing: '処理中',
    bidding: '入札中'
  };
  return labels[status] || status;
}

export function getPhaseLabel(phase) {
  const labels = {
    idle: '待機中',
    polling: '検索中',
    filtering: 'フィルタリング',
    processing: '処理中',
    analyzing: 'AI分析中',
    bidding: '入札送信中',
    error: 'エラー'
  };
  return labels[phase] || phase;
}

export async function loadSettingsFromBg() {
  return sendMessage('getSettings');
}

export async function saveSettingsToBg(partial) {
  return sendMessage('saveSettings', { settings: partial });
}

export async function checkConnections(claudeApiKey, openaiApiKey) {
  return sendMessage('checkConnections', {
    claudeApiKey,
    openaiApiKey
  });
}
