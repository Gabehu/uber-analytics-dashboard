import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://127.0.0.1:8000";

function App() {
  const [summary, setSummary] = useState(null);
  const [dailyRecords, setDailyRecords] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const summaryResponse = await fetch(`${API_BASE_URL}/api/summary`);
        const dailyResponse = await fetch(`${API_BASE_URL}/api/daily`);

        if (!summaryResponse.ok || !dailyResponse.ok) {
          throw new Error("Failed to fetch dashboard data.");
        }

        const summaryData = await summaryResponse.json();
        const dailyData = await dailyResponse.json();

        setSummary(summaryData);
        setDailyRecords(dailyData);
      } catch (err) {
        setError(err.message);
      }
    }

    fetchDashboardData();
  }, []);

  return (
    <main className="app">
      <section className="hero">
        <p className="eyebrow">Uber Dashboard v2</p>
        <h1>Backend-connected dashboard</h1>
        <p className="subtitle">
          This React frontend is reading summary and daily records from the FastAPI backend.
        </p>
      </section>

      {error && <p className="error">Error: {error}</p>}

      {summary ? (
        <section className="summary-grid">
          <div className="card">
            <p>Total earnings</p>
            <h2>${summary.total_earnings.toFixed(2)}</h2>
          </div>

          <div className="card">
            <p>Total trips</p>
            <h2>{summary.total_trips}</h2>
          </div>

          <div className="card">
            <p>Online hours</p>
            <h2>{summary.online_hours.toFixed(2)}</h2>
          </div>

          <div className="card">
            <p>Avg hourly</p>
            <h2>${summary.avg_hourly.toFixed(2)}</h2>
          </div>

          <div className="card">
            <p>Avg per trip</p>
            <h2>${summary.avg_per_trip.toFixed(2)}</h2>
          </div>
        </section>
      ) : (
        <p>Loading summary...</p>
      )}

      <section className="table-section">
        <h2>Daily records</h2>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Earnings</th>
              <th>Hours</th>
              <th>Trips</th>
              <th>Avg hourly</th>
            </tr>
          </thead>

          <tbody>
            {dailyRecords.map((record) => (
              <tr key={record.date}>
                <td>{record.date}</td>
                <td>${record.earnings.toFixed(2)}</td>
                <td>{record.online_hours.toFixed(2)}</td>
                <td>{record.trips}</td>
                <td>${record.avg_hourly.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default App;