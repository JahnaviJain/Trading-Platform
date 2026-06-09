// Prediction.js
import React, { useState } from "react";
import axios from "axios";
import Chart from "react-apexcharts";
import "./Portfolio.css";

const Prediction = ({ stockSymbol }) => {
  const [predictionDate, setPredictionDate] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [predictionData, setPredictionData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchPrediction = async () => {
    if (!predictionDate) {
      setError("Please select a date.");
      return;
    }

    setLoading(true);
    setError("");
    setPredictions([]);
    setPredictionData([]);

    try {
      const res = await axios.get(
        `http://localhost:5000/predict?date=${predictionDate}&stock_symbol=${stockSymbol}`
      );

      const prices = Array.isArray(res.data) ? res.data.map(p => p.predicted_close) : res.data?.predicted_prices;

      if (Array.isArray(prices)) {
        setPredictions(prices);

        const date = new Date(predictionDate);
        const data = prices.map((price, index) => {
          const x = new Date(date);
          x.setDate(x.getDate() + index);
          const y = parseFloat(price);

          const open = y - Math.random() * 2;
          const close = y;
          const high = Math.max(open, close) + Math.random();
          const low = Math.min(open, close) - Math.random();

          return {
            x,
            y: [
              parseFloat(open.toFixed(2)),
              parseFloat(high.toFixed(2)),
              parseFloat(low.toFixed(2)),
              parseFloat(close.toFixed(2)),
            ],
          };
        });

        setPredictionData(data);
      } else {
        setError("Unexpected response format.");
      }
    } catch (error) {
      console.error("Prediction error:", error);
      setError(error.response?.data?.error || "Error fetching predictions.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="prediction_section" style={{ padding: "10px" }}>
      {/* Date picker only - no dropdown */}
      <div>
        <input
          type="date"
          value={predictionDate}
          onChange={(e) => setPredictionDate(e.target.value)}
          style={{ marginRight: "10px", padding: "5px" }}
        />
        <button onClick={fetchPrediction} className="predict-button">
          Predict
        </button>
      </div>

      {loading && <p style={{ marginTop: "20px" }}>⏳ Fetching predictions...</p>}
      {error && <p style={{ color: "red", marginTop: "10px" }}>{error}</p>}

      {predictions.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <h3>Predicted Prices (Next {predictions.length} Days):</h3>
          <ul>
            {predictions.map((price, index) => (
              <li key={index}>
                Day {index + 1}: ${parseFloat(price).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {predictionData.length > 0 && (
        <div style={{ marginTop: "30px" }}>
          <h3>📊 Predicted Candlestick Chart</h3>
          <Chart
            options={{
              chart: {
                type: "candlestick",
                height: 350,
                background: "#000000",
                toolbar: { show: false },
              },
              theme: { mode: "dark" },
              xaxis: {
                type: "datetime",
                labels: {
                  style: { colors: "#FFFFFF" },
                },
              },
              yaxis: {
                tooltip: { enabled: true },
                labels: {
                  style: { colors: "#FFFFFF" },
                },
              },
              tooltip: { theme: "dark" },
              plotOptions: {
                candlestick: {
                  colors: {
                    upward: "#00ff00",
                    downward: "#ff0000",
                  },
                },
              },
            }}
            series={[{ name: "Predicted Price", data: predictionData }]}
            type="candlestick"
            height={350}
          />
        </div>
      )}
    </div>
  );
};

export default Prediction;
