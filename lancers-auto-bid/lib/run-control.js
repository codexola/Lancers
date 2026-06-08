import { getSettings } from './storage.js';
import { closeAllManagedBidTabs } from './bid-tab-manager.js';

let stopRequested = false;
let activeBidTabId = null;

export class StopError extends Error {
  constructor(message = '入札が停止されました') {
    super(message);
    this.name = 'StopError';
  }
}

export function armRun() {
  stopRequested = false;
}

export function requestStop() {
  stopRequested = true;
  closeActiveBidTab();
  closeAllManagedBidTabs().catch(() => {});
}

export function isStopRequested() {
  return stopRequested;
}

export function setActiveBidTab(tabId) {
  activeBidTabId = tabId;
}

export function clearActiveBidTab() {
  activeBidTabId = null;
}

function closeActiveBidTab() {
  if (activeBidTabId == null) return;
  const tabId = activeBidTabId;
  activeBidTabId = null;
  chrome.tabs.remove(tabId).catch(() => {});
}

export async function assertRunning() {
  if (stopRequested) throw new StopError();
  const settings = await getSettings();
  if (!settings.isRunning) throw new StopError();
}
