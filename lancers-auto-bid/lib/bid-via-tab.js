import { updateRuntime } from './runtime.js';
import { addTaskLog } from './storage.js';
import {
  assertRunning, StopError, isStopRequested
} from './run-control.js';
import {
  openFreshBidTab,
  closeBidTab,
  closeAllManagedBidTabs,
  waitForTabComplete,
  verifyTabOnProject,
  normalizeProjectUrl
} from './bid-tab-manager.js';
import {
  resolveBiddingError,
  recordSolutionSuccess,
  recordSolutionFailure
} from './error-resolver.js';

const BID_TIMEOUT_MS = 60000;
const MAX_FRESH_ATTEMPTS = 3;
const TAB_SETTLE_MS = 5000;

export async function submitBidViaContentScript(project, bidData, settings = {}) {
  if (!project?.url) throw new Error('案件URLがありません');

  await assertRunning();
  await closeAllManagedBidTabs();

  const projectUrl = normalizeProjectUrl(project.url);
  const normalizedBidData = normalizeBidData(bidData);
  let lastError = null;

  try {
    for (let attempt = 1; attempt <= MAX_FRESH_ATTEMPTS; attempt++) {
      await assertRunning();

      await updateRuntime({
        phase: 'bidding',
        message: attempt === 1
          ? '新規タブで入札ページを開いています...'
          : `新規タブで再試行 (${attempt}/${MAX_FRESH_ATTEMPTS})...`,
        currentProjectId: project.id,
        currentProjectTitle: project.title
      });

      const { tabId } = await openFreshBidTab(projectUrl, project.id);

      try {
        await waitForTabComplete(tabId, 20000);
        await assertRunning();
        await ensureContentScript(tabId);
        await sleep(TAB_SETTLE_MS);

        const urlOk = await verifyTabOnProject(tabId, projectUrl);
        if (!urlOk) {
          lastError = 'タブの案件URLが一致しません';
          await closeBidTab(tabId);
          continue;
        }

        const result = await executeBidWithErrorRecovery(
          tabId, project, projectUrl, normalizedBidData, settings
        );

        if (result?.success) {
          await addTaskLog({
            type: 'bid',
            projectId: project.id,
            title: project.title,
            message: attempt > 1
              ? `入札成功（新規タブ${attempt}回目）`
              : '入札成功（新規タブ）'
          });
          return { success: true, attempts: attempt };
        }

        lastError = result?.error || '入札送信に失敗しました';

        if (result?.errorCode === 'STALE_PAGE_STATE' || result?.errorCode === 'PROJECT_URL_MISMATCH') {
          lastError = `${lastError} — タブを破棄して再作成します`;
        }
      } finally {
        await closeBidTab(tabId);
        await sleep(400);
      }

      if (attempt < MAX_FRESH_ATTEMPTS) {
        await updateRuntime({
          phase: 'bidding',
          message: '入札失敗 — タブを閉じて新規タブで再試行...',
          currentProjectId: project.id,
          currentProjectTitle: project.title
        });
        await sleep(800);
      }
    }

    throw new Error(`${lastError || '入札送信に失敗しました'} (新規タブ${MAX_FRESH_ATTEMPTS}回試行)`);
  } catch (err) {
    if (isStopRequested()) throw new StopError();
    if (err instanceof StopError || err.name === 'StopError') throw err;
    throw err;
  } finally {
    await closeAllManagedBidTabs();
  }
}

async function executeBidWithErrorRecovery(tabId, project, projectUrl, bidData, settings) {
  const resolutionSettings = settings.errorResolutionSettings || {};
  const maxRetries = resolutionSettings.enabled !== false
    ? (resolutionSettings.maxRetries ?? 3)
    : 0;

  const triedFixes = [];
  let lastResult = null;

  for (let retry = 0; retry <= maxRetries; retry++) {
    await assertRunning();

    await updateRuntime({
      phase: 'bidding',
      message: retry === 0
        ? '入札フォームを操作しています...'
        : `エラー修復中 (${retry}/${maxRetries})...`,
      currentProjectId: project.id,
      currentProjectTitle: project.title
    });

    const result = await sendTabMessage(tabId, {
      action: 'executeBidSequence',
      bidData,
      projectId: project.id,
      projectTitle: project.title,
      projectUrl,
      timeoutMs: BID_TIMEOUT_MS
    });

    if (result?.success) {
      if (triedFixes.length > 0 && triedFixes[triedFixes.length - 1].fingerprint) {
        await recordSolutionSuccess(
          triedFixes[triedFixes.length - 1].fingerprint,
          triedFixes[triedFixes.length - 1].fix,
          triedFixes[triedFixes.length - 1].source,
          triedFixes[triedFixes.length - 1].explanation
        );
      }
      return result;
    }

    lastResult = result;

    if (retry >= maxRetries || resolutionSettings.enabled === false) break;

    const diagnostics = await sendTabMessage(tabId, { action: 'getBidDiagnostics' });
    const resolution = await resolveBiddingError({
      errorMessage: result?.error || '不明なエラー',
      pageType: result?.pageType || diagnostics?.pageType,
      diagnostics,
      attempt: retry,
      triedFixes
    }, settings);

    if (!resolution?.fix) {
      if (resolution?.fingerprint) await recordSolutionFailure(resolution.fingerprint);
      break;
    }

    triedFixes.push({
      fingerprint: resolution.fingerprint,
      fix: resolution.fix,
      source: resolution.source,
      explanation: resolution.explanation
    });

    await addTaskLog({
      type: 'system',
      projectId: project.id,
      title: project.title,
      message: `修復適用: ${resolution.fix.action} (${resolution.source})`
    });

    const fixResult = await sendTabMessage(tabId, {
      action: 'applyBidFix',
      fix: resolution.fix,
      bidData
    });

    if (!fixResult?.applied) {
      if (resolution.fingerprint) await recordSolutionFailure(resolution.fingerprint);
      break;
    }

    if (resolution.fix.action === 'reload' || fixResult.needsReloadWait) {
      await sleep(3000);
      await waitForTabComplete(tabId, 15000);
    }

    await sleep(800);
  }

  return lastResult || { success: false, error: '入札送信に失敗しました' };
}

function normalizeBidData(bidData) {
  let completionDate = bidData.completionDate;
  if (completionDate && !(completionDate instanceof Date)) {
    completionDate = new Date(completionDate);
  }
  return { ...bidData, completionDate };
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'getPageType' });
    return;
  } catch {
    /* not ready — inject */
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js']
    });
    await sleep(800);
  } catch (err) {
    console.warn('Content script injection:', err.message);
  }
}

async function sendTabMessage(tabId, message, retries = 15) {
  for (let i = 0; i < retries; i++) {
    try {
      await assertRunning();
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (err) {
      if (err instanceof StopError || err.name === 'StopError') throw err;
      if (isStopRequested()) throw new StopError();
      if (i === retries - 1) throw new Error(err.message || 'メッセージ送信失敗');
      await sleep(600);
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
