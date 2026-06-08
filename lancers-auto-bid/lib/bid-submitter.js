import { submitBidViaContentScript } from './bid-via-tab.js';

/** 入札は Lancers の多段階フォームのため DOM 操作（コンテンツスクリプト）で送信 */
export async function submitBid(project, bidData, settings) {
  return submitBidViaContentScript(project, bidData, settings);
}

export { submitBidViaContentScript };
