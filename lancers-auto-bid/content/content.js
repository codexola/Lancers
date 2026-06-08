const MAX_PROPOSAL_CHARS = 2990;

/** Lancers React 提案フォームのセレクタ */
const FORM_SELECTORS = {
  proposal: '.js-proposal-description, textarea.js-proposal-description, [class*="js-proposal-description"]',
  price: '[class*="css-9bh7w2"] input, [class*="css-9bh7w2"], input[class*="css-9bh7w2"]',
  datepicker: '.react-datepicker__input-container input, .react-datepicker-wrapper input, [class*="react-datepicker"] input',
  datepickerLoop: '.react-datepicker__tab-loop',
  estimateDetail: null
};

const LancersScraper = {
  isSearchPage() {
    return window.location.pathname.includes('/work/search/');
  },

  isProjectDetailPage() {
    return /\/work\/detail\/\d+/.test(window.location.pathname) &&
      !this.isBidFormPage() && !this.isConfirmPage();
  },

  isBidFormPage() {
    if (this.isConfirmPage()) return false;
    if (/\/propose/i.test(window.location.pathname)) return true;
    if (/\/work\/detail\/\d+\/proposal/.test(window.location.pathname)) return true;
    if (document.querySelector(FORM_SELECTORS.proposal)) return true;
    if (document.querySelector('textarea') && findButtonByText(['内容を確認する', '内容を確認'])) {
      return true;
    }
    return !!findFieldByLabel(['提案文', '提案金額', '契約金額', '完了予定日', '提案の具体', '見積もりの詳細']);
  },

  isConfirmPage() {
    const text = document.body.textContent;
    return text.includes('入力内容確認') ||
      text.includes('提案内容を確認') ||
      (text.includes('確認') && text.includes('完了') &&
        findButtonByText(['利用規約に同意して提案する', '提案内容を確認して提案する', 'この内容で提案する']));
  },

  isSuccessPage() {
    const text = document.body.textContent;
    return text.includes('提案が完了') ||
      text.includes('ご提案ありがとう') ||
      text.includes('提案を受け付け') ||
      (text.includes('提案') && text.includes('完了しました'));
  },

  scrapeSearchResults() {
    const projects = [];
    const seen = new Set();

    const selectors = [
      'a[href*="/work/detail/"]',
      '.p-search-job-list a[href*="/work/detail/"]',
      '.c-media a[href*="/work/detail/"]',
      '.p-work-list-item a[href*="/work/detail/"]',
      '[class*="job"] a[href*="/work/detail/"]',
      '[class*="work"] a[href*="/work/detail/"]'
    ];

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(link => {
        const href = link.href || link.getAttribute('href');
        if (!href) return;

        const match = href.match(/\/work\/detail\/(\d+)/);
        if (!match || seen.has(match[1])) return;
        seen.add(match[1]);

        const card = link.closest('[class*="item"], [class*="card"], [class*="media"], li, article') || link.parentElement;
        let title = '';
        let budget = '';
        let category = '';

        if (card) {
          const titleEl = card.querySelector('[class*="title"], h2, h3, .c-media__title');
          title = titleEl ? titleEl.textContent.trim() : link.textContent.trim();
          const budgetEl = card.querySelector('[class*="budget"], [class*="price"], [class*="reward"]');
          budget = budgetEl ? budgetEl.textContent.trim() : '';
          const catEl = card.querySelector('[class*="category"], [class*="tag"], [class*="label"]');
          category = catEl ? catEl.textContent.trim() : '';
        } else {
          title = link.textContent.trim();
        }

        if (title && title.length > 3) {
          projects.push({
            id: match[1],
            url: `https://www.lancers.jp/work/detail/${match[1]}`,
            title,
            budget,
            category,
            scrapedAt: new Date().toISOString()
          });
        }
      });
    }

    return projects;
  },

  scrapeProjectDetail() {
    const titleSelectors = [
      'h1.p-work-detail__title',
      'h1[class*="title"]',
      '.p-work-detail h1',
      'h1'
    ];

    let title = '';
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        title = el.textContent.trim();
        break;
      }
    }

    let budget = '';
    const pageText = document.body.textContent;
    const budgetPatterns = [
      /(\d[\d,]*)\s*円\s*[〜~－-]\s*(\d[\d,]*)\s*円/,
      /(\d[\d,]*)\s*円/
    ];
    for (const pattern of budgetPatterns) {
      const match = pageText.match(pattern);
      if (match) { budget = match[0]; break; }
    }

    let description = '';
    const descSelectors = [
      '.p-work-detail__description',
      '.p-work-detail__body',
      '[class*="description"]',
      '[class*="detail-body"]',
      '.p-work-detail__content'
    ];
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 50) {
        description = el.textContent.trim();
        break;
      }
    }

    const idMatch = window.location.pathname.match(/\/work\/detail\/(\d+)/);
    return {
      id: idMatch ? idMatch[1] : null,
      url: window.location.href,
      title,
      budget,
      description: description.substring(0, 5000),
      scrapedAt: new Date().toISOString()
    };
  },

  /** 案件詳細ページの「提案する」ボタン */
  findProposeButton() {
    const proposeLinks = [...document.querySelectorAll('a[href*="propose"], a[href*="proposal"]')]
      .filter(isVisible);
    for (const a of proposeLinks) {
      const text = normalizeText(a.textContent || '');
      if (text.includes('提案する')) return a;
    }

    const visible = [...document.querySelectorAll('a, button, [role="button"]')]
      .filter(el => isVisible(el));

    for (const btn of visible) {
      const text = normalizeText(btn.textContent || btn.value || '');
      if (text === '提案する') return btn;
    }

    for (const btn of visible) {
      const text = normalizeText(btn.textContent || '');
      if (text.includes('提案する') &&
          !text.includes('提案一覧') &&
          !text.includes('提案を選') &&
          !text.includes('提案内容を確認')) {
        return btn;
      }
    }

    for (const a of document.querySelectorAll('a[href*="propose"]')) {
      if (isVisible(a)) return a;
    }
    return null;
  },

  async fillBidForm(bidData) {
    await sleep(500);
    await checkNdaAgreement();
    await sleep(300);

    const proposalFilled = await fillProposalText(bidData.proposalText);
    await sleep(300);

    if (bidData.experienceText) {
      await fillExperienceText(bidData.experienceText);
      await sleep(150);
    }

    if (bidData.estimateDetail) {
      await fillEstimateDetail(bidData.estimateDetail);
      await sleep(200);
    }

    await handleAiUtilizationCheckbox(bidData);
    await sleep(200);

    const amountFilled = await fillBidAmount(bidData.bidAmount);
    await sleep(300);

    await fillCompletionDate(bidData.completionDate);
    await sleep(400);

    const hasPhaseForm = detectPhasePricingForm();
    if (hasPhaseForm && bidData.phases?.length) {
      await fillPhasePricing(bidData.phases, bidData.completionDate);
      await sleep(300);
    }

    return { proposalFilled, amountFilled, hasPhaseForm };
  },

  /** 黒枠: フォームページ「内容を確認する」 */
  async clickConfirmButton() {
    await sleep(400);
    return clickByTextOrdered([
      '内容を確認する',
      '内容を確認'
    ], { excludeConfirmPage: true });
  },

  /** 黒枠: 確認ページ「利用規約に同意して提案する」等 */
  async clickFinalSubmitButton() {
    await sleep(400);
    return clickByTextOrdered([
      '利用規約に同意して提案する',
      '提案内容を確認して提案する',
      'この内容で提案する'
    ]);
  },

  getPageType() {
    if (this.isSuccessPage()) return 'success';
    if (this.isConfirmPage()) return 'confirm';
    if (this.isBidFormPage()) return 'bidForm';
    if (this.isProjectDetailPage()) return 'detail';
    if (this.isSearchPage()) return 'search';
    return 'unknown';
  },

  getBidDiagnostics() {
    const buttons = [...document.querySelectorAll(
      'a, button, input[type="submit"], input[type="button"], [role="button"]'
    )]
      .filter(isVisible)
      .slice(0, 30)
      .map(el => normalizeText(el.textContent || el.value || el.getAttribute('aria-label') || ''))
      .filter(Boolean);

    const ndaUnchecked = [...document.querySelectorAll('input[type="checkbox"]')].some(cb => {
      const ctx = getFieldContext(cb);
      return /秘密保持|NDA|機密保持|同意/.test(ctx) && !cb.checked;
    });

    return {
      pageType: this.getPageType(),
      url: window.location.href,
      buttons,
      hasTextarea: !!document.querySelector('textarea'),
      hasProposalField: !!findProposalField(),
      hasAmountField: !!findPriceField(),
      hasDateField: !!findDatepickerInput(),
      hasEstimateDetail: !!findEstimateDetailField(),
      ndaUnchecked
    };
  },

  failResult(error, errorCode) {
    return {
      success: false,
      error,
      errorCode,
      pageType: this.getPageType()
    };
  },

  async executeBidSequence(bidData, timeoutMs = 30000, meta = {}) {
    const deadline = Date.now() + timeoutMs;
    const report = (message) => {
      chrome.runtime.sendMessage({
        action: 'bidProgress',
        message,
        projectId: meta.projectId,
        projectTitle: meta.projectTitle
      }).catch(() => {});
    };

    if (meta.projectUrl) {
      const expectedId = meta.projectUrl.match(/detail\/(\d+)/)?.[1];
      const path = window.location.pathname;
      const currentId = path.match(/detail\/(\d+)/)?.[1]
        || path.match(/propose\/(\d+)/)?.[1]
        || path.match(/proposal\/(\d+)/)?.[1];
      if (expectedId && currentId && expectedId !== currentId) {
        return this.failResult(
          '前の案件のページが残っています（URL不一致）',
          'PROJECT_URL_MISMATCH'
        );
      }
    }

    if (this.isSuccessPage()) {
      return this.failResult(
        '前回の入札完了画面が表示されています — 新規タブが必要です',
        'STALE_PAGE_STATE'
      );
    }

    if (this.isConfirmPage()) {
      return this.failResult(
        '前回の確認ページが残っています — 新規タブが必要です',
        'STALE_PAGE_STATE'
      );
    }

    if (this.isBidFormPage()) {
      return this.failResult(
        '前回の提案フォームが残っています — 新規タブが必要です',
        'STALE_PAGE_STATE'
      );
    }

    if (bidData.completionDate && typeof bidData.completionDate === 'string') {
      bidData.completionDate = new Date(bidData.completionDate);
    }

    // Step 1: 案件詳細 → 「提案する」クリック
    if (!this.isBidFormPage() && !this.isConfirmPage()) {
      report('「提案する」ボタンをクリック中...');
      const btn = this.findProposeButton();
      if (!btn) {
        return this.failResult(
          '提案するボタンが見つかりません（案件詳細ページ）',
          'PROPOSE_BUTTON_MISSING'
        );
      }
      clickElement(btn);

      const formReady = await waitForCondition(
        () => this.isBidFormPage() || !!document.querySelector(FORM_SELECTORS.proposal),
        Math.min(18000, deadline - Date.now()),
        400
      );
      if (!formReady) {
        return this.failResult('提案フォームの読み込みタイムアウト', 'FORM_LOAD_TIMEOUT');
      }
      await sleep(2000);
    }

    // Step 2: 提案フォーム入力 → 「内容を確認する」
    if (!this.isConfirmPage()) {
      report('提案フォームに入力中...');
      const fillResult = await this.fillBidForm(bidData);
      if (!fillResult.proposalFilled) {
        return this.failResult('提案文の入力に失敗しました', 'PROPOSAL_FILL_FAILED');
      }

      report('「内容を確認する」をクリック中...');
      const confirmed = await this.clickConfirmButton();
      if (!confirmed) {
        return this.failResult('「内容を確認する」ボタンが見つかりません', 'CONFIRM_BUTTON_MISSING');
      }

      const confirmReady = await waitForCondition(
        () => this.isConfirmPage(),
        Math.min(10000, deadline - Date.now()),
        300
      );
      if (!confirmReady) {
        return this.failResult('確認ページの読み込みタイムアウト', 'CONFIRM_PAGE_TIMEOUT');
      }
      await sleep(800);
    }

    // Step 3: 確認ページ → 最終送信
    report('最終送信ボタンをクリック中...');
    const submitted = await this.clickFinalSubmitButton();
    if (!submitted) {
      return this.failResult(
        '最終送信ボタンが見つかりません（確認ページ）',
        'SUBMIT_BUTTON_MISSING'
      );
    }

    report('入札完了を確認中...');
    const success = await waitForCondition(
      () => this.isSuccessPage(),
      Math.min(10000, deadline - Date.now()),
      300
    );

    return {
      success,
      error: success ? null : '提案完了画面の確認に失敗しました',
      errorCode: success ? null : 'SUCCESS_PAGE_TIMEOUT',
      pageType: this.getPageType()
    };
  }
};

/** 秘密保持契約チェックボックス（ある場合のみ） */
async function checkNdaAgreement() {
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  for (const cb of checkboxes) {
    const ctx = getFieldContext(cb);
    const label = findCheckboxLabel(cb);
    const labelText = label?.textContent || ctx;
    if (/秘密保持契約書の内容を確認した上で同意|秘密保持契約|NDA|機密保持/.test(labelText) && !cb.checked) {
      clickElement(cb);
      await sleep(150);
    }
  }
}

function findCheckboxLabel(cb) {
  if (cb.id) {
    const label = document.querySelector(`label[for="${cb.id}"]`);
    if (label) return label;
  }
  return cb.closest('label') || cb.parentElement?.querySelector('label');
}

/** 提案文: .js-proposal-description — 既存テキストを全削除してAPI生成文を入力 */
async function fillProposalText(text) {
  const cleanText = String(text || '').substring(0, MAX_PROPOSAL_CHARS);
  if (!cleanText) return false;

  const field = findProposalField();
  if (!field) {
    const byLabel = findFieldByLabel(['提案文', '提案の具体', '提案したい内容', '提案内容']);
    if (byLabel) return await setFieldValue(byLabel, cleanText);
    return false;
  }

  return await setFieldValue(field, cleanText);
}

function findProposalField() {
  for (const sel of FORM_SELECTORS.proposal.split(', ')) {
    const el = document.querySelector(sel.trim());
    if (el && isVisible(el)) return el;
  }
  return null;
}

/** 見積もりの詳細（Web案件）— 既存テキストを全削除してAPI生成文を入力 */
async function fillEstimateDetail(text) {
  const detail = String(text || '').trim();
  if (!detail) return false;

  const field = findEstimateDetailField();
  if (!field) return false;

  return await setFieldValue(field, detail.substring(0, MAX_PROPOSAL_CHARS));
}

function findEstimateDetailField() {
  const byLabel = findFieldByLabel(['見積もりの詳細', '見積もり詳細', '見積詳細', '見積内訳']);
  if (byLabel) return byLabel;

  const textareas = [...document.querySelectorAll('textarea')]
    .filter(el => isVisible(el) && !el.classList.contains('js-proposal-description') &&
      !el.matches(FORM_SELECTORS.proposal));

  for (const ta of textareas) {
    const ctx = getFieldContext(ta);
    if (/見積|内訳|詳細/.test(ctx)) return ta;
  }
  return null;
}

/** 生成AI必須チェックボックス — 案件内容に応じて選択 */
async function handleAiUtilizationCheckbox(bidData) {
  const projectText = `${bidData.proposalText || ''}`;
  const needsAi = /ai|生成ai|chatgpt|claude|gemini|openai|人工知能|機械学習/i.test(projectText);

  for (const cb of document.querySelectorAll('input[type="checkbox"]')) {
    const label = findCheckboxLabel(cb);
    const labelText = (label?.textContent || getFieldContext(cb));
    if (!/生成AI|AI活用|AI利用|AI必須|ai.*利用/i.test(labelText)) continue;

    const isRequired = /必須|同意/.test(labelText);
    if (isRequired || needsAi) {
      if (!cb.checked) {
        clickElement(cb);
        await sleep(100);
      }
    }
  }
}

/** テキストエリア / contenteditable / React input 共通の値設定 */
async function setFieldValue(element, text) {
  if (!element) return false;

  element.focus();
  await sleep(100);

  if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
    element.textContent = '';
    element.innerHTML = '';
    await sleep(50);
    element.textContent = text;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(100);
    return (element.textContent || '').includes(text.substring(0, 40));
  }

  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    return await clearAndSetTextarea(element, text);
  }

  return false;
}

/** テキストエリア内の案内文・定型文を完全削除してから新規テキストのみ設定 */
async function clearAndSetTextarea(element, text) {
  element.focus();
  await sleep(150);

  setInputValue(element, '');
  await sleep(80);

  if (typeof element.select === 'function') {
    element.select();
    await sleep(30);
  }

  try {
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
  } catch { /* ignore */ }

  setInputValue(element, '');
  await sleep(80);
  setInputValue(element, text);
  await sleep(100);

  const current = element.value || '';
  const textStart = text.substring(0, Math.min(80, text.length));
  const isClean = current === text ||
    (current.includes(textStart) && current.length <= text.length + 50);

  if (!isClean) {
    const proto = HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(element, '');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(50);
      setter.call(element, text);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  element.dispatchEvent(new Event('blur', { bubbles: true }));
  await sleep(50);

  const final = element.value || '';
  return final.includes(text.substring(0, 40)) && final.length <= MAX_PROPOSAL_CHARS + 10;
}

async function fillExperienceText(text) {
  const ta = findFieldByLabel(['自己PR', '実績', '経歴', 'ポートフォリオ']);
  if (ta && ta.tagName === 'TEXTAREA') {
    await clearAndSetTextarea(ta, String(text).substring(0, MAX_PROPOSAL_CHARS));
  }
}

/** Web案件: 計画セクションのフェーズ別価格フォームを検出 */
function detectPhasePricingForm() {
  const planSection = findSectionByHeading(['計画', '支払い計画', 'フェーズ', '工程']);
  if (!planSection) return false;

  const amountInputs = [...planSection.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"], input:not([type])')]
    .filter(el => isVisible(el) && /金額|報酬|price|amount|税抜|単価/.test(getFieldContext(el)));

  return amountInputs.length >= 2;
}

function findSectionByHeading(keywords) {
  for (const heading of document.querySelectorAll('h2, h3, h4, legend, .section-title, [class*="heading"]')) {
    const text = heading.textContent || '';
    if (!keywords.some(kw => text.includes(kw))) continue;
    const section = heading.closest('section, fieldset, div[class*="section"], div[class*="plan"]') ||
      heading.parentElement?.parentElement;
    if (section) return section;
  }
  return null;
}

/** フェーズ別価格入力 — 既存のプリセット値をすべて削除してからAPI生成値を入力 */
async function fillPhasePricing(phases, fallbackDate) {
  const planSection = findSectionByHeading(['計画', '支払い計画', 'フェーズ', '工程']) || document.body;

  const rows = findPhaseRows(planSection);
  if (rows.length === 0) return false;

  let filled = 0;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const row = rows[i] || rows[rows.length - 1];

    if (row.titleInput) {
      setInputValue(row.titleInput, '');
      await sleep(50);
      setInputValue(row.titleInput, phase.title);
    }

    if (row.amountInput) {
      setInputValue(row.amountInput, '');
      await sleep(50);
      setInputValue(row.amountInput, String(phase.amount).replace(/,/g, ''));
    }

    if (row.dateInput) {
      const date = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
      if (phase.completionDays) {
        date.setDate(date.getDate() - (phases[phases.length - 1].completionDays - phase.completionDays));
      }
      setInputValue(row.dateInput, '');
      await sleep(50);
      await fillCompletionDateOnInput(row.dateInput, date);
    }

    filled++;
    await sleep(150);
  }

  return filled > 0;
}

function findPhaseRows(container) {
  const rows = [];
  const rowCandidates = container.querySelectorAll(
    'tr, [class*="row"], [class*="phase"], [class*="plan-item"], li[class*="item"], div[class*="field-group"]'
  );

  for (const row of rowCandidates) {
    const inputs = [...row.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])')]
      .filter(isVisible);
    if (inputs.length < 1) continue;

    const titleInput = inputs.find(inp => /title|タイトル|項目|名称|name/i.test(getFieldContext(inp))) ||
      inputs.find(inp => inp.type === 'text' && !/金額|date|日/.test(getFieldContext(inp)));
    const amountInput = inputs.find(inp => /金額|報酬|price|amount|税抜|単価/.test(getFieldContext(inp))) ||
      inputs.find(inp => inp.type === 'number' || inp.type === 'tel');
    const dateInput = inputs.find(inp => /完了|納期|予定日|date/i.test(getFieldContext(inp)));

    if (amountInput) {
      rows.push({ titleInput, amountInput, dateInput });
    }
  }

  if (rows.length === 0) {
    const allAmountInputs = [...container.querySelectorAll('input')]
      .filter(el => isVisible(el) && /金額|報酬|price|amount|税抜|単価/.test(getFieldContext(el)));
    for (const amountInput of allAmountInputs) {
      const parent = amountInput.closest('tr, div, li, fieldset') || amountInput.parentElement;
      const titleInput = parent?.querySelector('input[type="text"]:not([readonly])');
      const dateInput = parent?.querySelector('input[type="date"], input[readonly]');
      rows.push({ titleInput, amountInput, dateInput });
    }
  }

  return rows;
}

async function fillCompletionDateOnInput(input, date) {
  const formats = [
    formatDate(date),
    formatDate(date).replace(/\//g, '-'),
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  ];
  clickElement(input);
  await sleep(200);
  setInputValue(input, formats[0]);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await trySelectDateInCalendar(date);
}

/** 提案金額: [class*="css-9bh7w2"] — 既存値を削除してから入力 */
async function fillBidAmount(amount) {
  const amountStr = String(amount).replace(/,/g, '');

  const priceField = findPriceField();
  if (priceField) {
    setReactInputValue(priceField, '');
    await sleep(80);
    setReactInputValue(priceField, amountStr);
    return true;
  }

  const byLabel = findFieldByLabel(['提案金額', '契約金額', '税抜', '報酬', '提示金額']);
  if (byLabel && (byLabel.tagName === 'INPUT' || byLabel.tagName === 'TEXTAREA')) {
    setReactInputValue(byLabel, '');
    await sleep(50);
    setReactInputValue(byLabel, amountStr);
    return true;
  }

  for (const input of document.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"], input:not([type])')) {
    if (!isVisible(input)) continue;
    const ctx = getFieldContext(input);
    if (/金額|報酬|price|amount|税抜|契約|提示/.test(ctx) && !/手数料|合計|fee/i.test(ctx)) {
      setReactInputValue(input, '');
      await sleep(50);
      setReactInputValue(input, amountStr);
      return true;
    }
  }
  return false;
}

function findPriceField() {
  for (const sel of FORM_SELECTORS.price.split(', ')) {
    const el = document.querySelector(sel.trim());
    if (!el || !isVisible(el)) continue;
    if (el.tagName === 'INPUT') return el;
    const inner = el.querySelector('input');
    if (inner && isVisible(inner)) return inner;
  }
  return null;
}

/** 完了予定日: react-datepicker — カレンダーから日付を選択 */
async function fillCompletionDate(date) {
  if (!date) return;
  const d = date instanceof Date ? date : new Date(date);

  const dateInput = findDatepickerInput();
  if (dateInput) {
    await fillReactDatepicker(dateInput, d);
    return;
  }

  const byLabel = findFieldByLabel(['完了予定日', '完了予定', '納期', '希望納期']);
  if (byLabel && byLabel.tagName === 'INPUT') {
    await fillReactDatepicker(byLabel, d);
    return;
  }

  for (const input of document.querySelectorAll('input[type="date"], input[type="text"], input[readonly]')) {
    if (!isVisible(input)) continue;
    const ctx = getFieldContext(input);
    if (/完了|納期|予定日|deadline|date/i.test(ctx)) {
      await fillReactDatepicker(input, d);
      return;
    }
  }

  await trySelectDateInCalendar(d);
}

function findDatepickerInput() {
  for (const sel of FORM_SELECTORS.datepicker.split(', ')) {
    const el = document.querySelector(sel.trim());
    if (el && isVisible(el)) return el;
  }

  const loop = document.querySelector(FORM_SELECTORS.datepickerLoop);
  if (loop) {
    const input = loop.closest('div')?.querySelector('input') ||
      document.querySelector('.react-datepicker-wrapper input');
    if (input && isVisible(input)) return input;
  }

  return null;
}

async function fillReactDatepicker(input, targetDate) {
  clickElement(input);
  await sleep(600);

  const formats = [
    formatDate(targetDate),
    `${targetDate.getFullYear()}/${String(targetDate.getMonth() + 1).padStart(2, '0')}/${String(targetDate.getDate()).padStart(2, '0')}`,
    `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
  ];

  for (const fmt of formats) {
    setReactInputValue(input, fmt);
    await sleep(200);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(200);
  }

  if (await selectDateInReactDatepicker(targetDate)) return;

  await trySelectDateInCalendar(targetDate);
}

async function selectDateInReactDatepicker(targetDate) {
  const day = targetDate.getDate();
  const month = targetDate.getMonth();
  const year = targetDate.getFullYear();

  for (let i = 0; i < 24; i++) {
    const header = document.querySelector('.react-datepicker__current-month, [class*="current-month"]');
    const headerText = header?.textContent || document.body.textContent;

    const monthYearMatch = headerText.match(/(\d{4})年\s*(\d{1,2})月/) ||
      headerText.match(/([A-Za-z]+)\s+(\d{4})/);
    if (monthYearMatch) {
      let calYear, calMonth;
      if (monthYearMatch[0].includes('年')) {
        calYear = parseInt(monthYearMatch[1], 10);
        calMonth = parseInt(monthYearMatch[2], 10) - 1;
      } else {
        calYear = parseInt(monthYearMatch[2], 10);
        calMonth = new Date(`${monthYearMatch[1]} 1, ${calYear}`).getMonth();
      }
      if (calYear === year && calMonth === month) break;

      const nextBtn = document.querySelector('.react-datepicker__navigation--next, [class*="navigation--next"]');
      const prevBtn = document.querySelector('.react-datepicker__navigation--previous, [class*="navigation--previous"]');
      const needForward = calYear < year || (calYear === year && calMonth < month);
      const navBtn = needForward ? nextBtn : prevBtn;
      if (navBtn) { clickElement(navBtn); await sleep(350); continue; }
    }
    break;
  }

  const dayEls = [...document.querySelectorAll(
    '.react-datepicker__day:not(.react-datepicker__day--disabled):not(.react-datepicker__day--outside-month), ' +
    '[class*="react-datepicker__day"]:not([class*="disabled"]):not([class*="outside-month"])'
  )].filter(isVisible);

  for (const el of dayEls) {
    const t = el.textContent.trim();
    const ariaLabel = el.getAttribute('aria-label') || '';
    if (t === String(day) || ariaLabel.includes(`${year}`) && ariaLabel.includes(`${day}`)) {
      clickElement(el);
      await sleep(400);
      return true;
    }
  }
  return false;
}

async function trySelectDateInCalendar(targetDate) {
  const day = targetDate.getDate();
  const month = targetDate.getMonth();
  const year = targetDate.getFullYear();

  for (let i = 0; i < 24; i++) {
    const calText = document.body.textContent;
    const yearMatch = calText.match(/(\d{4})\s*年/);
    const monthMatch = calText.match(/(\d{1,2})\s*月/);

    if (yearMatch && monthMatch) {
      const calYear = parseInt(yearMatch[1], 10);
      const calMonth = parseInt(monthMatch[1], 10) - 1;
      if (calYear === year && calMonth === month) break;
      const nextBtn = [...document.querySelectorAll('button, a, span, [class*="next"]')]
        .find(el => isVisible(el) && /次|>|next|›/i.test(el.textContent || el.className || ''));
      if (nextBtn) { clickElement(nextBtn); await sleep(300); continue; }
    }
    break;
  }

  const dayEls = [...document.querySelectorAll(
    'td, button, span, a, [class*="day"], [class*="Day"]'
  )].filter(isVisible);

  for (const el of dayEls) {
    const t = el.textContent.trim();
    if (t === String(day) && !el.classList.contains('disabled') && !el.getAttribute('aria-disabled')) {
      clickElement(el);
      await sleep(300);
      return true;
    }
  }
  return false;
}

function findFieldByLabel(keywords) {
  for (const label of document.querySelectorAll('label, dt, th, legend, h2, h3, h4, .label, [class*="label"]')) {
    const text = label.textContent || '';
    if (!keywords.some(kw => text.includes(kw))) continue;

    if (label.htmlFor) {
      const el = document.getElementById(label.htmlFor);
      if (el) return el;
    }

    const sibling = label.nextElementSibling;
    if (sibling) {
      const input = sibling.querySelector('input, textarea, select') ||
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(sibling.tagName) ? sibling : null);
      if (input) return input;
    }

    const parent = label.closest('tr, dl, div, section, li, fieldset');
    if (parent) {
      const input = parent.querySelector('input:not([type="hidden"]), textarea, select');
      if (input && isVisible(input)) return input;
    }
  }

  for (const input of document.querySelectorAll('input:not([type="hidden"]), textarea')) {
    const ctx = getFieldContext(input);
    if (keywords.some(kw => ctx.includes(kw))) return input;
  }
  return null;
}

function getFieldContext(el) {
  const parts = [];
  const section = el.closest('section, fieldset, tr, dl, div[class*="form"], div[class*="field"], li');
  if (section) parts.push(section.textContent.substring(0, 200));
  if (el.name) parts.push(el.name);
  if (el.id) parts.push(el.id);
  if (el.placeholder) parts.push(el.placeholder);
  if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
  return parts.join(' ');
}

function findButtonByText(textList) {
  return clickByTextOrdered(textList, { dryRun: true });
}

function clickByTextOrdered(textList, { excludeConfirmPage = false, dryRun = false } = {}) {
  if (excludeConfirmPage && LancersScraper.isConfirmPage()) return false;

  const buttons = [...document.querySelectorAll(
    'a, button, input[type="submit"], input[type="button"], [role="button"]'
  )].filter(el => isVisible(el) && !el.disabled);

  for (const target of textList) {
    const normTarget = normalizeText(target);
    for (const btn of buttons) {
      const text = normalizeText(btn.textContent || btn.value || btn.getAttribute('aria-label') || '');
      if (text === normTarget || text.includes(normTarget)) {
        if (dryRun) return btn;
        clickElement(btn);
        return true;
      }
    }
  }
  return false;
}

function normalizeText(s) {
  return (s || '').replace(/\s+/g, '').trim();
}

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' &&
    el.offsetWidth > 0 && el.offsetHeight > 0;
}

function setInputValue(element, value) {
  setReactInputValue(element, value);
}

/** React controlled input 対応の値設定 */
function setReactInputValue(element, value) {
  try {
    const proto = element.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
  } catch {
    element.value = value;
  }
  element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function clickElement(el) {
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  if (typeof el.click === 'function') {
    try { el.click(); } catch { /* ignore */ }
  }
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCondition(checkFn, timeoutMs, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (checkFn()) return true;
    await sleep(intervalMs);
  }
  return checkFn();
}

async function applyBidFix(fix, bidData) {
  if (!fix || !fix.action) return { applied: false, error: '修復アクションがありません' };

  if (fix.extraWaitBefore) await sleep(fix.extraWaitBefore);
  if (fix.waitMs && fix.action === 'wait') await sleep(fix.waitMs);

  switch (fix.action) {
    case 'wait':
      return { applied: true };

    case 'scroll':
      if (fix.scrollTo === 'bottom') {
        window.scrollTo(0, document.body.scrollHeight);
      } else {
        window.scrollTo(0, 0);
      }
      await sleep(500);
      return { applied: true };

    case 'clickByText': {
      const clicked = clickByTextOrdered(fix.buttonTexts || []);
      return { applied: clicked, error: clicked ? null : 'ボタンが見つかりません' };
    }

    case 'clickSelector': {
      const el = document.querySelector(fix.selector);
      if (!el) return { applied: false, error: `セレクタが見つかりません: ${fix.selector}` };
      clickElement(el);
      return { applied: true };
    }

    case 'scrollAndClick': {
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(600);
      const clicked = clickByTextOrdered(fix.buttonTexts || []);
      return { applied: clicked, error: clicked ? null : 'スクロール後もボタンが見つかりません' };
    }

    case 'checkNda':
      await checkNdaAgreement();
      return { applied: true };

    case 'reload':
      location.reload();
      await sleep(3000);
      return { applied: true, needsReloadWait: true };

    case 'refillForm':
      if (bidData) {
        const result = await LancersScraper.fillBidForm(bidData);
        return { applied: result.proposalFilled, error: result.proposalFilled ? null : '再入力失敗' };
      }
      return { applied: false, error: 'bidDataがありません' };

    default:
      return { applied: false, error: `不明なアクション: ${fix.action}` };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ success: false, error: err.message || String(err) });
  });
  return true;
});

async function handleMessage(message) {
  switch (message.action) {
    case 'scrapeSearch':
      return { projects: LancersScraper.scrapeSearchResults() };
    case 'scrapeDetail':
      return { project: LancersScraper.scrapeProjectDetail() };
    case 'getPageType':
      return { pageType: LancersScraper.getPageType() };
    case 'clickPropose': {
      const btn = LancersScraper.findProposeButton();
      if (btn) { clickElement(btn); return { clicked: true }; }
      return { clicked: false, error: '提案するボタンが見つかりません' };
    }
    case 'fillBidForm':
      return await LancersScraper.fillBidForm(message.bidData);
    case 'clickConfirm':
      return { clicked: await LancersScraper.clickConfirmButton() };
    case 'clickFinalSubmit':
      return { clicked: await LancersScraper.clickFinalSubmitButton() };
    case 'getBidDiagnostics':
      return LancersScraper.getBidDiagnostics();
    case 'applyBidFix':
      return await applyBidFix(message.fix, message.bidData);
    case 'executeBidSequence':
      try {
        return await LancersScraper.executeBidSequence(
          message.bidData,
          message.timeoutMs || 30000,
          {
            projectId: message.projectId,
            projectTitle: message.projectTitle,
            projectUrl: message.projectUrl
          }
        );
      } catch (err) {
        return { success: false, error: err.message || String(err) };
      }
    case 'waitForPage':
      await sleep(message.ms || 2000);
      return { pageType: LancersScraper.getPageType() };
    default:
      return { error: 'Unknown action' };
  }
}
