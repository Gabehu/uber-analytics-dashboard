# Uber Nest Tracker

A local full-stack dashboard for tracking Uber delivery earnings, mileage, time, and daily efficiency.

The goal is to explain what those earnings actually mean: was the day efficient, was it promotion-boosted or tip-carried, and was the mileage/time actually worth it?

**Current version:** v4.0.0

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** FastAPI + Pydantic + SQLite + Uvicorn

## Features

- Daily log entry (hours, trips, fare, app tips, optional cash tips, promotions, wallet balance, notes), opened on demand from the Daily logs section
- **Cash-tip-aware performance** — cash tips remain separate from the Uber wallet while contributing to actual total earnings, hourly rates, per-trip results, mileage efficiency, combined tip share, and weekly totals
- **Weekly notes** — an optional compact reflection tied to the Sunday week-ending date, shown beneath the generated weekly recap
- **Editable log dates** — move an existing log to any empty date without changing its database ID; occupied dates are blocked rather than merged, and weekly/quest views recalculate automatically
- **Responsive mobile companion** — the same React app becomes capture-first on phones and small tablets, with focused Today, Earnings, and More destinations while preserving the full analysis-first desktop dashboard
- **Mobile Quick Update** — update trips, fare, app tips, cash tips, and promotions in a compact bottom sheet without touching optional mileage, session, or context fields
- **Persistent live mobile tracking** — start sessions without creating a log first, record optional odometers at every session/break boundary, safely close the app between actions, resume from breaks, add later sessions, and merge the completed draft into the normal editable daily form when earnings settle
- Odometer-based mileage tracking and time tracking (online vs. real work time)
- **Optional multi-break tracking** — no break fields appear unless requested; each press of Add break creates a removable session whose times pause real work and whose optional odometers exclude break driving from work mileage
- **Split-shift work sessions** — every advanced daily log starts with Session 1, while Add another session creates removable later work periods; real work and work mileage sum only the tracked sessions, excluding the time and driving between them
- **Accuracy audit cues** — selected days warn when real work is at least 15 minutes shorter than Uber online time, and an expandable mileage breakdown shows every session's gross miles, tracked break-mile exclusions, and final work miles
- **Quest tracker** — create weekday, weekend, or custom-date two-tier quests in a management modal; its compact panel follows the selected day, shows live progress and earned/potential bonuses, and offers individually expandable tier details
- **Expanded order effects** — tag Shop and Deliver, Delivery-heavy, or Mixed orders to explain how the shift's order mix affected trip count, time, and earnings
- **Rule-based daily recap** — selected days can show one concise interpretation beneath the status badges, combining the strongest hourly, tip, promotion, mileage, quest, effect, and tracking-warning signals without replacing manual notes
- **Rule-based weekly recap** — weekly mode shows a compact interpretation beneath its metrics, based on real-work hourly performance, mileage quality, the dominant earnings source, quest outcome, and one notable internal pattern such as a standout day, repeated effect, hourly gap, or consistency
- Selected-day view with earnings breakdown and rule-based labels (e.g. "promo-boosted," "strong hourly"), color-coded by outcome
- Weekly view with day-by-day comparison, animated bars, and week navigation
- **Week jump** — a date picker to jump straight to any week, including empty gap weeks
- **Browse weeks** — a visual panel listing every week with its own mini chart and total, for scanning a long history at a glance
- **Earnings composition donut** — an animated fare/tips/promotions breakdown chart with a legend, for the selected day or the current week
- **Animated numbers** — key stats count smoothly and flash on change when you switch days or weeks; purely a visual transition cue, not a judgment (wallet figures included, styled the same as everything else)
- **Wallet balance** featured on the dashboard (most recent logged value), plus **wallet delta** showing day-over-day and week-over-week change — informational only, not color-judged, since a drop can be a cash-out rather than a loss
- **Wallet floor** — a manually-set, local-only reference value, edited inline on the Wallet balance card, showing how much of the current balance sits above the floor you deliberately keep resting there (e.g. a Finance sweep-above-floor arrangement); not synced from anywhere, `None` until you set it
- **Unified CSV backup** of all daily logs, cash tips, split sessions, breaks, Day Effects, quest definitions, and weekly notes, exported in one click from the Daily logs section
- **CSV restore with preview** — reads only raw inputs, upserts daily logs by date and quests by date range, then recalculates metrics, quest progress, status, and earned bonuses fresh
- **Delete all records** — a deliberately out-of-the-way, type-to-confirm action for wiping the database clean (e.g. clearing test data before real use)
- **Scroll-to-section**: View scrolls to the top of the dashboard, Edit scrolls the form into view, so the UI never leaves you wondering if a click did anything
- An error boundary shows a readable message instead of a blank screen if something breaks
- Full CRUD on daily logs (view/edit/delete) via the frontend table
- **Chart-to-entry shortcut** — empty days on the weekly chart can be selected and used to start a new daily log for that exact date, avoiding manual date picker navigation
- **Daily log pagination** — Daily logs are split into pages with adjustable rows per page, so long histories do not stretch endlessly down the page
- **Daily log filters and sorting** — collapsible Filter / Sort controls for browsing logs by status, month, wallet logging state, total earnings, hourly rate, real hourly rate, mileage efficiency, trips, newest, and oldest
- **Status tooltips** — hovering or focusing rule-based status labels shows a short explanation of what the label means and which metric it relates to

## Project Structure

```
Uber/
  start.bat            # double-click to launch both servers + open the browser
  backend/
    database.py
    main.py
    requirements.txt
    schemas.py
    seed_mock.py        # optional dev helper, see below
    uber_dashboard.db   # local/private, ignored by Git
    venv/               # local/private, ignored by Git

  frontend/
    src/
      App.jsx
      App.css
    package.json
    node_modules/       # local/private, ignored by Git

  docs/
    v2-plan.md

  README.md
```

## Run Locally

**Quick start:** double-click `start.bat` in the project root — it launches both servers and opens the app in your browser automatically.

**Manual start**, if you'd rather run things yourself:

**Backend**

```powershell
cd backend
.\venv\Scripts\activate
uvicorn main:app --reload
```

Runs at `http://127.0.0.1:8000` (docs at `/docs`).

**Frontend**

```powershell
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`.

## Private Android Access with Tailscale

The tracker can remain on this Windows PC and be reached privately from an
Android phone over cellular. SQLite remains the only database, and the PC must
stay powered on, awake, online, and running the tracker during the shift.

One-time setup after installing and signing into Tailscale on both devices:

1. Double-click `setup-phone-access.bat` (use **Run as administrator** if
   Windows denies access to the Tailscale service).
2. Approve Tailscale HTTPS in the browser if prompted.
3. Save the private `https://...ts.net` address printed by the script.

Before each shift:

1. Double-click `start-phone.bat`.
2. Keep the **Uber Nest Tracker - Phone Server** window open and prevent the
   PC from sleeping.
3. Ensure Tailscale is connected on Android, then open the saved HTTPS address.

`start-phone.bat` builds React and serves the resulting production files and
all `/api` routes together through FastAPI on port 8000. The regular
`start.bat` development workflow continues to use Vite on port 5173; Vite
proxies its `/api` requests to the local FastAPI server.

## API

```
GET    /api/summary
GET    /api/daily
GET    /api/daily/csv
GET    /api/weeks
POST   /api/daily
POST   /api/daily/import/preview
POST   /api/daily/import/commit
PUT    /api/daily/{date}
DELETE /api/daily/{date}
DELETE /api/daily
GET    /api/settings/wallet-floor
PUT    /api/settings/wallet-floor
GET    /api/quests
POST   /api/quests
PUT    /api/quests/{quest_id}
DELETE /api/quests/{quest_id}
```

## Local Database

Data lives in a local SQLite file at `backend/uber_dashboard.db`, which is gitignored to keep real earnings data private. To reset the schema during development, delete the file and restart the backend — it's recreated on startup.

### Mock data for testing

`backend/seed_mock.py` is a standalone dev script that inserts several weeks of realistic test data (including an intentional empty gap week and a mix of basic/advanced-field logging) so features like the weekly chart, week-jump picker, and wallet delta can be exercised without waiting on real usage. It reuses the app's own validation and metric logic, so mock data is computed identically to real entries.

```powershell
cd backend
python seed_mock.py
```

It refuses to run over what looks like real accumulated data; pass `--force` to override. Not part of the app itself — just a testing convenience.

## Version History

- **v1 / v1.1** — Local prototype (Streamlit) proving out the basic tracking idea.
- **v2.0** — Full-stack rewrite: React/Vite + FastAPI + SQLite, daily log CRUD, weekly chart, rule-based labels.
- **v2.1** — Added odometer-based mileage and real work-time tracking, plus backend validation.
- **v2.2** — CSV export of daily logs.
- **v2.3** — Week jump (date picker + recent-weeks dropdown), plus a UI pass: color-coded labels, unified button sizing/coloring across the app, collapsible add/edit form, layout and alignment fixes.
- **v2.4** — Wallet delta (day-over-day and week-over-week wallet change), plus wallet balance featured on the summary dashboard.
- **v2.5** — Earnings composition donut chart (replacing the old Net fare/Tips/Promotions cards), scroll-to-section on View/Edit, animated weekly bars on data change, and a UI consistency pass: unified Cancel button placement, consistent form action row layout, colored secondary buttons.
- **v3.0** — CSV import (backup/restore), Browse weeks (a mini-chart-per-week panel), animated donut chart and animated stat numbers throughout, a delete-all-records safety flow, an error boundary, a one-click startup script, and a project-wide cleanup/comments pass.
- **v3.1** — Daily log usability update: chart-to-entry shortcuts for missing days, pagination for long log histories, collapsible filters/sorting for Daily logs, status tooltips, quick edit access from selected-day view, and a local-date fix for the Add daily log form.
- **v3.2** — Day Effects: a four-category system (Weather, Demand & traffic, Order quality & mix, Operational) for tagging conditions that affected a shift, with per-category icons, real hover definitions for every tag, a dedicated Effects column and filter in Daily logs, and a collapsible picker in the Add/Edit form. Also: icon-only row actions (View/Hide/Edit/Delete) to reclaim table width, status-chip tooltips now show the numeric boundary for each tier (e.g. "$20–$25 online $/hr"), Edit/Delete moved to the right side of the selected-day view, a custom browser tab title and favicon, and a round of table layout and tooltip-rendering fixes.
- **v3.3** — Wallet floor: a manually-set, local-only reference value (new `app_settings` table, `GET`/`PUT /api/settings/wallet-floor`) shown and inline-editable right on the Wallet balance card, so it's clear how much of the current balance sits above the floor you deliberately keep resting there. Also: a layout fix dropping the dashboard's fixed 1126px width/border in favor of a full-width `#root`.
- **v3.4** — Progressive multi-break tracking: Add break creates repeatable, removable sessions only when needed. All break durations are deducted from real work, optional per-session odometers exclude break driving from work mileage, and the recap shows the combined break duration beneath Real work. Online time remains the value reported directly by Uber.
- **v3.5** — Split-shift work sessions: advanced tracking is organized around a default Session 1 with progressive Add another session cards for later outings. Real work is the sum of session durations minus tracked breaks, work mileage is the sum of session odometer ranges minus tracked break driving, and the existing home-end fields apply only to the final return after the last session.
- **v3.6** — Accuracy audit cues: a selected-day warning flags real work that is at least 15 minutes shorter than Uber online time, helping expose missing sessions or excessive break entries. A collapsible mileage breakdown lists each session's gross miles, break miles excluded, and the resulting total work miles.
- **v3.7** — Quest tracker: create and manage two-tier quests with custom date ranges, trip requirements, a first-tier bonus, and an additional final-tier bonus. Progress and earned bonuses recalculate live from matching daily logs, while a compact collapsible panel beside the visible week reports tier progress and Scheduled/Active/Completed/Failed status without changing daily earnings.
- **v3.8** — Expanded Day Effects with Shop and Deliver, Delivery-heavy, and Mixed orders tags, including order-mix tooltips and filtering alongside the existing effects.
- **v3.8.1** — Renamed Promo-carried to Promo-boosted and changed its status color from red to amber, while preserving the existing promotion-share thresholds.
- **v3.8.2** — Refined promotion-label colors: Organic earnings is neutral when a small nonzero promotion share exists, Promo helped is green, and Promo-boosted remains amber.
- **v3.9** — Added a compact rule-based Quick recap beneath selected-day status badges. It combines at most one supporting signal and one caveat from hourly performance, tips, promotions, mileage, quests, tagged effects, and real-work accuracy warnings, while leaving manual notes as the detailed explanation.
- **v3.10** — Added a small rule-based Weekly recap beneath the weekly metrics. It summarizes the week's hourly/mileage verdict, dominant fare/tip/promotion share, overlapping quest status, and previous-week earnings changes of at least 15%, with safeguards against judging partially tracked real time or mileage.
- **v3.11** — Replaced potentially demoralizing previous-week comparisons with internal week-pattern analysis. The recap now selects at most one notable observation: tracking inconsistencies, a day producing over 40% of earnings, a substantial online/real hourly gap, a repeated Day Effect, or consistent/uneven daily earnings. Also explicitly centered the recap heading and paragraph to the same width.
- **v3.11.1** — Improved the single-day weekly pattern wording and suppressed the Organic earnings badge and status filter value on logs with exactly $0 in promotions. Small nonzero promotion shares still receive the neutral Organic classification.
- **v3.11.2** — Normalized the collapsed weekly Quests bar height so empty and populated quest weeks no longer shift the chart vertically.
- **v3.11.3** — Condensed the opened weekly Quests panel into individually collapsible rows. Each row keeps dates, status, total progress, and earned/potential bonuses visible while hiding its larger tier breakdown until requested.
- **v3.11.4** — Made the Quests panel follow the selected date. In selected-day mode, its summary and opened list show only quests covering that day; returning to weekly mode restores every quest overlapping the week.
- **v3.12** — Expanded the one-file CSV backup/restore format with typed quest-definition rows. Imports preview daily and quest changes separately, upsert quests by date range to avoid duplicates, and recalculate progress/status/earned bonuses from restored trip logs. Older daily-only CSV backups remain compatible.
- **v3.12.1** — Added explicit spacing around the Daily logs success/error notification area so alerts sit comfortably below the toolbar and leave more room before subsequent content.
- **v3.13** — Made daily-log dates editable. A log can move in place to an empty date while preserving its row ID; occupied targets return a clear conflict instead of merging data. Successful moves automatically follow the new selected day/week and refresh weekly totals, quest progress, and recaps. Also stabilized the weekly navigation arrows with fixed grid positions around a centered date label.
- **v3.14** — Added optional cash tips as real performance earnings without changing Uber wallet snapshots or deltas; combined app and cash tips now drive tip share and all earnings-efficiency metrics. Added compact editable weekly notes keyed to each Sunday week-ending date, included both additions in CSV backup/restore, and extended notifications to five seconds for confirmations and eight seconds for errors.
- **v4.0** — Added a responsive capture-first mobile experience without replacing the desktop analytics dashboard. Phones and small tablets use Today, Earnings, and More: Today supports either manual entry or backend-persisted live session/break drafts with thumb-zone controls, Earnings provides an animated weekly overview plus interactive inline daily details and the last-known wallet, and More groups quest, wallet, backup, and data management. The shared day editor becomes a structured full-screen mobile form, and all motion honors reduced-motion preferences. Added exact-width overflow checks and backend regression tests for persistent drafts, date moves/conflicts, session and break calculations, split-session mileage, and quest recalculation.

## What's Next

No next feature is currently committed. A fuller spending/cushion tracker and tax-summary tool remain outside the app's focused role as an end-of-day work debrief.
