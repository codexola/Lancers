import { clearActiveBidTab, setActiveBidTab } from './run-control.js';

const managedTabIds = new Set();

export function registerBidTab(tabId) {
  if (tabId != null) managedTabIds.add(tabId);
}

export function unregisterBidTab(tabId) {
  if (tabId != null) managedTabIds.delete(tabId);
}

export async function closeBidTab(tabId) {
  if (tabId == null) return;
  unregisterBidTab(tabId);
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* already closed */
  }
  await sleep(150);
}

/** 管理対象の入札タブをすべて閉じ、状態をリセットする */
export async function closeAllManagedBidTabs() {
  const ids = [...managedTabIds];
  managedTabIds.clear();
  clearActiveBidTab();

  await Promise.all(ids.map(id => chrome.tabs.remove(id).catch(() => {})));
  if (ids.length > 0) await sleep(300);
}

/**
 * 案件ごとに新しいタブを開く（URL差し替えによる再利用は行わない）
 */
export async function openFreshBidTab(projectUrl, projectId) {
  await closeAllManagedBidTabs();

  const cleanUrl = normalizeProjectUrl(projectUrl);
  const tab = await chrome.tabs.create({
    url: cleanUrl,
    active: false
  });

  registerBidTab(tab.id);
  setActiveBidTab(tab.id);

  return { tab, tabId: tab.id, url: cleanUrl, projectId };
}

export function normalizeProjectUrl(url) {
  const match = String(url || '').match(/\/work\/detail\/(\d+)/);
  if (match) {
    return `https://www.lancers.jp/work/detail/${match[1]}`;
  }
  return url.split('#')[0].split('?')[0];
}

export async function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('ページ読み込みタイムアウト'));
    }, timeoutMs);

    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(tab => {
      if (tab?.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(reject);
  });
}

export async function verifyTabOnProject(tabId, projectUrl) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const expectedId = normalizeProjectUrl(projectUrl).match(/detail\/(\d+)/)?.[1];
    const actualId = (tab.url || '').match(/detail\/(\d+)/)?.[1]
      || (tab.url || '').match(/propose\/(\d+)/)?.[1];
    return !expectedId || expectedId === actualId;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
