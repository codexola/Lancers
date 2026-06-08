/** 再入札マイルストーン（提案数がこの値以上になったら1回だけ再入札） */
export const PROPOSAL_REBID_MILESTONES = [40, 60, 80, 100];

/** 40件以上の案件は初回1回のみ入札（次のマイルストーンまで再入札しない） */
export const HIGH_PROPOSAL_THRESHOLD = 40;

/**
 * 入札可否を判定する。
 * - 初回: 新規案件は即時入札
 * - 再入札: 提案数が 40, 60, 80, 100 以上になったとき各1回
 */
export function evaluateBidEligibility(project, existing) {
  const count = normalizeProposalCount(project.proposalCount ?? existing?.proposalCount);

  if (existing?.status === 'processing' || existing?.status === 'bidding') {
    const age = Date.now() - new Date(existing.processedAt || 0).getTime();
    if (age > 90000) {
      return {
        shouldProcess: true,
        reason: '停滞状態から再開',
        milestone: null,
        isFirstBid: getBidCount(existing) === 0
      };
    }
    return { shouldProcess: false, reason: '処理中', milestone: null, isFirstBid: false };
  }

  const bidCount = getBidCount(existing);

  if (bidCount === 0) {
    if (!existing) {
      return { shouldProcess: true, reason: '新規案件 — 初回入札', milestone: null, isFirstBid: true };
    }
    if (existing.status === 'detected') {
      return { shouldProcess: true, reason: '初回入札', milestone: null, isFirstBid: true };
    }
    if (existing.status === 'error') {
      const retries = existing.errorRetryCount || 0;
      if (retries < 1) {
        return { shouldProcess: true, reason: '入札エラー — 1回再試行', milestone: null, isFirstBid: true };
      }
      return { shouldProcess: false, reason: 'エラー再試行上限', milestone: null, isFirstBid: false };
    }
    return { shouldProcess: false, reason: '初回入札済みまたは対象外', milestone: null, isFirstBid: false };
  }

  const nextMilestone = getNextRebidMilestone(count, existing.bidMilestonesCompleted || []);
  if (nextMilestone !== null) {
    return {
      shouldProcess: true,
      reason: `提案数${count}件 — マイルストーン${nextMilestone}で再入札`,
      milestone: nextMilestone,
      isFirstBid: false
    };
  }

  return {
    shouldProcess: false,
    reason: count != null && count >= HIGH_PROPOSAL_THRESHOLD
      ? `入札済み（提案数${count}件 — 次の再入札条件未達）`
      : '入札済み — 再入札条件未達',
    milestone: null,
    isFirstBid: false
  };
}

export function shouldProcessProject(project, settings) {
  const existing = settings.projects.find(p => p.id === project.id);
  return evaluateBidEligibility(project, existing).shouldProcess;
}

export function getNextRebidMilestone(currentCount, completedMilestones) {
  if (currentCount == null) return null;
  for (const milestone of PROPOSAL_REBID_MILESTONES) {
    if (currentCount >= milestone && !completedMilestones.includes(milestone)) {
      return milestone;
    }
  }
  return null;
}

export function getBidCount(existing) {
  if (!existing) return 0;
  if (typeof existing.bidCount === 'number') return existing.bidCount;
  return existing.bidSubmitted ? 1 : 0;
}

export function buildBidRecord(proposalCount, milestone, bidAmount) {
  return {
    proposalCount: proposalCount ?? null,
    submittedAt: new Date().toISOString(),
    milestone: milestone ?? null,
    bidAmount: bidAmount ?? null
  };
}

/** 初回入札時、既に超えているマイルストーンを消化済みとして記録 */
export function markMilestonesThroughCount(completedMilestones, proposalCount) {
  const result = [...(completedMilestones || [])];
  if (proposalCount == null) return result;
  for (const milestone of PROPOSAL_REBID_MILESTONES) {
    if (proposalCount >= milestone && !result.includes(milestone)) {
      result.push(milestone);
    }
  }
  return result;
}

function normalizeProposalCount(count) {
  if (count === null || count === undefined) return null;
  if (typeof count !== 'number' || count < 0 || count > 500) return null;
  return count;
}

/** @deprecated 50件以上スキップは廃止 — スケジュールロジックに移行 */
export function checkProposalCount(_proposalCount, _maxCount = 50) {
  return { shouldSkip: false, reason: null };
}
