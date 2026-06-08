/**
 * 案件ごとに異なる入札文構成・文体を選ぶ。
 * 同一テンプレート（【案件理解】等）の繰り返しを防ぐ。
 */

export const BID_FORMATS = [
  {
    id: 'narrative',
    name: '叙述・ストーリー型',
    instruction: `見出し・番号付きリストは使わない。自然な文章の流れで、挨拶→課題理解→解決アプローチ→実績→スケジュール→締めの順に書く。
段落は3〜5個。読み物として読める温かみのある文体。`
  },
  {
    id: 'technical_bullets',
    name: '技術提案・箇条書き型',
    instruction: `「ご依頼内容の理解」「技術的アプローチ」「使用技術」「開発ステップ」「納期・金額」をそれぞれ短い見出し（■や---）で区切る。
技術名・フレームワークを具体的に列挙。箇条書きを多用する実務的な文体。`
  },
  {
    id: 'qa_response',
    name: 'Q&A回答型',
    instruction: `クライアントの依頼を想定した質問形式で構成する。
例：「Q. なぜこの案件に適任ですか？」「Q. 具体的にどう進めますか？」「Q. 類似実績は？」
各Qに2〜4文で回答。フォーマルだが親しみやすい文体。`
  },
  {
    id: 'executive_summary',
    name: 'エグゼクティブサマリー型',
    instruction: `最初に3行以内の要約（結論・強み・納期）を置く。その後に詳細説明。
ビジネス向けの簡潔な文体。数字（日数・金額・実績件数）を前面に出す。`
  },
  {
    id: 'problem_solution',
    name: '課題→解決→証明型',
    instruction: `依頼文から読み取れる課題を1段落で言語化→解決策を2段落→類似実績・スキルで裏付け→スケジュール提示。
論理展開が明確な説得力重視の文体。`
  },
  {
    id: 'timeline_first',
    name: 'スケジュール先行型',
    instruction: `冒頭で週次またはフェーズ別のスケジュール表（テキスト）を示す。
その後、各フェーズの作業内容と依頼要件への対応を説明。納期重視案件向けの構成。`
  },
  {
    id: 'casual_direct',
    name: 'カジュアル・ダイレクト型',
    instruction: `「はじめまして」から入り、堅苦しい見出しは使わない。依頼内容に直接言及し、
「〜できます」「〜対応します」と断定的に書く。短文多め、テンポの良い文体。`
  },
  {
    id: 'formal_letter',
    name: '正式なビジネスレター型',
    instruction: `ビジネスメール形式。冒頭の挨拶、本文、結びの定型を守りつつ、依頼内容への言及を具体的に。
「拝啓」「敬具」は不要だが、丁寧語で統一したフォーマルな文体。`
  }
];

const PORTFOLIO_APPENDIX_STYLES = [
  '\n\n参考実績:\n',
  '\n\n類似案件の実績:\n',
  '\n\n▼ 関連ポートフォリオ\n',
  '\n\n【参考URL】\n',
  '\n\n過去の関連実績:\n'
];

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function detectToneBias(project) {
  const text = `${project.title || ''} ${project.description || ''}`;
  if (/急ぎ|至急|スピード|早急|すぐ/i.test(text)) return 'timeline_first';
  if (/要件定義|設計|アーキテクチャ|大規模|システム/i.test(text)) return 'technical_bullets';
  if (/シンプル|小さな|修正|バグ|軽微/i.test(text)) return 'casual_direct';
  if (/法人|企業|株式会社|ビジネス/i.test(text)) return 'formal_letter';
  return null;
}

export function selectBidFormat(project) {
  const bias = detectToneBias(project);
  if (bias) {
    const found = BID_FORMATS.find(f => f.id === bias);
    if (found) return found;
  }

  const seed = simpleHash(
    `${project.id}|${project.title || ''}|${project.searchSource || ''}|${(project.description || '').length}`
  );
  return BID_FORMATS[seed % BID_FORMATS.length];
}

export function getPortfolioAppendixStyle(project) {
  const seed = simpleHash(`${project.id}-appendix`);
  return PORTFOLIO_APPENDIX_STYLES[seed % PORTFOLIO_APPENDIX_STYLES.length];
}

export function buildFormatPromptSection(format) {
  return `## この案件専用の提案文体・構成（必須 — 他案件と同じ形式にしないこと）

**選定フォーマット:** ${format.name}（ID: ${format.id}）

${format.instruction}

**禁止事項:**
- 「【案件理解】【対応内容】【スケジュール】【金額】」等の固定4項目構成は使用禁止（本フォーマットに従うこと）
- 毎回同じ挨拶文・締め文のテンプレート繰り返し禁止
- 番号付きリスト 1.2.3.4.5 の汎用テンプレート禁止`;
}
