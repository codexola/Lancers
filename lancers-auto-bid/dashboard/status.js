import {
  $, $$, sendMessage, escapeHtml, showToast,
  updateConnectionUI, getStatusLabel, loadSettingsFromBg
} from './common.js';

let currentFilter = 'all';
let settings = null;
let refreshTimer = null;
let activeProjectId = null;

const PHASE_LABELS = {
  idle: '待機中',
  polling: '検索中',
  filtering: 'フィルタリング',
  processing: '処理中',
  analyzing: 'AI分析中',
  bidding: '入札送信中',
  error: 'エラー'
};

async function init() {
  settings = await loadSettingsFromBg();
  try {
    const data = await sendMessage('getStatus');
    if (data && !data.error) {
      settings = mergeStatusData(settings, data);
    }
  } catch { /* ignore */ }
  refreshUI(settings);
  await refreshConnections();
  startRefreshLoop();
  listenStorageChanges();
}

function mergeStatusData(base, data) {
  return {
    ...base,
    isRunning: data.isRunning ?? base.isRunning,
    isProcessing: data.isProcessing ?? base.isProcessing,
    stopRequested: data.stopRequested ?? base.stopRequested,
    runtimeStatus: data.runtimeStatus || base.runtimeStatus,
    tasksLog: data.tasksLog || base.tasksLog || [],
    projects: data.projects ?? base.projects ?? [],
    connectionStatus: data.connectionStatus || base.connectionStatus,
    lastPollError: data.lastPollError ?? base.lastPollError,
    lastPollTime: data.lastPollTime ?? base.lastPollTime
  };
}

function listenStorageChanges() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    refreshAll();
  });
}

function startRefreshLoop() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshAll, 1000);
}

function refreshUI(s) {
  updateStatusUI(s.isRunning, s.isProcessing, s.stopRequested);
  activeProjectId = s.runtimeStatus?.currentProjectId || null;
  updateStats(s.projects || []);
  renderProjects(s.projects || [], activeProjectId);
  updateConnectionUI(s.connectionStatus);
  updatePollError(s.lastPollError);
  updateRuntimeStatus(s.runtimeStatus);
  renderActivityLog(s.tasksLog || []);
  $('#lastPoll').textContent = s.lastPollTime
    ? new Date(s.lastPollTime).toLocaleString('ja-JP')
    : '-';
}

function updateRuntimeStatus(rs) {
  if (!rs) return;
  const phase = rs.phase || 'idle';
  const terminal = $('#cmdTerminal');
  terminal.className = `cmd-terminal phase-${phase}`;
  $('#runtimePhase').textContent = PHASE_LABELS[phase] || phase;

  let message = rs.message || '—';
  if (rs.currentProjectTitle && !message.includes(rs.currentProjectTitle)) {
    message = `${message} — ${rs.currentProjectTitle}`;
  }
  $('#runtimeMessage').textContent = message;
}

function renderActivityLog(tasksLog) {
  const el = $('#activityLog');
  if (!tasksLog.length) {
    el.innerHTML = '<div class="cmd-line cmd-empty">アクティビティログはここに表示されます</div>';
    return;
  }
  el.innerHTML = tasksLog.slice(0, 50).map(item => {
    const time = item.timestamp
      ? new Date(item.timestamp).toLocaleTimeString('ja-JP')
      : '';
    const type = item.type || 'system';
    const msg = item.title
      ? `[${item.title.substring(0, 36)}] ${item.message || ''}`
      : (item.message || '');
    return `
      <div class="cmd-line type-${type}">
        <span class="cmd-prompt">C:\\Lancers&gt;</span>
        <span class="cmd-time">[${time}]</span>
        <span class="cmd-text">${escapeHtml(msg)}</span>
      </div>`;
  }).join('');
  el.scrollTop = 0;
}

function updateStatusUI(isRunning, isProcessing = false, stopRequested = false) {
  const badge = $('#statusBadge');
  if (stopRequested && isProcessing) {
    badge.textContent = '停止中...';
    badge.classList.remove('running');
  } else {
    badge.textContent = isRunning ? '実行中' : '停止中';
    badge.classList.toggle('running', isRunning);
  }
  $('#startBtn').disabled = isRunning || (stopRequested && isProcessing);
  $('#stopBtn').disabled = !isRunning && !isProcessing;
}

function updatePollError(msg) {
  const el = $('#pollError');
  if (msg) {
    el.textContent = msg;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function updateStats(projects) {
  $('#totalProjects').textContent = projects.length;
  $('#bidCount').textContent = projects.filter(p => p.bidSubmitted).length;
  $('#skipCount').textContent = projects.filter(p => p.status === 'skipped').length;
  $('#errorCount').textContent = projects.filter(p => p.status === 'error').length;
}

function renderProjects(projects, activeId) {
  const list = $('#projectsList');
  let filtered = projects;

  if (currentFilter !== 'all') {
    filtered = projects.filter(p => p.status === currentFilter);
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state">該当する案件がありません。</div>';
    return;
  }

  list.innerHTML = filtered.map(p => {
    const isActive = activeId && p.id === activeId;
    return `
    <div class="project-item${isActive ? ' active-project' : ''}" data-id="${p.id}">
      <div class="project-status ${p.status}"></div>
      <div class="project-info">
        <div class="project-title">${escapeHtml(p.title || 'タイトル不明')}</div>
        <div class="project-meta">
          ${p.proposalCount != null ? `提案数: ${p.proposalCount}件 · ` : ''}
          ${p.budget ? escapeHtml(p.budget) + ' · ' : ''}
          ${p.processedAt || p.detectedAt ? new Date(p.processedAt || p.detectedAt).toLocaleString('ja-JP') : ''}
          ${p.bidAmount ? ' · ¥' + p.bidAmount.toLocaleString() : ''}
          ${p.bidDurationMs ? ' · ' + (p.bidDurationMs / 1000).toFixed(1) + 's' : ''}
          ${p.bidFormatName ? ' · ' + escapeHtml(p.bidFormatName) : ''}
          ${p.bidCount > 1 ? ` · 入札${p.bidCount}回` : ''}
          ${p.bidMilestonesCompleted?.length ? ' · M:' + p.bidMilestonesCompleted.join(',') : ''}
        </div>
      </div>
      <span class="project-badge ${p.status}">${getStatusLabel(p.status)}</span>
    </div>`;
  }).join('');

  list.querySelectorAll('.project-item').forEach(item => {
    item.addEventListener('click', () => {
      const project = projects.find(p => p.id === item.dataset.id);
      if (project) showProjectModal(project);
    });
  });
}

function showProjectModal(project) {
  $('#modalTitle').textContent = project.title || '案件詳細';
  const body = $('#modalBody');

  let html = `
    <div class="detail-row">
      <div class="detail-label">URL</div>
      <div class="detail-value"><a href="${project.url}" target="_blank">${project.url}</a></div>
    </div>
    <div class="detail-row">
      <div class="detail-label">提案数</div>
      <div class="detail-value">${project.proposalCount != null ? project.proposalCount + '件' : '不明'}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">予算</div>
      <div class="detail-value">${escapeHtml(project.budget || '不明')}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">ステータス</div>
      <div class="detail-value">${getStatusLabel(project.status)}</div>
    </div>
  `;

  if (project.bidSubmitted && project.bidDocument) {
    html += `
      <div class="detail-row">
        <div class="detail-label">入札金額</div>
        <div class="detail-value">¥${(project.bidAmount || 0).toLocaleString()}（税抜）</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">提案文</div>
        <div class="bid-document">${escapeHtml(project.bidDocument)}</div>
      </div>
    `;
  } else if (project.skipReason) {
    html += `
      <div class="detail-row">
        <div class="detail-label">入札しなかった理由</div>
        <div class="skip-reason">${escapeHtml(project.skipReason)}</div>
      </div>
    `;
  }

  if (project.description) {
    html += `
      <div class="detail-row">
        <div class="detail-label">案件説明</div>
        <div class="detail-value">${escapeHtml(project.description.substring(0, 1000))}${project.description.length > 1000 ? '...' : ''}</div>
      </div>
    `;
  }

  body.innerHTML = html;
  $('#modalOverlay').classList.add('active');
}

async function refreshConnections() {
  try {
    const status = await sendMessage('checkConnections');
    updateConnectionUI(status);
  } catch (err) {
    showToast(`接続確認失敗: ${err.message || err.error || ''}`, 'error');
  }
}

async function refreshAll() {
  try {
    const data = await sendMessage('getStatus');
    if (data?.error) return;
    settings = mergeStatusData(settings || await loadSettingsFromBg(), data);
    refreshUI(settings);
  } catch { /* background may be restarting */ }
}

$('#startBtn').addEventListener('click', async () => {
  $('#startBtn').disabled = true;
  await sendMessage('start');
  settings.isRunning = true;
  settings.stopRequested = false;
  updateStatusUI(true);
  showToast('監視を開始しました');
  setTimeout(refreshAll, 500);
});

$('#stopBtn').addEventListener('click', async () => {
  $('#stopBtn').disabled = true;
  updateStatusUI(false, true, true);
  showToast('停止中... 進行中の入札を中断します');
  await sendMessage('stop');
  settings.isRunning = false;
  settings.stopRequested = true;
  updateStatusUI(false);
  showToast('監視を停止しました');
  refreshAll();
});

$('#exportBtn').addEventListener('click', async () => {
  const data = await sendMessage('exportData');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lancers-auto-bid-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$('#refreshConnBtn').addEventListener('click', refreshConnections);

$('#clearLogBtn').addEventListener('click', async () => {
  await sendMessage('clearDashboardLog');
  showToast('表示ログをクリアしました（データは保存されています）');
  refreshAll();
});

$$('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    if (settings) renderProjects(settings.projects || [], activeProjectId);
  });
});

$('#modalClose').addEventListener('click', () => {
  $('#modalOverlay').classList.remove('active');
});

$('#modalOverlay').addEventListener('click', (e) => {
  if (e.target === $('#modalOverlay')) {
    $('#modalOverlay').classList.remove('active');
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'dashboardUpdate') {
    refreshAll();
  }
});

init();
