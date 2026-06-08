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

const BID_TIMEOUT_MS = 45000;
const MAX_FRESH_ATTEMPTS = 3;
const TAB_SETTLE_MS = 3000;

export async function submitBidViaContentScript(project, bidData, settings = {}) {
  if (!project?.url) throw new Error('案件URLがありません');

  await assertRunning();
  await closeAllManagedBidTabs();

  const projectUrl = normalizeProjectUrl(project.url);
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
        await sleep(TAB_SETTLE_MS);

        const urlOk = await verifyTabOnProject(tabId, projectUrl);
        if (!urlOk) {
          lastError = 'タブの案件URLが一致しません';
          await closeBidTab(tabId);
          continue;
        }

        await updateRuntime({
          phase: 'bidding',
          message: '入札フォームを操作しています...',
          currentProjectId: project.id,
          currentProjectTitle: project.title
        });

        const result = await sendTabMessage(tabId, {
          action: 'executeBidSequence',
          bidData: normalizeBidData(bidData),
          projectId: project.id,
          projectTitle: project.title,
          projectUrl,
          timeoutMs: BID_TIMEOUT_MS
        });

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
          message: `入札失敗 — タブを閉じて新規タブで再試行...`,
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

function normalizeBidData(bidData) {
  let completionDate = bidData.completionDate;
  if (completionDate && !(completionDate instanceof Date)) {
    completionDate = new Date(completionDate);
  }
  return { ...bidData, completionDate };
}

async function sendTabMessage(tabId, message, retries = 10) {
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
