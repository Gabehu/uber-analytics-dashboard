# Uber Nest Tracker

A local full-stack dashboard for tracking Uber delivery earnings, mileage, time, and daily efficiency.

The goal is to explain what those earnings actually mean: was the day efficient, was it promo- or tip-carried, and was the mileage/time actually worth it?

**Current version:** v2.5.0

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** FastAPI + Pydantic + SQLite + Uvicorn

## Features

- Daily log entry (hours, trips, fare, tips, promotions, wallet balance, notes), opened on demand from the Daily logs section
- Odometer-based mileage tracking and time tracking (online vs. real work time)
- Selected-day view with earnings breakdown and rule-based labels (e.g. "promo-carried," "strong hourly"), color-coded by outcome
- Weekly view with day-by-day comparison and week navigation, with smoothly animated bars when switching weeks or selecting a day
- **Week jump** — date picker and a recent-weeks dropdown (with totals) to jump straight to any week, including empty gap weeks
- **Earnings composition donut** — a fare/tips/promotions breakdown chart with a legend, for the selected day or the current week
- **Wallet balance** featured on the dashboard (most recent logged value), plus **wallet delta** showing day-over-day and week-over-week change — informational only, not color-judged, since a drop can be a cash-out rather than a loss
- **CSV export** of all daily logs, one click from the Daily logs section
- **Scroll-to-section**: View scrolls to the top of the dashboard, Edit scrolls the form into view, so the UI never leaves you wondering if a click did anything
- Full CRUD on daily logs (view/edit/delete) via the frontend table

## Project Structure

```
Uber/
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
PUT    /api/daily/{date}
DELETE /api/daily/{date}
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

## What's Next

- **CSV import** — restore/merge from a previously exported CSV. Since it's the app's own export format, there's no data-shape guesswork the way there would be with Uber's own PDFs (which don't contain daily-level data and were ruled out for that reason).
- **Mini-chart-per-week panel** ("Option C") — an extension of the week-jump dropdown showing a small chart per week instead of just a total. The backend (`/api/weeks`) already returns the daily breakdown needed for this.
- **Animated donut / counting numbers** — a bigger lift than the other animation work: the donut is currently a CSS `conic-gradient`, which browsers can't smoothly transition between states, so animating it would mean rebuilding it as an SVG-based chart. Counting-number transitions also need a real comparison baseline defined first. Worth doing if there's still appetite for it, not a required next step.

Manual backfill of old weeks/months was considered and intentionally skipped — Uber's weekly and tax PDFs only provide week- or month-level totals, not daily figures, so importing them into the day-by-day schema would mean fabricating a breakdown that isn't actually in the source data.