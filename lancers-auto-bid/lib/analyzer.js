import { callAI } from './ai-client.js';
import { parseBudgetRange } from './filter.js';

const ANALYSIS_PROMPT = `あなたはフリーランス案件の分析エキスパートです。
以下の案件が「プログラム・システム・Web開発」案件として入札すべきかを判定してください。

## 入札すべき案件（shouldBid: true）
- Webサイト/LP/ECサイトの開発・コーディング・改修
- システム開発、API連携、WordPress/CMS構築
- 画像やバナーの「配置・組み込み・素材のページへの追加」（クライアント提供素材や既存素材のLP組み込み）
- フロントエンド/バックエンド開発、バグ修正、保守運用

## 入札すべきでない案件（shouldBid: false）
- 画像生成AI、イラスト制作、写真撮影、動画制作・動画編集そのもの
- 純粋なデザインのみ（コーディングを伴わない）
- マーケティング、SNS運用、SEO、広告運用
- バーチャルアシスタント、事務代行、データ入力
- アダルト、風俗関連
- サロン・美容系の店舗運営支援（開発要素がない場合）
- パートナー募集、代理店募集、提携募集
- 無料開発、無償、実績作り目的

## 重要な判定ルール
- 「LP完成に必要な画像を社内で用意・追加する」「素材をページに配置する」は開発案件として shouldBid: true
- 「画像を制作する」「動画を編集する」「バナーをデザインする」は shouldBid: false
- タイトルに開発キーワードがなくても、説明文にコーディング/システム開発の要素があれば shouldBid: true
- 迷う場合は説明文の主目的を優先して判断する

JSON形式のみで返答：
{
  "shouldBid": true または false,
  "reason": "判定理由（日本語、1〜2文）",
  "projectSize": "small" | "medium" | "large",
  "isDevelopmentWork": true または false
}`;

export async function analyzeProject(project, settings) {
  const userMessage = `${ANALYSIS_PROMPT}

## 案件情報
- タイトル: ${project.title}
- 予算: ${project.budget || '不明'}
- カテゴリ: ${project.category || '不明'}
- 提案数: ${project.proposalCount ?? '不明'}
- 希望納期: ${project.desiredDeadline || '不明'}
- 説明:
${project.description || '説明なし'}`;

  try {
    const response = await callAI(settings, userMessage, { maxTokens: 1024 });
    const parsed = parseJsonFromResponse(response);
    if (parsed && typeof parsed.shouldBid === 'boolean') {
      return {
        shouldBid: parsed.shouldBid,
        reason: parsed.reason || (parsed.shouldBid ? 'AI分析: 開発案件と判定' : 'AI分析: 開発案件以外と判定'),
        projectSize: parsed.projectSize || 'medium',
        isDevelopmentWork: parsed.isDevelopmentWork ?? parsed.shouldBid
      };
    }
  } catch (err) {
    console.warn('AI analysis failed, using fallback:', err.message);
  }

  return fallbackAnalyze(project);
}

function fallbackAnalyze(project) {
  const text = [
    project.title, project.description, project.category, project.budget
  ].join(' ').toLowerCase();

  const devSignals = [
    '開発', 'コーディング', 'coding', 'program', 'システム', 'wordpress',
    'php', 'javascript', 'react', 'vue', 'api', 'lp', 'ランディング',
    'webサイト', '組み込', '実装', '構築', '改修', 'バグ'
  ];
  const excludeSignals = [
    { kw: '画像生成', ctx: ['配置', '組み込', '追加', '用意', '素材'] },
    { kw: '動画制作', ctx: [] },
    { kw: '動画編集', ctx: [] },
    { kw: 'イラスト制作', ctx: [] },
    { kw: 'マーケティング', ctx: ['開発', 'システム', 'lp'] },
    { kw: 'sns運用', ctx: [] },
    { kw: 'バーチャルアシスタント', ctx: [] },
    { kw: 'アダルト', ctx: [] },
    { kw: '無料開発', ctx: [] },
    { kw: '無償', ctx: [] }
  ];

  for (const { kw, ctx } of excludeSignals) {
    if (text.includes(kw)) {
      const hasDevContext = ctx.some(c => text.includes(c));
      const hasDevSignal = devSignals.some(s => text.includes(s));
      if (!hasDevContext && !hasDevSignal) {
        return {
          shouldBid: false,
          reason: `キーワード「${kw}」により開発以外の案件と判定（フォールバック）`,
          projectSize: 'medium',
          isDevelopmentWork: false
        };
      }
    }
  }

  const hasDev = devSignals.some(s => text.includes(s));
  if (!hasDev) {
    return {
      shouldBid: false,
      reason: 'プログラム開発に関連する内容が見つかりませんでした（フォールバック）',
      projectSize: 'medium',
      isDevelopmentWork: false
    };
  }

  return {
    shouldBid: true,
    reason: '開発関連キーワードを検出（フォールバック）',
    projectSize: 'medium',
    isDevelopmentWork: true
  };
}

export { shouldProcessProject, checkProposalCount, evaluateBidEligibility, buildBidRecord, getBidCount } from './bid-schedule.js';

export function quickPreCheck(project) {
  const text = [
    project.title, project.description, project.category, project.budget
  ].join(' ').toLowerCase();

  const hardExclude = [
    '画像生成', 'midjourney', 'stable diffusion', '動画制作', '動画編集',
    '映像制作', 'youtube編集', 'バーチャルアシスタント', 'va募集',
    '事務代行', 'アダルト', '風俗', '無料開発', '無償で', 'タダで',
    'パートナー募集', '提携募集', '代理店募集'
  ];
  for (const kw of hardExclude) {
    if (text.includes(kw)) {
      return { shouldBid: false, skipImmediately: true, reason: `除外: ${kw}`, projectSize: 'medium' };
    }
  }

  const devSignals = [
    '開発', 'コーディング', 'coding', 'program', 'システム', 'wordpress',
    'php', 'javascript', 'typescript', 'react', 'vue', 'api', 'lp',
    'ランディング', 'webサイト', '組み込', '実装', '構築', '改修',
    'バグ', 'cms', 'ec', 'アプリ', 'app', 'html', 'css', 'node',
    'python', 'laravel', 'django', 'shopify', 'woocommerce'
  ];

  const fromDevSearch = project.searchSource === 'system' || project.searchSource === 'web';
  const hasDev = devSignals.some(s => text.includes(s));

  if (fromDevSearch || hasDev) {
    const size = text.length > 2000 ? 'large' : text.length > 800 ? 'medium' : 'small';
    return {
      shouldBid: true,
      skipImmediately: false,
      reason: fromDevSearch ? 'システム/Web開発カテゴリの案件' : '開発キーワードを検出',
      projectSize: size
    };
  }

  return { shouldBid: false, skipImmediately: false, reason: null, projectSize: 'medium' };
}

export function calculateSmartBidAmount(budgetText, projectSize = 'medium') {
  const { min, max } = parseBudgetRange(budgetText);
  const ratioMap = { small: 0.45, medium: 0.6, large: 0.75 };
  const ratio = ratioMap[projectSize] || 0.6;

  if (min === max) return min;
  const amount = min + (max - min) * ratio;
  return Math.round(amount / 1000) * 1000;
}

export function calculateSmartCompletionDate(desiredDeadline, projectSize = 'medium', completionDaysFromAI) {
  if (completionDaysFromAI && completionDaysFromAI > 0) {
    const date = new Date();
    date.setDate(date.getDate() + completionDaysFromAI);
    return date;
  }

  const parsed = parseDesiredDeadline(desiredDeadline);
  if (parsed) return parsed;

  const defaultDays = { small: 14, medium: 30, large: 60 };
  const days = defaultDays[projectSize] || 30;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function parseDesiredDeadline(deadlineText) {
  if (!deadlineText) return null;

  const absolute = deadlineText.match(/(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/);
  if (absolute) {
    return new Date(parseInt(absolute[1]), parseInt(absolute[2]) - 1, parseInt(absolute[3]));
  }

  const withinMatch = deadlineText.match(/(\d+)\s*(日|週間|週|ヶ月|か月|月)/);
  if (withinMatch) {
    const num = parseInt(withinMatch[1], 10);
    const unit = withinMatch[2];
    const date = new Date();
    if (unit === '日') date.setDate(date.getDate() + num);
    else if (unit.includes('週')) date.setDate(date.getDate() + num * 7);
    else date.setMonth(date.getMonth() + num);
    return date;
  }

  return null;
}

function parseJsonFromResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch { /* ignore */ }
  return null;
}
