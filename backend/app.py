from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
from datetime import timedelta
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import load_model
import os

# --- App Initialization ---
app = Flask(__name__)
CORS(app)

# === Load LSTM Model Once ===
model = load_model("model.h5")

@app.route('/')
def hello():
    return 'Hello, World!'

@app.route('/predict', methods=['GET'])
def predict_next_days():
    forecast_horizon = 10
    sequence_length = 60

    stock_symbol = request.args.get('stock_symbol', '').upper()
    date_str = request.args.get('date', '')

    if not stock_symbol or not date_str:
        return jsonify({'error': 'Missing stock symbol or date parameter'}), 400

    try:
        target_date = pd.to_datetime(date_str)
    except Exception:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

    csv_file = f"{stock_symbol}_2025_historical.csv"

    if not os.path.exists(csv_file):
        return jsonify({'error': f"No historical data found for {stock_symbol}"}), 404

    try:
        df_stock = pd.read_csv(csv_file)
        df_stock['timestamp'] = pd.to_datetime(df_stock['timestamp'])
        df_stock.set_index('timestamp', inplace=True)

        # Add time-based features
        df_stock['day_of_week'] = df_stock.index.dayofweek
        df_stock['day_of_month'] = df_stock.index.day
        df_stock['month'] = df_stock.index.month
        feature_cols = ['close', 'day_of_week', 'day_of_month', 'month']

        # Slice 60 days before target
        window_end = target_date - pd.Timedelta(days=1)
        history_window = df_stock.loc[:window_end][-sequence_length:]

        if len(history_window) < sequence_length:
            return jsonify({'error': 'Not enough historical data before the selected date'}), 400

        scaler = MinMaxScaler()
        scaler.fit(df_stock[feature_cols])
        X_input = history_window[feature_cols].values
        X_scaled = scaler.transform(X_input)
        X_scaled = X_scaled.reshape(1, sequence_length, len(feature_cols))

        # Predict
        pred_scaled = model.predict(X_scaled)
        pred_close = scaler.inverse_transform(
            np.hstack([pred_scaled.reshape(-1, 1), np.zeros((forecast_horizon, len(feature_cols) - 1))])
        )[:, 0]

        future_dates = pd.date_range(start=target_date + timedelta(days=1), periods=forecast_horizon, freq='B')
        prediction_result = [
            {"date": str(date.date()), "price": round(float(price), 2)}
            for date, price in zip(future_dates, pred_close)
        ]

        return jsonify({'predicted_prices': [p['price'] for p in prediction_result]}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
