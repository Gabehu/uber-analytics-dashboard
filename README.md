# Uber Analytics Dashboard

A local Uber earnings analytics dashboard built with Python, Streamlit, pandas, and SQLite.

## Features

- Add daily Uber workday entries
- Save entries locally with SQLite
- Edit and delete entries
- Calculate earnings, hourly rate, average per trip, and tip percentage
- View daily recap summaries
- View current-week summaries
- Display basic earnings and hourly rate charts

## Privacy

This app stores earnings data locally in a SQLite database.

The local database is created at:

```text
data/uber_dashboard.db
```

The database file is excluded from version control so real earnings data stays local.

## Run locally

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the Streamlit app:

```bash
streamlit run app.py
```

## Tech stack

- Python
- Streamlit
- pandas
- SQLite

## Current status

Version 1.1 is feature-complete as a local Streamlit prototype.

V1.1 includes local data entry, SQLite storage, editing/deleting entries, daily recaps, selected-week summaries, week filtering, and basic earnings/hourly rate charts.

The next major step is V2: rebuilding the prototype as a more polished web app with clearer pages, routing, and UI.

## Planned improvements

### V2 direction

- Rebuild as a full web app with separate frontend/backend structure
- Add proper pages for dashboard, entries, entry details, editing, and analytics
- Improve the entry/edit workflow
- Improve chart design and table interactions
- Add bills/wallet tracking
- Add weekly/monthly goal progress
- Add sample/demo data for public portfolio use