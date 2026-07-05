import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://127.0.0.1:8000";

const emptyForm = {
  date: "",
  online_hours: "",
  trips: "",
  net_fare: "",
  tips: "",
  promotions: "",
  miles_driven: "",
  wallet_balance: "",
  notes: "",
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

  useEffect(() => {
    if (!error && !successMessage) {
      return;
    }

    const timerId = setTimeout(() => {
      setError("");
      setSuccessMessage("");
    }, 3000);

    return () => clearTimeout(timerId);
  }, [error, successMessage]);

  function handleInputChange(event) {
    const { name, value } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
  }

  function optionalNumber(value) {
    if (value === "") {
      return null;
    }

    return Number(value);
  }

  function optionalText(value) {
    if (value.trim() === "") {
      return null;
    }

    return value;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccessMessage("");

    const newRecord = {
      date: formData.date,
      online_hours: Number(formData.online_hours),
      trips: Number(formData.trips),
      net_fare: Number(formData.net_fare),
      tips: Number(formData.tips),
      promotions: Number(formData.promotions),
      miles_driven: optionalNumber(formData.miles_driven),
      wallet_balance: optionalNumber(formData.wallet_balance),
      notes: optionalText(formData.notes),
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

  async function handleDelete(date) {
    const confirmed = window.confirm(`Delete record for ${date}?`);

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/daily/${date}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to delete daily record.");
      }

      setSuccessMessage("Daily record deleted.");
      await fetchDashboardData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <p className="eyebrow">Uber Dashboard v2</p>
        <h1>Uber Nest Tracker</h1>
        <p className="subtitle">
          Track earnings, breakdowns, mileage, and daily Uber efficiency.
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
        <h2>Add daily log</h2>

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

          <label>
            Net fare
            <input
              type="number"
              name="net_fare"
              value={formData.net_fare}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              required
            />
          </label>

          <label>
            Tips
            <input
              type="number"
              name="tips"
              value={formData.tips}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              required
            />
          </label>

          <label>
            Promotions
            <input
              type="number"
              name="promotions"
              value={formData.promotions}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              required
            />
          </label>

          <label>
            Miles driven optional
            <input
              type="number"
              name="miles_driven"
              value={formData.miles_driven}
              onChange={handleInputChange}
              step="0.1"
              min="0"
            />
          </label>

          <label>
            Wallet balance optional
            <input
              type="number"
              name="wallet_balance"
              value={formData.wallet_balance}
              onChange={handleInputChange}
              step="0.01"
              min="0"
            />
          </label>

          <label className="notes-field">
            Notes optional
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows="3"
            />
          </label>

          <button type="submit">Add log</button>
        </form>
      </section>

      <section className="table-section">
        <h2>Daily logs</h2>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Total</th>
              <th>Fare</th>
              <th>Tips</th>
              <th>Promos</th>
              <th>Hours</th>
              <th>Trips</th>
              <th>$/hr</th>
              <th>$/trip</th>
              <th>Miles</th>
              <th>$/mile</th>
              <th>Wallet</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {dailyRecords.map((record) => (
              <tr key={record.date}>
                <td>{record.date}</td>
                <td>${record.total_earnings.toFixed(2)}</td>
                <td>${record.net_fare.toFixed(2)}</td>
                <td>${record.tips.toFixed(2)}</td>
                <td>${record.promotions.toFixed(2)}</td>
                <td>{record.online_hours.toFixed(2)}</td>
                <td>{record.trips}</td>
                <td>${record.avg_hourly.toFixed(2)}</td>
                <td>${record.avg_per_trip.toFixed(2)}</td>
                <td>
                  {record.miles_driven !== null
                    ? record.miles_driven.toFixed(1)
                    : "—"}
                </td>
                <td>
                  {record.earnings_per_mile !== null
                    ? `$${record.earnings_per_mile.toFixed(2)}`
                    : "—"}
                </td>
                <td>
                  {record.wallet_balance !== null
                    ? `$${record.wallet_balance.toFixed(2)}`
                    : "—"}
                </td>
                <td>
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => handleDelete(record.date)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default App;