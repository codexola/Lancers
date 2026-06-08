import { callAI, callAIWithProvider, parseJsonFromResponse } from './ai-client.js';
import { assertRunning } from './run-control.js';
import {
  calculateSmartBidAmount,
  calculateSmartCompletionDate,
  quickPreCheck
} from './analyzer.js';
import { parseBudgetRange } from './filter.js';
import { MAX_PROPOSAL_TEXT_LENGTH } from './constants.js';
import {
  parsePortfolioEntries,
  selectRelevantPortfolioLinks
} from './portfolio-filter.js';
import {
  selectBidFormat,
  buildFormatPromptSection,
  getPortfolioAppendixStyle
} from './bid-format.js';

const ANALYSIS_RULES = `## 入札可否の判定基準

### 入札すべき（shouldBid: true）
- Web/LP/ECサイトの開発・コーディング・改修、システム開発、WordPress/API連携
- LP完成のための画像・素材の「配置・組み込み・追加」（制作ではなく実装）
- フロント/バックエンド開発、バグ修正、保守

### 入札すべきでない（shouldBid: false）
- 画像/動画/イラストの制作・編集そのもの、純デザインのみ
- マーケティング、SNS運用、VA、事務、アダルト、無料開発、パートナー募集

### 判定ルール
- システム/Web開発カテゴリの案件は開発要素があれば shouldBid: true を優先
- 案件の依頼詳細（広告文）を読み、主目的が開発かどうかで判断`;

function buildPrompt(project, settings, relevantLinks, allEntries, bidFormat) {
  const bidInstructions = (settings.bidPrompt || '').trim();
  const analysisExtra = (settings.analysisPrompt || '').trim();
  const formatSection = buildFormatPromptSection(bidFormat);
  const { min: budgetMin, max: budgetMax } = parseBudgetRange(project.budget);

  const description = (project.description || project.title || '説明なし').substring(0, 8000);

  const archiveSection = allEntries.length > 0
    ? allEntries.map(e =>
        e.description ? `- ${e.url} （${e.description}）` : `- ${e.url}`
      ).join('\n')
    : '（設定なし）';

  const useSection = relevantLinks.length > 0
    ? relevantLinks.map(l => `- ${l}`).join('\n')
    : '（この案件に合致する実績リンクなし — リンクは記載しない）';

  return `あなたはランサーズ案件の分析・入札文生成AIです。

${ANALYSIS_RULES}
${analysisExtra ? `\n${analysisExtra}\n` : ''}

---

## 入札文生成プロンプト（ダッシュボード設定 — 最優先で遵守すること）
${bidInstructions}

---

${formatSection}

---

## 案件情報（クライアント向け依頼内容・広告 — 提案文に具体的に反映すること）

- タイトル: ${project.title}
- 予算: ${project.budget || '不明'}（参考: ${budgetMin.toLocaleString()}〜${budgetMax.toLocaleString()}円）
- カテゴリ: ${project.category || '不明'}
- 検索元: ${project.searchSource || '不明'}
- 提案数: ${project.proposalCount ?? '不明'}
- 希望納期: ${project.desiredDeadline || '不明'}

### 依頼詳細・案件説明（広告文）
${description}

---

## 過去の実績リンク（アーカイブ — 参考用。すべてを使わないこと）
${archiveSection}

## この案件で使用してよい実績リンク（要件合致分のみ — proposalTextに含めるのはこちらだけ）
${useSection}

---

## 出力要件
- JSONのみ返答（Markdownや説明文は不要）
- proposalText は **${MAX_PROPOSAL_TEXT_LENGTH}文字以内**（${MAX_PROPOSAL_TEXT_LENGTH}文字を絶対に超えない）
- proposalText には定型文・案内文・入札方法の説明を含めない（提案本文のみ）
- 案件の依頼詳細・要件・技術を proposalText に具体的に反映すること
- **この案件専用フォーマット（${bidFormat.name}）に従い、他案件と異なる構成・文体にすること**
- 実績リンクは「使用してよい実績リンク」に記載されたもの**のみ**含める（アーカイブの他リンクは含めない）
- 合致する実績リンクがない場合はリンクセクションを省略する
- bidAmount: 予算範囲内の妥当な税抜金額
- completionDays: 現実的な完了日数
- shouldBidがfalseの場合、proposalTextは空文字

{
  "shouldBid": true/false,
  "reason": "判定理由",
  "projectSize": "small"|"medium"|"large",
  "proposalText": "提案文",
  "bidAmount": 数値,
  "completionDays": 数値,
  "experienceText": "実績欄用テキスト"
}`;
}

/** Strip links from text that are not in the allowed list */
export function stripUnlistedPortfolioLinks(text, allowedLinks) {
  if (!text || !allowedLinks.length) {
    if (!allowedLinks.length) {
      return (text || '').replace(/https?:\/\/[^\s<>"']+/g, (url) => {
        return '';
      }).replace(/\n{3,}/g, '\n\n').trim();
    }
    return text;
  }

  const allowed = new Set(allowedLinks.map(l => l.trim()));
  return (text || '').replace(/https?:\/\/[^\s<>"']+/g, (url) => {
    const clean = url.replace(/[.,;:!?)]+$/, '');
    return allowed.has(clean) || allowed.has(url) ? url : '';
  }).replace(/\n{3,}/g, '\n\n').trim();
}

export function enforceProposalLength(text, relevantLinks = [], project = null) {
  let result = stripUnlistedPortfolioLinks((text || '').trim(), relevantLinks);

  if (relevantLinks.length > 0) {
    const missing = relevantLinks.filter(link => !result.includes(link.trim()));
    if (missing.length > 0) {
      const appendixPrefix = project
        ? getPortfolioAppendixStyle(project)
        : '\n\n';
      const appendix = appendixPrefix + missing.join('\n');
      if (result.length + appendix.length <= MAX_PROPOSAL_TEXT_LENGTH) {
        result += appendix;
      } else {
        const maxMain = MAX_PROPOSAL_TEXT_LENGTH - appendix.length - 3;
        result = result.substring(0, Math.max(0, maxMain)) + '...' + appendix;
      }
    }
  }

  if (result.length > MAX_PROPOSAL_TEXT_LENGTH) {
    result = result.substring(0, MAX_PROPOSAL_TEXT_LENGTH);
  }
  return result;
}

export async function analyzeAndGenerateBid(project, settings) {
  const allEntries = parsePortfolioEntries(settings.portfolioLinks);
  const relevantLinks = selectRelevantPortfolioLinks(project, allEntries);
  const bidFormat = selectBidFormat(project);

  const preCheck = quickPreCheck(project);
  if (preCheck.skipImmediately) {
    return {
      shouldBid: false,
      reason: preCheck.reason,
      projectSize: 'medium',
      proposalText: '',
      bidAmount: 0,
      completionDate: new Date(),
      experienceText: '',
      portfolioLinksUsed: [],
      bidFormatId: bidFormat.id,
      bidFormatName: bidFormat.name
    };
  }

  const userPrompt = buildPrompt(project, settings, relevantLinks, allEntries, bidFormat);
  const useDual = settings.useDualAi !== false &&
    settings.claudeApiKey && settings.openaiApiKey;

  try {
    if (useDual) {
      return await generateWithDualAI(userPrompt, project, settings, relevantLinks, preCheck, bidFormat);
    }

    await assertRunning();
    const response = await callAI(settings, userPrompt, {
      maxTokens: 4096,
      fast: false
    });
    return finalizeBidResult(
      parseCombinedResponse(response, project, relevantLinks, preCheck, bidFormat),
      null,
      project,
      bidFormat
    );
  } catch (err) {
    if (err.name === 'StopError') throw err;
    if (preCheck.shouldBid) {
      return buildFallbackBid(project, relevantLinks, preCheck, bidFormat);
    }
    throw err;
  }
}

async function generateWithDualAI(userPrompt, project, settings, relevantLinks, preCheck, bidFormat) {
  await assertRunning();

  const aiOptions = { maxTokens: 4096, fast: false };
  const tasks = [];

  if (settings.claudeApiKey) {
    tasks.push(
      callAIWithProvider(settings, 'claude', userPrompt, aiOptions)
        .then(text => ({ source: 'claude', text, ok: true }))
        .catch(err => ({ source: 'claude', error: err.message, ok: false }))
    );
  }
  if (settings.openaiApiKey) {
    tasks.push(
      callAIWithProvider(settings, 'openai', userPrompt, aiOptions)
        .then(text => ({ source: 'openai', text, ok: true }))
        .catch(err => ({ source: 'openai', error: err.message, ok: false }))
    );
  }

  const results = await Promise.all(tasks);
  await assertRunning();

  const drafts = results
    .filter(r => r.ok && r.text)
    .map(r => ({
      source: r.source,
      parsed: parseJsonFromResponse(r.text),
      raw: r.text
    }))
    .filter(d => d.parsed);

  if (drafts.length === 0) {
    const errors = results.filter(r => !r.ok).map(r => r.error).join('; ');
    throw new Error(errors || 'Claude/OpenAI両方の生成に失敗しました');
  }

  if (drafts.length === 1) {
    const single = parseCombinedResponse(drafts[0].raw, project, relevantLinks, preCheck, bidFormat);
    single.analysisMethod = drafts[0].source;
    return finalizeBidResult(single, null, project, bidFormat);
  }

  const mergePrompt = buildMergePrompt(project, settings, relevantLinks, drafts, preCheck, bidFormat);
  await assertRunning();

  const mergeProvider = settings.aiProvider === 'openai' ? 'openai' : 'claude';
  let mergedText;
  try {
    mergedText = await callAIWithProvider(settings, mergeProvider, mergePrompt, aiOptions);
  } catch {
    const fallbackProvider = mergeProvider === 'openai' ? 'claude' : 'openai';
    mergedText = await callAIWithProvider(settings, fallbackProvider, mergePrompt, aiOptions);
  }

  await assertRunning();

  const merged = parseCombinedResponse(mergedText, project, relevantLinks, preCheck, bidFormat);
  merged.analysisMethod = `dual:${drafts.map(d => d.source).join('+')}→${mergeProvider}`;
  return finalizeBidResult(merged, drafts, project, bidFormat);
}

function buildMergePrompt(project, settings, relevantLinks, drafts, preCheck, bidFormat) {
  const bidInstructions = (settings.bidPrompt || '').trim();
  const formatSection = buildFormatPromptSection(bidFormat);
  const draftSections = drafts.map((d, i) => {
    const p = d.parsed;
    return `### 案${i + 1} (${d.source})
- shouldBid: ${p.shouldBid}
- reason: ${p.reason || ''}
- bidAmount: ${p.bidAmount || '不明'}
- completionDays: ${p.completionDays || '不明'}
- proposalText:
${(p.proposalText || '').substring(0, 2500)}`;
  }).join('\n\n');

  return `あなたはランサーズ入札文の統合・最終編集AIです。
Claude と OpenAI が生成した2つの入札案を分析し、**最高品質の1つの完璧な提案**に統合してください。

## 統合ルール
1. 両案の優れた要素（具体性・技術理解・スケジュール・金額妥当性）を組み合わせる
2. 案件「${project.title}」の依頼内容に具体的に言及する
3. proposalText は ${MAX_PROPOSAL_TEXT_LENGTH} 文字以内（絶対厳守）
4. 定型文・案内文・入札方法の説明は含めない
5. 実績リンクは以下のみ使用: ${relevantLinks.length ? relevantLinks.join(', ') : 'なし（リンク不要）'}
6. shouldBid は両案のうち開発案件なら true を優先
7. bidAmount は予算内の妥当な税抜金額
8. JSONのみ返答

## ダッシュボード設定（最優先）
${bidInstructions}

${formatSection}

## 案件タイトル
${project.title}

## 生成済み入札案
${draftSections}

{
  "shouldBid": true/false,
  "reason": "統合判定理由",
  "projectSize": "small"|"medium"|"large",
  "proposalText": "統合後の完璧な提案文",
  "bidAmount": 数値,
  "completionDays": 数値,
  "experienceText": "実績欄用テキスト"
}`;
}

function finalizeBidResult(result, drafts = null, project = null, bidFormat = null) {
  if (bidFormat) {
    result.bidFormatId = bidFormat.id;
    result.bidFormatName = bidFormat.name;
  }
  if (!result.shouldBid) return result;

  if (!result.proposalText || result.proposalText.length < 100) {
    if (drafts) {
      const best = drafts
        .filter(d => d.parsed?.proposalText?.length > 100)
        .sort((a, b) => (b.parsed.proposalText?.length || 0) - (a.parsed.proposalText?.length || 0))[0];
      if (best) {
        result.proposalText = best.parsed.proposalText;
        result.bidAmount = result.bidAmount || best.parsed.bidAmount;
        result.reason = `${result.reason || ''} (${best.source}案を採用)`.trim();
      }
    }
  }

  if (!result.proposalText || result.proposalText.length < 50) {
    result.shouldBid = false;
    result.reason = '提案文の生成品質が不足';
    return result;
  }

  result.proposalText = enforceProposalLength(
    result.proposalText,
    result.portfolioLinksUsed || [],
    project
  );
  return result;
}

function parseCombinedResponse(text, project, relevantLinks, preCheck, bidFormat) {
  const parsed = parseJsonFromResponse(text);
  const projectSize = parsed?.projectSize || preCheck.projectSize || 'medium';
  const { min: budgetMin, max: budgetMax } = parseBudgetRange(project.budget);

  const shouldBid = parsed?.shouldBid ?? preCheck.shouldBid ?? false;

  if (!shouldBid) {
    if (preCheck.shouldBid && (project.searchSource === 'system' || project.searchSource === 'web')) {
      return buildFallbackBid(project, relevantLinks, preCheck, bidFormat);
    }
    return {
      shouldBid: false,
      reason: parsed?.reason || preCheck.reason || 'AI分析: 開発案件以外と判定',
      projectSize,
      proposalText: '',
      bidAmount: 0,
      completionDate: new Date(),
      experienceText: '',
      portfolioLinksUsed: []
    };
  }

  let bidAmount = parsed?.bidAmount || calculateSmartBidAmount(project.budget, projectSize);
  bidAmount = Math.max(budgetMin, Math.min(budgetMax, bidAmount));
  bidAmount = Math.round(bidAmount / 1000) * 1000;

  const completionDate = calculateSmartCompletionDate(
    project.desiredDeadline,
    projectSize,
    parsed?.completionDays
  );

  let proposalText = parsed?.proposalText || '';
  if (!proposalText && preCheck.shouldBid) {
    proposalText = buildFallbackBid(project, relevantLinks, preCheck, bidFormat).proposalText;
  }

  proposalText = enforceProposalLength(proposalText, relevantLinks, project);

  let experienceText = (parsed?.experienceText || '').substring(0, 2000);
  if (experienceText.length > MAX_PROPOSAL_TEXT_LENGTH) {
    experienceText = experienceText.substring(0, MAX_PROPOSAL_TEXT_LENGTH);
  }

  return {
    shouldBid: true,
    reason: parsed?.reason || preCheck.reason || 'AI分析: 開発案件と判定',
    projectSize,
    proposalText,
    bidAmount,
    completionDate,
    experienceText,
    portfolioLinksUsed: relevantLinks,
    bidFormatId: bidFormat?.id,
    bidFormatName: bidFormat?.name
  };
}

function buildFallbackBid(project, relevantLinks, preCheck, bidFormat) {
  const format = bidFormat || selectBidFormat(project);
  const projectSize = preCheck.projectSize || 'medium';
  const bidAmount = calculateSmartBidAmount(project.budget, projectSize);
  const completionDate = calculateSmartCompletionDate(project.desiredDeadline, projectSize, 30);
  const descSnippet = (project.description || '').substring(0, 500);

  let proposalText;
  switch (format.id) {
    case 'technical_bullets': {
      const days = Math.max(7, Math.ceil((completionDate.getTime() - Date.now()) / 86400000));
      proposalText = `「${project.title}」についてご提案いたします。

■ ご依頼内容の理解
${descSnippet || 'ご依頼内容を確認し、要件に沿って実装いたします。'}

■ 技術的アプローチ
- ご要件に合わせた設計・実装
- 品質・保守性を考慮したコーディング
- 納期遵守の進行管理

■ お見積り
${bidAmount.toLocaleString()}円（税抜） / 約${days}日

ご検討よろしくお願いいたします。`;
      break;
    }
    case 'casual_direct':
      proposalText = `はじめまして。「${project.title}」、拝見しました。

${descSnippet ? descSnippet.substring(0, 300) + '…への対応、問題なく承れます。' : 'ご依頼内容に沿って対応できます。'}

${bidAmount.toLocaleString()}円（税抜）で、希望納期に合わせて進めます。よろしくお願いします。`;
      break;
    case 'timeline_first': {
      const days = Math.max(7, Math.ceil((completionDate.getTime() - Date.now()) / 86400000));
      proposalText = `「${project.title}」へのご提案です。

【スケジュール目安】
Week 1: 要件確認・設計
Week 2-3: 実装
Week 4: テスト・納品

${descSnippet ? '依頼内容: ' + descSnippet.substring(0, 200) : ''}

${bidAmount.toLocaleString()}円（税抜）にて対応可能です。`;
      break;
    }
    default:
      proposalText = `${project.title}の件、ご提案させてください。

${descSnippet || 'ご依頼内容を踏まえ、丁寧に対応いたします。'}

実装から納品まで責任を持って対応します。ご予算${bidAmount.toLocaleString()}円（税抜）にて承ります。`;
  }

  proposalText = enforceProposalLength(proposalText, relevantLinks, project);

  return {
    shouldBid: true,
    reason: 'クイック判定: 開発案件として入札',
    projectSize,
    proposalText,
    bidAmount,
    completionDate,
    experienceText: '',
    portfolioLinksUsed: relevantLinks,
    bidFormatId: format.id,
    bidFormatName: format.name
  };
}

export async function generateBid(project, settings, analysis = {}) {
  const result = await analyzeAndGenerateBid(project, settings);
  if (!result.shouldBid) throw new Error(result.reason);
  return result;
}
