# Uber Nest Tracker

A local full-stack dashboard for tracking Uber delivery earnings, mileage, time, and daily efficiency.

The goal is to explain what those earnings actually mean: was the day efficient, was it promo- or tip-carried, and was the mileage/time actually worth it?

**Current version:** v2.3.0

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** FastAPI + Pydantic + SQLite + Uvicorn

## Features

- Daily log entry (hours, trips, fare, tips, promotions, wallet balance, notes), opened on demand from the Daily logs section
- Odometer-based mileage tracking and time tracking (online vs. real work time)
- Selected-day view with earnings breakdown and rule-based labels (e.g. "promo-carried," "strong hourly"), color-coded by outcome
- Weekly view with day-by-day comparison and week navigation
- **Week jump** — date picker and a recent-weeks dropdown (with totals) to jump straight to any week, including empty gap weeks
- **CSV export** of all daily logs, one click from the Daily logs section
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

`backend/seed_mock.py` is a standalone dev script that inserts several weeks of realistic test data (including an intentional empty gap week and a mix of basic/advanced-field logging) so features like the weekly chart and week-jump picker can be exercised without waiting on real usage. It reuses the app's own validation and metric logic, so mock data is computed identically to real entries.

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

## What's Next

- **Wallet-delta metric** — day-over-day change in wallet balance, computed from data already logged (no new entry step).
- **Import tools** — statement/tax PDF extraction with a review-before-save step, to reduce manual daily entry.
- Mini-chart-per-week panel (an extension of the week-jump dropdown, once the plain version has been used for a while).

Ideas like a quest tracker or a fuller spending/cushion tracker were considered and set aside — they either pull the app outside its role as an end-of-day debrief tool, or risk turning it into a general expense tracker. May revisit narrower versions later.