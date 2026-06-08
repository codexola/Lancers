import { fetchPageHtml, isLoginPage } from './fetch.js';
import {
  scrapeSearchResultsFromHtml,
  scrapeProjectDetailFromHtml
} from './scraper.js';

export { scrapeSearchResultsFromHtml, scrapeProjectDetailFromHtml, extractProposalCount } from './scraper.js';

export async function fetchAndScrapeSearch(url) {
  const html = await fetchPageHtml(url);
  if (isLoginPage(html)) {
    throw new Error('LOGIN_REQUIRED');
  }
  const projects = scrapeSearchResultsFromHtml(html);
  return { projects, method: 'fetch' };
}

export async function fetchAndScrapeDetail(url) {
  const html = await fetchPageHtml(url);
  if (isLoginPage(html)) {
    throw new Error('LOGIN_REQUIRED');
  }
  return scrapeProjectDetailFromHtml(html, url);
}
