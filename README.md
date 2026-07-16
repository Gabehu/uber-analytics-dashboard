# Uber Nest Tracker

A local full-stack dashboard for tracking Uber delivery earnings, mileage, time, and daily efficiency.

The goal is to explain what those earnings actually mean: was the day efficient, was it promo- or tip-carried, and was the mileage/time actually worth it?

**Current version:** v3.3.0

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** FastAPI + Pydantic + SQLite + Uvicorn

## Features

- Daily log entry (hours, trips, fare, tips, promotions, wallet balance, notes), opened on demand from the Daily logs section
- Odometer-based mileage tracking and time tracking (online vs. real work time)
- Selected-day view with earnings breakdown and rule-based labels (e.g. "promo-carried," "strong hourly"), color-coded by outcome
- Weekly view with day-by-day comparison, animated bars, and week navigation
- **Week jump** — a date picker to jump straight to any week, including empty gap weeks
- **Browse weeks** — a visual panel listing every week with its own mini chart and total, for scanning a long history at a glance
- **Earnings composition donut** — an animated fare/tips/promotions breakdown chart with a legend, for the selected day or the current week
- **Animated numbers** — key stats count smoothly and flash on change when you switch days or weeks; purely a visual transition cue, not a judgment (wallet figures included, styled the same as everything else)
- **Wallet balance** featured on the dashboard (most recent logged value), plus **wallet delta** showing day-over-day and week-over-week change — informational only, not color-judged, since a drop can be a cash-out rather than a loss
- **Wallet floor** — a manually-set, local-only reference value, edited inline on the Wallet balance card, showing how much of the current balance sits above the floor you deliberately keep resting there (e.g. a Finance sweep-above-floor arrangement); not synced from anywhere, `None` until you set it
- **CSV export** of all daily logs, one click from the Daily logs section
- **CSV import** for backup/restore — reads only raw input fields and recalculates everything else fresh, with a preview step (new/updated/error counts) before anything is written
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
- **v3.2** — Day Effects: a 12-tag, four-category system (Weather, Demand & traffic, Order quality, Operational) for tagging conditions that affected a shift, with per-category icons, real hover definitions for every tag, a dedicated Effects column and filter in Daily logs, and a collapsible picker in the Add/Edit form. Also: icon-only row actions (View/Hide/Edit/Delete) to reclaim table width, status-chip tooltips now show the numeric boundary for each tier (e.g. "$20–$25 online $/hr"), Edit/Delete moved to the right side of the selected-day view, a custom browser tab title and favicon, and a round of table layout and tooltip-rendering fixes.
- **v3.3** — Wallet floor: a manually-set, local-only reference value (new `app_settings` table, `GET`/`PUT /api/settings/wallet-floor`) shown and inline-editable right on the Wallet balance card, so it's clear how much of the current balance sits above the floor you deliberately keep resting there. Also: a layout fix dropping the dashboard's fixed 1126px width/border in favor of a full-width `#root`.

## What's Next

Nothing planned. The app now covers everything it originally set out to do — daily debrief, weekly comparison, mileage/time economics, wallet awareness, and backup/restore — and the remaining ideas from earlier roadmaps (quest tracker, a fuller spending/cushion tracker, a tax-summary tool) were each considered and deliberately set aside because they either pulled the app outside its role as an end-of-day debrief tool, or the data needed for them didn't actually exist in a usable shape (see: Uber's own PDFs only provide week/month totals, not daily figures).