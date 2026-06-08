import { EXCLUDE_KEYWORDS, INCLUDE_KEYWORDS } from './constants.js';

export function shouldBidOnProject(project) {
  const text = [
    project.title || '',
    project.description || '',
    project.category || '',
    project.budget || ''
  ].join(' ').toLowerCase();

  for (const keyword of EXCLUDE_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      return {
        shouldBid: false,
        reason: `除外キーワード「${keyword}」が含まれています（プログラム開発以外の案件）`
      };
    }
  }

  const hasIncludeKeyword = INCLUDE_KEYWORDS.some(kw =>
    text.includes(kw.toLowerCase())
  );

  if (!hasIncludeKeyword) {
    return {
      shouldBid: false,
      reason: 'プログラム開発に関連するキーワードが見つかりませんでした'
    };
  }

  if (project.budget) {
    const budgetMatch = project.budget.match(/(\d[\d,]*)\s*円/g);
    if (budgetMatch) {
      const amounts = budgetMatch.map(m =>
        parseInt(m.replace(/[,円\s]/g, ''), 10)
      );
      const maxBudget = Math.max(...amounts);
      if (maxBudget > 0 && maxBudget < 10000) {
        return {
          shouldBid: false,
          reason: `予算が低すぎます（${project.budget}）`
        };
      }
    }
  }

  return { shouldBid: true, reason: null };
}

export function parseBudgetRange(budgetText) {
  if (!budgetText) return { min: 50000, max: 150000 };

  const numbers = budgetText.match(/[\d,]+/g);
  if (!numbers || numbers.length === 0) {
    return { min: 50000, max: 150000 };
  }

  const amounts = numbers.map(n => parseInt(n.replace(/,/g, ''), 10));
  if (amounts.length === 1) {
    return { min: amounts[0], max: amounts[0] };
  }
  return { min: Math.min(...amounts), max: Math.max(...amounts) };
}

export function calculateBidAmount(budgetText) {
  const { min, max } = parseBudgetRange(budgetText);
  if (min === max) return min;
  return Math.round((min + max) / 2 / 1000) * 1000;
}

export function calculateCompletionDate(daysFromNow = 30) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
}

export function formatDateForLancers(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}
