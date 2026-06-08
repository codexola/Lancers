export const SEARCH_URLS = [
  'https://www.lancers.jp/work/search/system?open=1&ref=header_menu',
  'https://www.lancers.jp/work/search/web?open=1&ref=header_menu'
];

export const MAX_PROPOSAL_TEXT_LENGTH = 2990;

export const POLL_INTERVAL_ACTIVE_MS = 4000;
export const POLL_INTERVAL_IDLE_MS = 60000;
export const IDLE_THRESHOLD_MS = 10000;

export const DEFAULT_SETTINGS = {
  isRunning: false,
  isFilteringEnabled: false,
  isBiddingEnabled: false,
  claudeApiKey: '',
  openaiApiKey: '',
  aiProvider: 'claude',
  bidPrompt: `あなたはプログラム開発のフリーランサーです。案件ごとに**異なる文体・構成**で提案文を日本語で作成してください。

## 基本方針
- クライアントの依頼内容・広告文を十分に読み取り、具体的に反映すること
- **案件ごとに提案文のフォーマットを変える**（同じ見出し構成・同じ挨拶の繰り返しは禁止）
- 提供される「この案件専用の提案文体・構成」指示に必ず従うこと

## 含めるべき要素（順序・形式は案件ごとに変える）
- 依頼内容への理解と対応方針
- 関連スキル・技術・実績
- スケジュール感
- 金額の根拠

## 制約
- 提案文（proposalText）は2990文字以内（絶対に超えない）
- 定型文・案内文・入札方法の説明は含めない
- 【案件理解】【対応内容】等の固定4項目テンプレートは使用禁止
- 実績リンクは案件要件に合致するもののみ記載

JSON形式で返してください：
{
  "shouldBid": true/false,
  "reason": "判定理由",
  "projectSize": "small"|"medium"|"large",
  "proposalText": "提案文の全文（2990文字以内）",
  "bidAmount": 数値（税抜、円）,
  "completionDays": 数値,
  "experienceText": "実績欄用テキスト"
}`,
  portfolioLinks: '',
  sampleBids: `例：以下の内訳でご提案させていただきます。
- 企画・デザイン構成＝20,000円
- トップページ(デザイン+コーディング) =70,000円
- 下層ページ（デザイン＋コーディング）＝15,000円×2P＝30,000円
詳細なことはメッセージで相談できればと思っております。`,
  maxProposalCount: 40,
  analysisPrompt: '',
  lastPollTime: null,
  lastNewProjectTime: null,
  seenProjectIds: [],
  projects: [],
  tasksLog: [],
  connectionStatus: {
    lancers: { connected: false, message: 'Not checked', checkedAt: null },
    claude: { connected: false, message: 'Not checked', checkedAt: null },
    openai: { connected: false, message: 'Not checked', checkedAt: null }
  },
  lastPollError: null,
  runtimeStatus: {
    phase: 'idle',
    message: '待機中',
    currentProjectId: null,
    currentProjectTitle: null,
    updatedAt: null
  },
  dashboardLogClearAfter: null,
  errorSolutions: {},
  errorResolutionSettings: {
    enabled: true,
    maxRetries: 3,
    lookupBeforeApi: true
  },
  useDualAi: true
};

export const EXCLUDE_KEYWORDS = [
  '画像生成', 'image generation', 'midjourney', 'stable diffusion', 'dall-e', 'dalle',
  '動画制作', '動画編集', 'video production', 'video editing', 'youtube編集', '映像制作',
  'マーケティング', 'marketing', 'SNS運用', 'sns運用', '広告運用', 'SEO対策', 'リスティング',
  'バーチャルアシスタント', 'virtual assistant', 'VA募集', '事務代行',
  'アダルト', 'adult', '風俗', 'エロ', '18禁',
  'パートナー募集', 'パートナーシップ', '提携募集', '代理店募集',
  '無料開発', '無償', 'タダ', 'free development', '実績作り', 'ポートフォリオ作成のため',
  'イラスト制作', 'illustration制作', 'ロゴデザイン', 'グラフィックデザインのみ',
  '翻訳', 'translation', '通訳',
  '撮影', 'photography', 'カメラマン',
  '音楽制作', 'music production', '作曲', 'ボイス収録', 'ナレーション収録'
];

export const INCLUDE_KEYWORDS = [
  '開発', 'プログラム', 'program', 'system', 'システム', 'web', 'アプリ', 'app',
  'php', 'python', 'javascript', 'typescript', 'react', 'vue', 'angular', 'node',
  'wordpress', 'laravel', 'django', 'ruby', 'rails', 'java', 'spring', 'c#', '.net',
  'api', 'database', 'db', 'sql', 'mysql', 'postgresql', 'mongodb',
  'scraping', 'スクレイピング', 'bot', '自動化', 'automation',
  'aws', 'cloud', 'docker', 'kubernetes', 'devops',
  'frontend', 'backend', 'fullstack', 'フルスタック',
  'ec-cube', 'shopify', 'woocommerce', 'cms',
  '修正', '改修', 'バグ', 'bug', 'fix', '保守', 'maintenance'
];
