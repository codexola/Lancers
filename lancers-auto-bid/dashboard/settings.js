import {
  $, showToast, loadSettingsFromBg, saveSettingsToBg,
  checkConnections, updateConnectionUI, sendMessage
} from './common.js';

let saveTimer = null;
let isDirty = false;

async function init() {
  const settings = await loadSettingsFromBg();
  populateForm(settings);
  if (settings.connectionStatus) {
    updateConnectionUI(settings.connectionStatus);
  }
  setupAutoSave();
}

function populateForm(s) {
  $('#aiProvider').value = s.aiProvider || 'claude';
  $('#claudeApiKey').value = s.claudeApiKey || '';
  $('#openaiApiKey').value = s.openaiApiKey || '';
  $('#bidPrompt').value = s.bidPrompt || '';
  $('#analysisPrompt').value = s.analysisPrompt || '';
  $('#portfolioLinks').value = s.portfolioLinks || '';
  $('#sampleBids').value = s.sampleBids || '';
  $('#maxProposalCount').value = s.maxProposalCount || 40;
}

function showTestResult(message, success) {
  const el = $('#apiTestResult');
  el.textContent = message;
  el.hidden = false;
  el.className = 'api-test-result ' + (success ? 'success' : 'error');
}

function updateSaveIndicator(state) {
  const el = $('#saveIndicator');
  if (state === 'saving') {
    el.textContent = '保存中...';
    el.className = 'save-indicator saving';
  } else if (state === 'dirty') {
    el.textContent = '未保存';
    el.className = 'save-indicator dirty';
  } else {
    el.textContent = '保存済み';
    el.className = 'save-indicator saved';
  }
}

function collectFormSettings() {
  return {
    aiProvider: $('#aiProvider').value,
    claudeApiKey: $('#claudeApiKey').value.trim(),
    openaiApiKey: $('#openaiApiKey').value.trim(),
    bidPrompt: $('#bidPrompt').value,
    analysisPrompt: $('#analysisPrompt').value,
    portfolioLinks: $('#portfolioLinks').value,
    sampleBids: $('#sampleBids').value,
    maxProposalCount: parseInt($('#maxProposalCount').value, 10) || 40
  };
}

async function saveAll() {
  updateSaveIndicator('saving');
  const settings = collectFormSettings();
  await saveSettingsToBg(settings);
  isDirty = false;
  updateSaveIndicator('saved');
  return settings;
}

function scheduleAutoSave() {
  isDirty = true;
  updateSaveIndicator('dirty');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await saveAll();
      showToast('設定を自動保存しました');
    } catch {
      updateSaveIndicator('dirty');
    }
  }, 800);
}

function setupAutoSave() {
  const fields = [
    '#aiProvider', '#claudeApiKey', '#openaiApiKey',
    '#bidPrompt', '#analysisPrompt', '#portfolioLinks',
    '#sampleBids', '#maxProposalCount'
  ];
  for (const sel of fields) {
    const el = $(sel);
    if (!el) continue;
    el.addEventListener('input', scheduleAutoSave);
    el.addEventListener('change', scheduleAutoSave);
  }
}

$('#saveAllBtn').addEventListener('click', async () => {
  await saveAll();
  showToast('設定を保存しました');
});

$('#testClaudeBtn').addEventListener('click', async () => {
  const key = $('#claudeApiKey').value.trim();
  if (!key) {
    showToast('Claude APIキーを入力してください', 'error');
    return;
  }

  await saveAll();
  showTestResult('Claude API接続をテスト中...', true);
  $('#testClaudeBtn').disabled = true;

  try {
    const result = await sendMessage('testClaudeApi', { apiKey: key });
    if (result?.error) throw new Error(result.error);

    const current = await loadSettingsFromBg();
    updateConnectionUI({
      ...(current.connectionStatus || {}),
      claude: result
    });

    if (result.connected) {
      showTestResult('Claude API: Connected', true);
      showToast('Claude API: Connected');
    } else {
      showTestResult(`Claude API: ${result.message}`, false);
      showToast(`接続失敗: ${result.message}`, 'error');
    }
  } catch (err) {
    showTestResult(`エラー: ${err.message || err.error || '不明'}`, false);
    showToast('接続テストに失敗しました', 'error');
  } finally {
    $('#testClaudeBtn').disabled = false;
  }
});

$('#testApiBtn').addEventListener('click', async () => {
  const settings = await saveAll();
  showTestResult('すべての接続をテスト中...', true);
  $('#testApiBtn').disabled = true;

  try {
    const status = await sendMessage('checkConnections', {
      claudeApiKey: settings.claudeApiKey,
      openaiApiKey: settings.openaiApiKey
    });
    updateConnectionUI(status);

    const provider = settings.aiProvider;
    const keyOk = provider === 'claude' ? status.claude?.connected : status.openai?.connected;
    const keyName = provider === 'claude' ? 'Claude' : 'OpenAI';
    const keyStatus = provider === 'claude' ? status.claude : status.openai;

    if (keyOk) {
      showTestResult(`${keyName} API: Connected / Lancers: ${status.lancers?.connected ? 'Connected' : status.lancers?.message}`, true);
      showToast(`${keyName} API: Connected`);
    } else {
      showTestResult(`${keyName} API: ${keyStatus?.message || '接続失敗'}`, false);
      showToast(`${keyName} API: ${keyStatus?.message || '接続失敗'}`, 'error');
    }
  } catch (err) {
    showTestResult(`エラー: ${err.message || err.error || '不明'}`, false);
    showToast('接続テストに失敗しました', 'error');
  } finally {
    $('#testApiBtn').disabled = false;
  }
});

init();
