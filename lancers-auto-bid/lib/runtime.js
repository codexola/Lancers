import { setRuntimeStatus } from './storage.js';
import { autoSaveJson } from './storage.js';

export function notifyDashboardUpdate() {
  autoSaveJson().catch(() => {});
  chrome.runtime.sendMessage({ action: 'dashboardUpdate' }).catch(() => {});
}

export async function updateRuntime(partial) {
  const status = await setRuntimeStatus(partial);
  notifyDashboardUpdate();
  return status;
}
