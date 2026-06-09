require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const { Server } = require("socket.io");

// Models and helpers
const connection = require("./db");
const Stock = require("./models/stock");
const Order = require("./models/order");
const priceStore = require("./priceStore");
const Balance = require("./models/balance");
const BuyOrder = require("./models/BuyOrder");
const SellOrder = require("./models/SellOrder");
const portfolioRoutes = require("./routes/portfolio"); 

const userRoutes = require("./routes/users");
const authRoutes = require("./routes/auth");
const balanceRoutes = require("./routes/balance");
const chatRoute = require("./routes/ollamaChat");
const summarizeRoute = require("./routes/summarize");
const watchlistRoutes = require("./routes/watchlist"); 
const stockRoutes = require("./routes/stocks"); 


const stockSymbols = ["AAPL", "GOOG", "MSFT", "WMT", "TSLA", "IBM", "UL"];

// DB connection
connection();

// Create HTTP and wrap express under it
const app = express();
app.use(express.json());
app.use(cors());

// REST API routes
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);

// app.use("/api/orders", orderRoutes); 
app.use("/api/balance", balanceRoutes); 
app.use("/api", chatRoute);  
app.use("/api",summarizeRoute);

app.use("/api/balance", balanceRoutes);
app.use("/api/portfolio", portfolioRoutes); 
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/stocks", stockRoutes); 


// HTTP server + socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const orderRoutes = require("./routes/orders")(io);
app.use("/api/orders", orderRoutes);

mongoose.connect(
  "mongodb+srv://devangiparmar68730:JBbrZtz9nTke1l7R@cluster0.e8eow.mongodb.net/stockify?retryWrites=true&w=majority&appName=Cluster0",
  { useNewUrlParser: true, useUnifiedTopology: true }
);

// --- UPDATED TIME FUNCTIONS ---

function getISTDate() {
  const now = new Date();
  const istOffsetMinutes = 5.5 * 60;
  const utcTimestamp = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcTimestamp + (istOffsetMinutes * 60000));
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isMarketOpenIST() {
  const nowIST = getISTDate();
  if (isWeekend(nowIST)) return false;
  const hour = nowIST.getHours();
  const minute = nowIST.getMinutes();
  if (hour < 9 || (hour === 9 && minute < 30)) return false;
  if (hour > 15 || (hour === 15 && minute >= 59)) return false;
  return true;
}

function getLastTradingDay(currentDate) {
  let date = new Date(currentDate);
  if (isWeekend(date)) {
    const dayOfWeek = date.getDay();
    date.setDate(date.getDate() - (dayOfWeek === 0 ? 2 : 1));
  } else {
    const hour = date.getHours();
    const minute = date.getMinutes();
    if (hour < 9 || (hour === 9 && minute < 30)) {
      date.setDate(date.getDate() - 1);
      while (isWeekend(date)) {
        date.setDate(date.getDate() - 1);
      }
    }
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

async function getLastTradingData(symbol) {
  const istNow = getISTDate();
  const lastTradingDay = getLastTradingDay(istNow);
  const dayStartUTC = new Date(lastTradingDay.getTime() - (5.5 * 60 * 60 * 1000));
  const dayEndUTC = new Date(dayStartUTC.getTime() + (24 * 60 * 60 * 1000));
  return await Stock.findOne({
    symbol,
    timestamp: { $gte: dayStartUTC, $lt: dayEndUTC }
  }).sort({ timestamp: -1 });
}

function computeBidAskFromOHLC(ohlc) {
  const { open, high, low, close } = ohlc;

  // Defensive clamping values
  const aHigh = (high === low) ? high + 0.01 : high;
  const aLow = (low === high) ? low - 0.01 : low;

  const midPrice = (open + close) / 2;

  // --- START: DYNAMIC SPREAD LOGIC ---
  // Base spread (e.g., 0.1%)
  const baseSpreadPct = 0.001; 
  // Add a random factor to simulate market jitter. This will vary the spread slightly.
  // Math.random() gives a value from 0 to 1. Subtracting 0.5 makes it -0.5 to 0.5.
  // This creates a random fluctuation of +/- 0.04% around the base spread.
  const randomFactor = (Math.random() - 0.5) * 0.0008; 
  const dynamicSpreadPct = baseSpreadPct + randomFactor;
  
  // The spread amount is now slightly different on every calculation
  const spreadAmount = midPrice * dynamicSpreadPct;
  // --- END: DYNAMIC SPREAD LOGIC ---

  let bid = midPrice - spreadAmount / 2;
  let ask = midPrice + spreadAmount / 2;

  // Clamp the calculated bid and ask within the bar's high/low
  bid = Math.max(bid, aLow);
  ask = Math.min(ask, aHigh);

  // Final validation to ensure bid is always less than ask
  if (bid >= ask) {
    ask = bid + 0.01; // Use a minimum tick size
    if (ask > aHigh) {
      ask = aHigh;
      bid = ask - 0.01;
    }
  }

  return {
    bid: +bid.toFixed(2),
    ask: +ask.toFixed(2),
    spread: +(ask - bid).toFixed(2),
  };
}


function gaussianRandom(mean = 0, stdDev = 1) {
  let u = 1 - Math.random();
  let v = 1 - Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// --- SIMULATION AND DATA HANDLING ---

let allDataBySymbol = {};
let marketClosed = false;
let simulationInterval = null;
let currentOHLCBars = {};

async function startMarketSimulation() {
  const istNow = getISTDate();
  console.log(`Starting market simulation at ${istNow.toISOString()}`);

  const tradingDay = getLastTradingDay(istNow);
  console.log(`Using trading day: ${tradingDay.toISOString()}`);
  
  const utcStart = new Date(tradingDay.getTime() - (5.5 * 60 * 60 * 1000));
  const utcEnd = new Date(utcStart.getTime() + (24 * 60 * 60 * 1000));
  
  allDataBySymbol = {};
  for (let symbol of stockSymbols) {
    const data = await Stock.find({
      symbol,
      timestamp: { $gte: utcStart, $lt: utcEnd },
    }).sort({ timestamp: 1 });
    allDataBySymbol[symbol] = data;
    if (data.length) {
      console.log(`✅ Loaded ${data.length} records for ${symbol}`);
    } else {
      console.log(`⚠️ No data for ${symbol} on ${tradingDay.toDateString()}`);
    }
  }

  if (!Object.values(allDataBySymbol).some(arr => arr.length > 0)) {
    marketClosed = true;
    console.log("❌ Market closed: No data available for simulation.");
    return;
  }
  
  if (simulationInterval) clearInterval(simulationInterval);

  simulationInterval = setInterval(() => {
    (async () => {
      const istNow = getISTDate();

      if (!isMarketOpenIST()) {
        if (!marketClosed) {
          console.log("Market is currently closed. Showing last data.");
          marketClosed = true;
        }
        // Logic for when market is closed remains the same
        return;
      }
      
      marketClosed = false;

      // Round current time to the nearest second for comparison
      const currentMillis = Math.floor(istNow.getTime() / 1000) * 1000;

      for (let symbol of stockSymbols) {
        const data = allDataBySymbol[symbol];
        if (!data || !data.length) continue;
        
        const exactCandle = data.find(c => new Date(c.timestamp).getTime() === currentMillis);
        
        let ltp;
        let ohlcData;
        
        if (exactCandle) {
          // --- EXACT TIMESTAMP MATCH ---
          // Use the precise data from the database record
          // console.log(`[✔] Exact Match: Using DB data for ${symbol} at ${new Date(currentMillis).toLocaleTimeString('en-IN')}`);
          ltp = exactCandle.close;
          
          ohlcData = {
            open: exactCandle.open,
            high: exactCandle.high,
            low: exactCandle.low,
            close: exactCandle.close,
            timestamp: exactCandle.timestamp.toISOString(),
            volume: exactCandle.volume 
          };

          
          // Set the current bar to this exact data to ensure the next tick builds from it
          currentOHLCBars[symbol] = ohlcData;

          // console.log("ohlc data", currentOHLCBars[symbol]);

        } else {
          // --- INTERPOLATION LOGIC (NO EXACT MATCH) ---
          let before = null, after = null;
          for (let i = 0; i < data.length - 1; i++) {
            if (new Date(data[i].timestamp).getTime() < currentMillis && currentMillis < new Date(data[i+1].timestamp).getTime()) {
              before = data[i];
              after = data[i+1];
              break;
            }
          }

          if (before && after) {
            const ratio = (currentMillis - new Date(before.timestamp).getTime()) / (new Date(after.timestamp).getTime() - new Date(before.timestamp).getTime());
            let price = before.close + (after.close - before.close) * ratio;
            price += gaussianRandom(0, price * 0.0035);
            ltp = +price.toFixed(2);
          } else {
            ltp = data[data.length - 1].close;
          }
          
          // Update the live 1-minute OHLC bar with the new interpolated LTP
          updateOHLCWithLTP(symbol, ltp);
          ohlcData = currentOHLCBars[symbol];
          if (!ohlcData) continue;
        }
        
        // --- COMMON EMISSION LOGIC ---
        const { bid, ask } = computeBidAskFromOHLC(ohlcData);
        
        priceStore[symbol] = {
            ...priceStore[symbol],
            ...ohlcData,
            bidPrice: bid,
            askPrice: ask,
            ltp: ltp,
        };

        io.emit("ohlcWithBidAsk", {
          symbol,
          ...ohlcData,
          bidPrice: bid,
          askPrice: ask,
          ltp: ltp,
        });
      }
    })();
  }, 6000); // Interval set to 5 seconds as in your code
}

function updateOHLCWithLTP(symbol, newPrice) {
    const currentTime = new Date();
    currentTime.setSeconds(0, 0);
    const currentMinute = currentTime.toISOString();

    if (!currentOHLCBars[symbol] || new Date(currentOHLCBars[symbol].timestamp).getTime() < currentTime.getTime()) {
        const openPrice = currentOHLCBars[symbol] ? currentOHLCBars[symbol].close : newPrice;
        currentOHLCBars[symbol] = {
            open: openPrice, high: newPrice, low: newPrice, close: newPrice,
            timestamp: currentMinute, volume: 1,
        };
    } else {
        const bar = currentOHLCBars[symbol];
        bar.high = Math.max(bar.high, newPrice);
        bar.low = Math.min(bar.low, newPrice);
        bar.close = newPrice;
        bar.volume += 1;
    }
}

// --- ORDER EXECUTION ---
setInterval(async () => {
  try {
    const pendingBuyOrders = await BuyOrder.find({ status: "pending" });
    for (const order of pendingBuyOrders) {
      const { _id, symbol, price, quantity, userId } = order;
      const askPrice = priceStore[symbol]?.askPrice;
      if (askPrice && price >= askPrice) {
        const totalCost = price * quantity;
        const userBalance = await Balance.findOne({ userId });
        if (userBalance && userBalance.amount >= totalCost) {
            userBalance.amount -= totalCost;
            await userBalance.save();
            await BuyOrder.updateOne({ _id }, { status: "executed", executionPrice: price });
            io.emit("orderExecuted", { orderId: _id, symbol, type: 'buy', executionPrice: price, quantity, user: userId });
            console.log(`[✔] Buy Order executed: ${_id}`);
        }
      }
    }
    
    const pendingSellOrders = await SellOrder.find({ status: "pending" });
    for (const order of pendingSellOrders) {
      const { _id, symbol, price, quantity, userId } = order;
      const bidPrice = priceStore[symbol]?.bidPrice;
      if (bidPrice && price <= bidPrice) {
        const totalProceeds = price * quantity;
        await Balance.findOneAndUpdate({ userId }, { $inc: { amount: totalProceeds } });
        await SellOrder.updateOne({ _id }, { status: "executed", executionPrice: price });
        io.emit("orderExecuted", { orderId: _id, symbol, type: 'sell', executionPrice: price, quantity, user: userId });
        console.log(`[✔] Sell Order executed: ${_id}`);
      }
    }
  } catch (err) {
    console.error("Error executing orders:", err);
  }
}, 5000);

// --- SOCKET.IO CONNECTION HANDLING ---
io.on("connection", async (socket) => {
  console.log("✅ Client connected");
  
  if (!simulationInterval) {
    await startMarketSimulation();
  }
  
  if (marketClosed) {
    // Market closed logic...
  } else {
    socket.emit("bulkPrice", priceStore);
  }

  socket.on("getSymbolData", (symbol) => {
    if (priceStore[symbol]) {
      socket.emit("ohlcWithBidAsk", { symbol, ...priceStore[symbol] });
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected");
  });
});

// --- SERVER START ---
const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  startMarketSimulation();
});