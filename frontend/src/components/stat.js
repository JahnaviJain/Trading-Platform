import React, { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS } from "chart.js/auto";

const stockOptions = ["GOOG", "TSLA", "UL", "MSFT","AAPL","WMT","IBM"]; // Add your stock filenames (without .csv)

const RealTimeChartWithCSV = () => {
  const [csvData, setCsvData] = useState([]);
  const [visibleData, setVisibleData] = useState([]);
  const [selectedStock, setSelectedStock] = useState(stockOptions[0]);
  const [selectedDate, setSelectedDate] = useState("");
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef(null);

  // Load CSV data when stock is selected
  useEffect(() => {
    const fileName = `${selectedStock}_live.csv`;

    fetch(fileName)
      .then((res) => res.text())
      .then((text) => {
        const parsed = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
        });
        const data = parsed.data;
        setCsvData(data);

        const today = new Date().toISOString().split("T")[0];
        const hasToday = data.some((row) => row.timestamp.startsWith(today));

        const defaultDate = hasToday
          ? today
          : data.length > 0
          ? data[0].timestamp.split(" ")[0]
          : "";

        setSelectedDate(defaultDate);
      });
  }, [selectedStock]);

  // Main simulation logic
  useEffect(() => {
    if (!selectedDate || csvData.length === 0) return;

    const filteredData = csvData.filter((row) =>
      row.timestamp.startsWith(selectedDate)
    );

    if (filteredData.length === 0) {
      alert("No data available for selected date");
      return;
    }

    // Determine the current time
    const now = new Date();
    const marketOpenTime = new Date(`${selectedDate}T09:30:00`);

    // Filter data from market open till current time
    const initialData = filteredData.filter((row) => {
      const rowTime = new Date(row.timestamp.replace(" ", "T"));
      return rowTime <= now;
    });

    setVisibleData(initialData);

    // Start simulation from current index onward
    let currentIndex = initialData.length;

    setPlaying(true);
    intervalRef.current = setInterval(() => {
      if (currentIndex < filteredData.length) {
        const newRow = filteredData[currentIndex];
        const newTime = new Date(newRow.timestamp.replace(" ", "T"));
        if (newTime > now) {
          setVisibleData((prev) => [...prev, newRow]);
        }
        currentIndex++;
      } else {
        clearInterval(intervalRef.current);
        setPlaying(false);
      }
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [selectedDate, csvData]);

  const chartData = {
    labels: visibleData.map((row) => row.timestamp),
    datasets: [
      {
        label: `${selectedStock} Close Price`,
        data: visibleData.map((row) => parseFloat(row.close)),
        borderColor: "blue",
        tension: 0.3,
        fill: true,
      },
    ],
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Stock Simulation from CSV</h2>

      <label htmlFor="stock-select">Select Stock: </label>
      <select
        id="stock-select"
        value={selectedStock}
        onChange={(e) => setSelectedStock(e.target.value)}
      >
        {stockOptions.map((symbol) => (
          <option key={symbol} value={symbol}>
            {symbol}
          </option>
        ))}
      </select>

      <p>
        Auto-selected date: <strong>{selectedDate || "N/A"}</strong>
      </p>

      {visibleData.length > 0 ? (
        <Line data={chartData} />
      ) : (
        <p>Loading simulation...</p>
      )}
    </div>
  );
};

export default RealTimeChartWithCSV;
