import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://127.0.0.1:8000";

const emptyForm = {
  date: "",
  earnings: "",
  online_hours: "",
  trips: "",
};

function App() {
  const [summary, setSummary] = useState(null);
  const [dailyRecords, setDailyRecords] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function fetchDashboardData() {
    try {
      setError("");

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

  useEffect(() => {
    fetchDashboardData();
  }, []);

  function handleInputChange(event) {
    const { name, value } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccessMessage("");

    const newRecord = {
      date: formData.date,
      earnings: Number(formData.earnings),
      online_hours: Number(formData.online_hours),
      trips: Number(formData.trips),
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/daily`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newRecord),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to create daily record.");
      }

      setFormData(emptyForm);
      setSuccessMessage("Daily record added.");
      await fetchDashboardData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <p className="eyebrow">Uber Dashboard v2</p>
        <h1>Backend-connected dashboard</h1>
        <p className="subtitle">
          This React frontend is reading and creating daily records through the FastAPI backend.
        </p>
      </section>

      {error && <p className="error">Error: {error}</p>}
      {successMessage && <p className="success">{successMessage}</p>}

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

      <section className="form-section">
        <h2>Add daily record</h2>

        <form onSubmit={handleSubmit} className="entry-form">
          <label>
            Date
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              required
            />
          </label>

          <label>
            Earnings
            <input
              type="number"
              name="earnings"
              value={formData.earnings}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              required
            />
          </label>

          <label>
            Online hours
            <input
              type="number"
              name="online_hours"
              value={formData.online_hours}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              required
            />
          </label>

          <label>
            Trips
            <input
              type="number"
              name="trips"
              value={formData.trips}
              onChange={handleInputChange}
              min="0"
              required
            />
          </label>

          <button type="submit">Add record</button>
        </form>
      </section>

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