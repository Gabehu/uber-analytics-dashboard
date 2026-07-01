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

Version 1 is feature-complete as a local prototype.

V1 includes local data entry, SQLite storage, editing/deleting entries, daily recaps, current-week summaries, and basic charts.

## Planned improvements

- Add a week selector for viewing older weeks
- Improve chart labels and formatting
- Add a bills/wallet tracker
- Add weekly goal progress
- Improve the edit/delete workflow
- Add sample/demo data for public portfolio use
