import {
  $, showToast, loadSettingsFromBg, saveSettingsToBg,
  checkConnections, updateConnectionUI, sendMessage
} from './common.js';

async function init() {
  const settings = await loadSettingsFromBg();
  populateForm(settings);
  if (settings.connectionStatus) {
    updateConnectionUI(settings.connectionStatus);
  }
}

function populateForm(s) {
  $('#aiProvider').value = s.aiProvider || 'claude';
  $('#claudeApiKey').value = s.claudeApiKey || '';
  $('#openaiApiKey').value = s.openaiApiKey || '';
  $('#bidPrompt').value = s.bidPrompt || '';
  $('#portfolioLinks').value = s.portfolioLinks || '';
  $('#maxProposalCount').value = s.maxProposalCount || 50;
}

function showTestResult(message, success) {
  const el = $('#apiTestResult');
  el.textContent = message;
  el.hidden = false;
  el.className = 'api-test-result ' + (success ? 'success' : 'error');
}

async function saveAll() {
  const settings = {
    aiProvider: $('#aiProvider').value,
    claudeApiKey: $('#claudeApiKey').value.trim(),
    openaiApiKey: $('#openaiApiKey').value.trim(),
    bidPrompt: $('#bidPrompt').value,
    portfolioLinks: $('#portfolioLinks').value,
    maxProposalCount: parseInt($('#maxProposalCount').value, 10) || 50
  };
  await saveSettingsToBg(settings);
  showToast('設定を保存しました');
  return settings;
}

$('#saveAllBtn').addEventListener('click', saveAll);

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
