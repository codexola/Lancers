# Lancers Auto Bid - Chrome Extension

Automatically monitors [Lancers.jp](https://www.lancers.jp) for new system/web development projects and submits AI-generated bids within seconds.

## Features

- **Real-time monitoring** of two search URLs:
  - System development: `https://www.lancers.jp/work/search/system?open=1`
  - Web development: `https://www.lancers.jp/work/search/web?open=1`
- **Adaptive polling**: every 4 seconds when new projects appear, every 60 seconds during idle periods
- **AI bid generation** via Claude (Anthropic) or OpenAI (GPT-4o)
- **Smart filtering** excludes non-development projects (image/video/marketing/VA/adult/salon/partnership/free work)
- **Automated bidding** fills proposal form, amount, completion date, NDA checkbox, and submits
- **Dashboard** with start/stop controls, settings persistence, real-time project list, and bid detail modals
- **JSON export** of all task data

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
4. Customize the bid generation prompt if needed
5. Add portfolio/project links (one per line) to include in bids
6. Click **Save Settings**
7. Click **Start** to begin monitoring

> **Important**: You must be logged into Lancers.jp in the same browser for bidding to work.

## How It Works

```
Search Pages (every 4s/60s)
    ↓
Detect new projects
    ↓
Filter (exclude non-dev keywords)
    ↓
Scrape project details
    ↓
Generate bid via AI
    ↓
Click 提案する → Fill form → 内容を確認する → この内容で提案する
    ↓
Save results to dashboard + JSON
```

## Dashboard

| Section | Description |
|---------|-------------|
| Start/Stop | Control monitoring (state persists across browser restarts) |
| Settings | API keys, prompt, portfolio links |
| Stats | Total detected, bid count, skip count, errors |
| Project List | Real-time list with status badges |
| Modal | Click a project to view bid document or skip reason |

## Project Statuses

- **入札済み** (bid_submitted) - Bid successfully submitted
- **スキップ** (skipped) - Filtered out (non-dev project)
- **エラー** (error) - Processing or submission failed
- **処理中** (processing) - Currently being processed

## JSON Export

Click **JSONエクスポート** to download all project data, task logs, and settings as a JSON file. Data is also automatically persisted in Chrome local storage.

## File Structure

```
lancers-auto-bid/
├── manifest.json
├── background/
│   └── service-worker.js    # Polling orchestration & bid workflow
├── content/
│   └── content.js           # Page scraping & form automation
├── lib/
│   ├── constants.js         # URLs, intervals, keywords
│   ├── filter.js            # Project filtering logic
│   ├── ai.js                # Claude/OpenAI integration
│   └── storage.js           # Chrome storage helpers
├── dashboard/
│   ├── index.html
│   ├── dashboard.css
│   └── dashboard.js
└── icons/
```

## Filtering

Projects are analyzed using **Claude or OpenAI** to distinguish development work from non-development work. For example, LP projects requiring image placement (not image production) are correctly identified as development work.

Projects with **50+ existing proposals** are skipped (configurable in dashboard). Previously skipped projects are re-checked on subsequent polls.

Keyword-based fallback is used only when AI analysis fails.

## Notes

- **Search/filtering** runs via background fetch (no browser tabs opened)
- **Bid submission** opens a single hidden tab only when submitting a bid
