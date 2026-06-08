import { DEFAULT_SETTINGS } from './constants.js';

export async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await chrome.storage.local.set({ settings: updated });
  return updated;
}

export async function addProject(project) {
  const settings = await getSettings();
  const existing = settings.projects.findIndex(p => p.id === project.id);
  if (existing >= 0) {
    settings.projects[existing] = { ...settings.projects[existing], ...project };
  } else {
    settings.projects.unshift(project);
  }
  await saveSettings({ projects: settings.projects });
  return project;
}

export async function updateProject(id, updates) {
  const settings = await getSettings();
  const idx = settings.projects.findIndex(p => p.id === id);
  if (idx >= 0) {
    settings.projects[idx] = { ...settings.projects[idx], ...updates };
    await saveSettings({ projects: settings.projects });
    return settings.projects[idx];
  }
  return null;
}

export async function addTaskLog(entry) {
  const settings = await getSettings();
  settings.tasksLog.unshift({
    ...entry,
    timestamp: new Date().toISOString()
  });
  if (settings.tasksLog.length > 1000) {
    settings.tasksLog = settings.tasksLog.slice(0, 1000);
  }
  await saveSettings({ tasksLog: settings.tasksLog });
}

export async function clearDashboardLog() {
  await saveSettings({ dashboardLogClearAfter: new Date().toISOString() });
}

export function filterVisibleTasksLog(tasksLog, dashboardLogClearAfter) {
  if (!dashboardLogClearAfter) return tasksLog;
  return tasksLog.filter(t => t.timestamp && t.timestamp > dashboardLogClearAfter);
}

export async function setRuntimeStatus(partial) {
  const settings = await getSettings();
  const runtimeStatus = {
    ...settings.runtimeStatus,
    ...partial,
    updatedAt: new Date().toISOString()
  };
  await saveSettings({ runtimeStatus });
  return runtimeStatus;
}

export async function markProjectSeen(projectId) {
  const settings = await getSettings();
  if (!settings.seenProjectIds.includes(projectId)) {
    settings.seenProjectIds.push(projectId);
    if (settings.seenProjectIds.length > 5000) {
      settings.seenProjectIds = settings.seenProjectIds.slice(-5000);
    }
    await saveSettings({ seenProjectIds: settings.seenProjectIds });
  }
}

export async function exportAllData() {
  const settings = await getSettings();
  const data = {
    exportedAt: new Date().toISOString(),
    settings: {
      isRunning: settings.isRunning,
      isFilteringEnabled: settings.isFilteringEnabled,
      isBiddingEnabled: settings.isBiddingEnabled,
      aiProvider: settings.aiProvider,
      bidPrompt: settings.bidPrompt,
      analysisPrompt: settings.analysisPrompt,
      portfolioLinks: settings.portfolioLinks,
      sampleBids: settings.sampleBids,
      maxProposalCount: settings.maxProposalCount
    },
    projects: settings.projects,
    tasksLog: settings.tasksLog,
    seenProjectIds: settings.seenProjectIds,
    errorSolutions: settings.errorSolutions
  };
  await chrome.storage.local.set({ jsonBackup: data });
  return data;
}

export async function autoSaveJson() {
  const data = await exportAllData();
  return data;
}

export async function getErrorSolution(fingerprint, errorCode) {
  const settings = await getSettings();
  const solutions = settings.errorSolutions || {};
  return findMatchingSolutionInStore(solutions, fingerprint, errorCode);
}

function findMatchingSolutionInStore(errorSolutions, fingerprint, errorCode) {
  if (errorSolutions[fingerprint]) {
    return { key: fingerprint, solution: errorSolutions[fingerprint] };
  }
  const prefix = `${errorCode}:`;
  const matches = Object.entries(errorSolutions)
    .filter(([key]) => key.startsWith(prefix))
    .sort((a, b) => (b[1].successCount || 0) - (a[1].successCount || 0));
  if (matches.length > 0) {
    const [key, solution] = matches[0];
    return { key, solution };
  }
  return null;
}

export async function saveErrorSolution(fingerprint, { fix, source, explanation }) {
  const settings = await getSettings();
  const solutions = { ...(settings.errorSolutions || {}) };
  const existing = solutions[fingerprint];

  solutions[fingerprint] = {
    fix,
    source: source || 'unknown',
    explanation: explanation || '',
    errorCode: fingerprint.split(':')[0],
    successCount: existing?.successCount || 0,
    failCount: existing?.failCount || 0,
    createdAt: existing?.createdAt || new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    lastSuccessAt: existing?.lastSuccessAt || null
  };

  await saveSettings({ errorSolutions: solutions });
  return solutions[fingerprint];
}

export async function incrementSolutionUsage(fingerprint, success) {
  if (!fingerprint) return;
  const settings = await getSettings();
  const solutions = { ...(settings.errorSolutions || {}) };
  const entry = solutions[fingerprint];
  if (!entry) return;

  entry.lastUsedAt = new Date().toISOString();
  if (success) {
    entry.successCount = (entry.successCount || 0) + 1;
    entry.lastSuccessAt = new Date().toISOString();
  } else {
    entry.failCount = (entry.failCount || 0) + 1;
  }

  await saveSettings({ errorSolutions: solutions });
}
