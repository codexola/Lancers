import {
  SEARCH_URLS,
  POLL_INTERVAL_ACTIVE_MS,
  POLL_INTERVAL_IDLE_MS,
  IDLE_THRESHOLD_MS
} from '../lib/constants.js';
import {
  getSettings,
  saveSettings,
  addProject,
  updateProject,
  addTaskLog,
  exportAllData,
  clearDashboardLog,
  filterVisibleTasksLog
} from '../lib/storage.js';
import { updateRuntime, notifyDashboardUpdate } from '../lib/runtime.js';
import {
  armRun, requestStop, assertRunning, StopError, isStopRequested
} from '../lib/run-control.js';
import { shouldProcessProject, evaluateBidEligibility, buildBidRecord, getBidCount, markMilestonesThroughCount } from '../lib/bid-schedule.js';
import { analyzeAndGenerateBid } from '../lib/ai.js';
import { fetchAndScrapeSearch, fetchAndScrapeDetail } from '../lib/page-loader.js';
import { checkAllConnections } from '../lib/connection.js';
import { testClaudeConnection } from '../lib/claude-api.js';
import { submitBid } from '../lib/bid-submitter.js';

const BID_TIME_TARGET_MS = 10000;
const ALARM_NAME = 'lancers-poll';
const processingIds = new Set();

let isProcessing = false;
let lastNewProjectTime = Date.now();

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  if (settings.isRunning) startPolling();
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  if (settings.isRunning) startPolling();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const settings = await getSettings();
  if (!settings.isRunning || isStopRequested()) return;
  try {
    await pollOnce();
  } catch (err) {
    console.error('Poll error:', err);
    await addTaskLog({ type: 'error', message: `ポーリングエラー: ${err.message}` });
  }
  const after = await getSettings();
  if (after.isRunning && !isStopRequested()) {
    scheduleNextPoll();
  }
});

chrome.action.onClicked.addListener(() => openDashboard('status.html'));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleBackgroundMessage(message).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleBackgroundMessage(message) {
  switch (message.action) {
    case 'start': {
      armRun();
      await saveSettings({ isRunning: true });
      await updateRuntime({ phase: 'polling', message: '監視を開始しました' });
      startPolling();
      await addTaskLog({ type: 'system', message: '自動入札を開始しました' });
      return { success: true };
    }
    case 'stop': {
      requestStop();
      await saveSettings({ isRunning: false });
      stopPolling();
      await updateRuntime({
        phase: 'idle',
        message: '停止しました',
        currentProjectId: null,
        currentProjectTitle: null
      });
      await addTaskLog({ type: 'system', message: '自動入札を停止しました（進行中の処理を中断）' });
      notifyDashboardUpdate();
      return { success: true };
    }
    case 'getStatus': {
      const settings = await getSettings();
      const visibleLog = filterVisibleTasksLog(
        settings.tasksLog,
        settings.dashboardLogClearAfter
      );
      return {
        isRunning: settings.isRunning,
        isProcessing,
        stopRequested: isStopRequested(),
        projectCount: settings.projects.length,
        projects: settings.projects,
        lastPollTime: settings.lastPollTime,
        connectionStatus: settings.connectionStatus,
        lastPollError: settings.lastPollError,
        runtimeStatus: settings.runtimeStatus,
        tasksLog: visibleLog.slice(0, 50)
      };
    }
    case 'getSettings':
      return await getSettings();
    case 'saveSettings':
      return await saveSettings(message.settings);
    case 'checkConnections': {
      const settings = await getSettings();
      const testSettings = {
        ...settings,
        claudeApiKey: message.claudeApiKey ?? settings.claudeApiKey,
        openaiApiKey: message.openaiApiKey ?? settings.openaiApiKey
      };
      const status = await checkAllConnections(testSettings);
      await saveSettings({ connectionStatus: status });
      notifyDashboardUpdate();
      return status;
    }
    case 'testClaudeApi': {
      const key = message.apiKey || (await getSettings()).claudeApiKey;
      const result = await testClaudeConnection(key);
      const settings = await getSettings();
      await saveSettings({
        connectionStatus: {
          ...settings.connectionStatus,
          claude: { ...result, checkedAt: new Date().toISOString() }
        }
      });
      notifyDashboardUpdate();
      return result;
    }
    case 'exportData':
      return await exportAllData();
    case 'clearDashboardLog':
      await clearDashboardLog();
      notifyDashboardUpdate();
      return { success: true };
    case 'bidProgress':
      await updateRuntime({
        phase: 'bidding',
        message: message.message || '入札処理中...',
        currentProjectId: message.projectId ?? undefined,
        currentProjectTitle: message.projectTitle ?? undefined
      });
      return { ok: true };
    default:
      return { error: 'Unknown action' };
  }
}

function startPolling() {
  stopPolling();
  armRun();
  pollOnce().catch(err => {
    if (err?.name !== 'StopError') console.error(err);
  });
  getSettings().then(s => {
    if (s.isRunning && !isStopRequested()) scheduleNextPoll(500);
  });
}

function stopPolling() {
  chrome.alarms.clear(ALARM_NAME);
}

function scheduleNextPoll(delayMs) {
  const interval = delayMs ?? getNextPollInterval();
  chrome.alarms.create(ALARM_NAME, { when: Date.now() + interval });
}

function getNextPollInterval() {
  const timeSinceLastNew = Date.now() - lastNewProjectTime;
  return timeSinceLastNew > IDLE_THRESHOLD_MS
    ? POLL_INTERVAL_IDLE_MS
    : POLL_INTERVAL_ACTIVE_MS;
}

function getSearchSource(url) {
  if (url.includes('/search/system')) return 'system';
  if (url.includes('/search/web')) return 'web';
  return 'unknown';
}

async function pollOnce() {
  const settings = await getSettings();
  if (!settings.isRunning || isStopRequested()) return;

  await updateRuntime({ phase: 'polling', message: '案件を検索中...' });
  await saveSettings({ lastPollTime: new Date().toISOString() });

  let allProjects = [];
  for (const url of SEARCH_URLS) {
    try {
      await assertRunning();
    } catch {
      return;
    }
    try {
      const { projects } = await fetchAndScrapeSearch(url);
      allProjects.push(...projects.map(p => ({
        ...p,
        searchSource: getSearchSource(url)
      })));
    } catch (err) {
      const msg = `検索ページ取得エラー: ${err.message}`;
      await saveSettings({ lastPollError: msg });
      await addTaskLog({ type: 'error', message: msg });
    }
  }

  allProjects = [...new Map(allProjects.map(p => [p.id, p])).values()];

  await updateRuntime({
    phase: 'filtering',
    message: `${allProjects.length}件の案件を検出`
  });

  for (const project of allProjects) {
    const existing = settings.projects.find(p => p.id === project.id);
    if (!existing) {
      await addProject({
        ...project,
        status: 'detected',
        bidSubmitted: false,
        bidCount: 0,
        bidMilestonesCompleted: [],
        bidHistory: [],
        detectedAt: new Date().toISOString()
      });
      notifyDashboardUpdate();
    } else if (project.proposalCount != null) {
      await updateProject(project.id, { proposalCount: project.proposalCount });
    }
  }

  let connectionStatus;
  try {
    connectionStatus = await checkAllConnections(settings);
    await saveSettings({ connectionStatus, lastPollError: null });
  } catch (err) {
    await saveSettings({ lastPollError: `接続確認エラー: ${err.message}` });
  }

  notifyDashboardUpdate();

  const freshSettings = await getSettings();
  if (!freshSettings.isRunning || isStopRequested()) {
    await updateRuntime({ phase: 'idle', message: '停止しました' });
    return;
  }

  const toProcess = allProjects.filter(p => {
    if (processingIds.has(p.id)) return false;
    return shouldProcessProject(p, freshSettings);
  });

  if (toProcess.length === 0) {
    await updateRuntime({ phase: 'idle', message: '新規案件なし — 監視継続中' });
    return;
  }

  if (isProcessing) return;

  if (connectionStatus && !connectionStatus.lancers.connected) {
    await saveSettings({
      lastPollError: 'Lancers.jpにログインしてください。'
    });
    await updateRuntime({ phase: 'error', message: 'Lancers未ログイン' });
    return;
  }

  const hasApiKey = freshSettings.aiProvider === 'openai'
    ? freshSettings.openaiApiKey
    : (freshSettings.claudeApiKey || freshSettings.openaiApiKey);
  if (!hasApiKey) {
    await saveSettings({ lastPollError: 'APIキーが未設定です。' });
    await updateRuntime({ phase: 'error', message: 'APIキー未設定' });
    return;
  }

  lastNewProjectTime = Date.now();
  await saveSettings({ lastNewProjectTime: new Date().toISOString() });

  for (const project of toProcess) {
    if (isProcessing) break;
    try {
      await assertRunning();
    } catch {
      break;
    }

    const existing = freshSettings.projects.find(p => p.id === project.id);
    const eligibility = evaluateBidEligibility(project, existing);

    await processNewProject(project, eligibility);
  }

  if (!isProcessing) {
    await updateRuntime({ phase: 'polling', message: '監視継続中' });
  } else {
    notifyDashboardUpdate();
  }
}

async function handleSkippedProject(project, reason) {
  await addProject({
    ...project,
    status: 'skipped',
    bidSubmitted: false,
    skipReason: reason,
    processedAt: new Date().toISOString()
  });
  await addTaskLog({
    type: 'skip_proposals',
    projectId: project.id,
    title: project.title,
    message: reason
  });
  notifyDashboardUpdate();
}

async function processNewProject(project, eligibility = {}) {
  if (processingIds.has(project.id)) return;

  try {
    await assertRunning();
  } catch {
    return;
  }

  isProcessing = true;
  processingIds.add(project.id);
  const bidStartTime = Date.now();

  const settingsBefore = await getSettings();
  const priorState = settingsBefore.projects.find(p => p.id === project.id) || null;
  const isRebid = !eligibility.isFirstBid && eligibility.milestone != null;

  await updateRuntime({
    phase: 'processing',
    message: isRebid
      ? `再入札 (提案数${eligibility.milestone}件): ${project.title}`
      : `案件を処理中: ${project.title}`,
    currentProjectId: project.id,
    currentProjectTitle: project.title
  });

  await addProject({
    ...project,
    status: 'processing',
    bidSubmitted: priorState?.bidSubmitted || false,
    bidCount: priorState?.bidCount || 0,
    bidMilestonesCompleted: priorState?.bidMilestonesCompleted || [],
    bidHistory: priorState?.bidHistory || [],
    skipReason: null,
    processedAt: new Date().toISOString()
  });
  notifyDashboardUpdate();

  try {
    const settings = await getSettings();

    await updateRuntime({
      phase: 'processing',
      message: '案件詳細を取得中...',
      currentProjectId: project.id,
      currentProjectTitle: project.title
    });
    await assertRunning();
    const fullProject = await fetchAndScrapeDetail(project.url);
    const mergedProject = { ...project, ...fullProject };

    if (!mergedProject.description || mergedProject.description.length < 20) {
      mergedProject.description = [mergedProject.title, mergedProject.category, mergedProject.budget]
        .filter(Boolean).join('\n');
    }

    await updateRuntime({
      phase: 'analyzing',
      message: settings.claudeApiKey && settings.openaiApiKey
        ? 'Claude + OpenAI で入札文を生成中...'
        : 'AI分析・入札文生成中...',
      currentProjectId: project.id,
      currentProjectTitle: project.title
    });
    await assertRunning();
    const aiResult = await analyzeAndGenerateBid(mergedProject, settings);
    await assertRunning();

    const apiStatus = await checkAllConnections(settings);
    await saveSettings({
      connectionStatus: {
        ...apiStatus,
        claude: aiResult.shouldBid && settings.claudeApiKey
          ? { connected: true, message: 'Connected', checkedAt: new Date().toISOString() }
          : apiStatus.claude,
        openai: aiResult.shouldBid && settings.openaiApiKey
          ? { connected: true, message: 'Connected', checkedAt: new Date().toISOString() }
          : apiStatus.openai
      }
    });
    notifyDashboardUpdate();

    if (!aiResult.shouldBid) {
      await updateProject(project.id, {
        ...mergedProject,
        status: 'skipped',
        bidSubmitted: false,
        skipReason: aiResult.reason,
        analysisMethod: 'ai'
      });
      await addTaskLog({
        type: 'skip',
        projectId: project.id,
        title: mergedProject.title,
        message: aiResult.reason
      });
      notifyDashboardUpdate();
      return;
    }

    await updateProject(project.id, {
      ...mergedProject,
      bidDocument: aiResult.proposalText,
      bidAmount: aiResult.bidAmount,
      status: 'bidding',
      analysisMethod: aiResult.analysisMethod || 'ai',
      bidFormatId: aiResult.bidFormatId,
      bidFormatName: aiResult.bidFormatName
    });
    notifyDashboardUpdate();

    await updateRuntime({
      phase: 'bidding',
      message: '入札を送信しています...',
      currentProjectId: project.id,
      currentProjectTitle: project.title
    });

    await assertRunning();
    const submitResult = await submitBid(mergedProject, {
      proposalText: aiResult.proposalText,
      bidAmount: aiResult.bidAmount,
      completionDate: aiResult.completionDate,
      experienceText: aiResult.experienceText
    }, settings);

    const elapsed = Date.now() - bidStartTime;
    const success = submitResult?.success === true;
    const countAtBid = mergedProject.proposalCount ?? project.proposalCount;

    const lancersStatus = await checkAllConnections(settings);
    await saveSettings({
      connectionStatus: {
        ...lancersStatus,
        lancers: success
          ? { connected: true, message: 'Connected', checkedAt: new Date().toISOString() }
          : lancersStatus.lancers
      }
    });

    await updateProject(project.id, {
      status: success ? 'bid_submitted' : (priorState?.bidSubmitted ? 'bid_submitted' : 'error'),
      bidSubmitted: success || priorState?.bidSubmitted || false,
      bidCount: success ? getBidCount(priorState) + 1 : getBidCount(priorState),
      bidMilestonesCompleted: success
        ? (eligibility.milestone
          ? [...(priorState?.bidMilestonesCompleted || []), eligibility.milestone]
          : markMilestonesThroughCount(priorState?.bidMilestonesCompleted || [], countAtBid))
        : (priorState?.bidMilestonesCompleted || []),
      bidHistory: success
        ? [...(priorState?.bidHistory || []), buildBidRecord(
            countAtBid,
            eligibility.milestone,
            aiResult.bidAmount
          )]
        : (priorState?.bidHistory || []),
      lastBidProposalCount: success ? countAtBid : priorState?.lastBidProposalCount,
      skipReason: success ? null : (priorState?.bidSubmitted ? null : (submitResult?.error || '入札送信に失敗しました')),
      bidDocument: aiResult.proposalText,
      bidAmount: aiResult.bidAmount,
      completionDate: aiResult.completionDate?.toISOString?.() || aiResult.completionDate,
      submittedAt: success ? new Date().toISOString() : priorState?.submittedAt,
      bidDurationMs: elapsed,
      errorRetryCount: !success && !priorState?.bidSubmitted
        ? (priorState?.errorRetryCount || 0) + 1
        : (priorState?.errorRetryCount || 0)
    });
    notifyDashboardUpdate();

    await updateRuntime({
      phase: success ? 'idle' : 'error',
      message: success
        ? `入札完了 (${(elapsed / 1000).toFixed(1)}秒): ¥${aiResult.bidAmount.toLocaleString()}`
        : '入札送信に失敗しました',
      currentProjectId: null,
      currentProjectTitle: null
    });

    await addTaskLog({
      type: success ? 'bid' : 'error',
      projectId: project.id,
      title: mergedProject.title,
      message: success
        ? `${isRebid ? `[再入札 M${eligibility.milestone}] ` : ''}入札完了 (${(elapsed / 1000).toFixed(1)}秒): ¥${aiResult.bidAmount.toLocaleString()}`
        : (submitResult?.error || `入札失敗 (${(elapsed / 1000).toFixed(1)}秒)`)
    });

    if (success) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '入札完了',
        message: `${mergedProject.title} — ${(elapsed / 1000).toFixed(1)}秒`
      });
    }
  } catch (err) {
    if (err instanceof StopError || err.name === 'StopError') {
      if (priorState?.bidSubmitted) {
        await updateProject(project.id, {
          status: 'bid_submitted',
          bidSubmitted: true,
          bidCount: priorState.bidCount,
          bidMilestonesCompleted: priorState.bidMilestonesCompleted,
          bidHistory: priorState.bidHistory,
          skipReason: null,
          processedAt: priorState.processedAt
        });
      } else {
        await updateProject(project.id, {
          status: 'detected',
          bidSubmitted: false,
          skipReason: null,
          processedAt: new Date().toISOString()
        });
      }
      await updateRuntime({
        phase: 'idle',
        message: '停止しました',
        currentProjectId: null,
        currentProjectTitle: null
      });
      await addTaskLog({
        type: 'system',
        projectId: project.id,
        title: project.title,
        message: '入札処理を中断しました'
      });
      return;
    }
    await updateProject(project.id, {
      status: priorState?.bidSubmitted ? 'bid_submitted' : 'error',
      bidSubmitted: priorState?.bidSubmitted || false,
      skipReason: priorState?.bidSubmitted ? null : `処理エラー: ${err.message}`,
      errorRetryCount: (priorState?.errorRetryCount || 0) + 1,
      bidDurationMs: Date.now() - bidStartTime
    });
    await updateRuntime({
      phase: 'error',
      message: err.message,
      currentProjectId: null,
      currentProjectTitle: null
    });
    await addTaskLog({
      type: 'error',
      projectId: project.id,
      title: project.title,
      message: err.message
    });
  } finally {
    processingIds.delete(project.id);
    isProcessing = false;
    notifyDashboardUpdate();
  }
}

async function openDashboard(page = 'status.html') {
  const url = chrome.runtime.getURL(`dashboard/${page}`);
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('dashboard/*') });
  const existing = tabs.find(t => t.url?.includes(page));
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
  } else if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true, url });
  } else {
    await chrome.tabs.create({ url });
  }
}
