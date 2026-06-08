# Lancers Auto Bid - Chrome Extension

Automatically monitors [Lancers.jp](https://www.lancers.jp) for new system/web development projects and submits AI-generated bids within seconds.

## Features

- **Real-time monitoring** of two search URLs:
  - System development: `https://www.lancers.jp/work/search/system?open=1&ref=header_menu`
  - Web development: `https://www.lancers.jp/work/search/web?open=1&ref=header_menu`
- **Separate controls** for filtering (monitoring) and bidding
- **Adaptive polling**: every 4 seconds when new projects appear, every 60 seconds during idle periods
- **AI bid generation** via Claude (Anthropic) and/or OpenAI (dual-AI merge)
- **Re-bidding** at proposal count milestones: 40, 60, 80, 100+
- **Phase pricing** for Web/LP projects with multi-row price forms
- **Automated bidding** fills proposal form, amount, completion date, NDA checkbox, and submits
- **Error recovery** via Claude/OpenAI when bidding DOM issues occur
- **Dashboard** with settings persistence, auto-save, sample bids, portfolio links

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `lancers-auto-bid` folder
5. Click the extension icon to open the dashboard

## Setup

1. Open the dashboard (click extension icon or go to extension options)
2. Enter your **Claude API Key** and/or **OpenAI API Key**
3. Select your preferred AI provider
4. Customize the bid generation prompt and add sample bids
5. Add portfolio/project links (one per line) to include in bids
6. Settings auto-save on change
7. Click **フィルタリング 開始** and **入札 開始** on the status page

> **Important**: You must be logged into Lancers.jp in the same browser for bidding to work.

## Bidding Flow (see `docs/reference/` images)

```
1. Project detail page → Click 提案する
2. Bid form → Fill 提案文, 提案金額, 完了予定日 (clear preset values first)
   - Web projects: Fill phase-by-phase prices in 計画 section
   - NDA checkbox if present
3. Click 内容を確認する
4. Confirm page → Click 提案内容を確認して提案する
5. Success page
```

## Re-bidding Logic

| Trigger | Action |
|---------|--------|
| New project detected | Bid immediately |
| No new projects | Re-bid previously bid projects at milestones |
| 40+ proposals | Re-bid once at 40, 60, 80, 100 thresholds |

## Dashboard

| Section | Description |
|---------|-------------|
| Filtering Start/Stop | Control project monitoring |
| Bidding Start/Stop | Control automated bid submission |
| Settings | API keys, prompts, sample bids, portfolio links |
| Stats | Total detected, bid count, skip count, errors |
| Project List | Real-time list with status badges |

## Reference Images

Stored in `docs/reference/`:
- `lances1.png` — Project detail (budget, proposal count, 提案する button)
- `lances2.png` — Bid form (proposal text, amount, date)
- `lances3.png` — Confirmation page (final submit)
- `lances4.png` — Web project phase pricing
- `lances5.png` — NDA agreement and contract amount

## File Structure

```
lancers-auto-bid/
├── manifest.json
├── background/service-worker.js
├── content/content.js
├── lib/
│   ├── ai.js, bid-schedule.js, bid-via-tab.js
│   ├── error-resolver.js, constants.js, storage.js
│   └── ...
├── dashboard/
│   ├── status.html, settings.html
│   └── ...
└── docs/reference/
    └── lances1.png ... lances5.png
```

## Notes

- **Search/filtering** runs via background fetch (no browser tabs opened)
- **Bid submission** opens a hidden tab only when submitting a bid
- **Settings persist** across browser restarts via Chrome local storage
- **Error recovery** uses AI + cached solutions when form automation fails
