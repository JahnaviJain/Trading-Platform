const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const socketIo = require("socket.io");
const cors = require("cors");
const Stock = require("./models/stock");
// const BuyOrder = require("../models/BuyOrder");
// const SellOrder = require("./models/SellOrder");
const priceStore = require("./priceStore");
const orderRoutes = require("./routes/orders"); 
const Order = require("./models/order");// <-- Import without using yet


const app = express();
app.use(cors());
app.use(express.json());

// app.use("/api/orders", orderRoutes);

// In-memory price store (last buy/sell/ltp per symbol)

const stockSymbols = ["AAPL","GOOG","MSFT","WMT","TSLA","IBM","UL"];

function isMarketOpenIST() {
  const nowIST = getISTDate();
  const hour = nowIST.getHours();
  const minute = nowIST.getMinutes();
  if (hour < 9 || (hour === 9 && minute < 30)) return false;
  if (hour > 15 || (hour === 15 && minute >= 59)) return false;
  return true;
}


// app.get('/api/ohlc/:symbol', async (req, res) => {
//   try {
//     const symbol = req.params.symbol;
//     const todayStart = new Date();
//     todayStart.setHours(0, 0, 0, 0);

//     const latestStock = await Stock.findOne({
//       symbol: symbol,
//       timestamp: { $gte: todayStart }
//     }).sort({ timestamp: -1 });

//     if (!latestStock) {
//       return res.status(404).json({ message: 'No recent OHLC available' });
//     }

//     res.json(latestStock);
//   } catch (error) {
//     console.error('Error fetching latest OHLC:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

let currentOHLCBars = {};

// Initialize OHLC bars for each symbol
function initializeOHLCBars() {
  stockSymbols.forEach(symbol => {
    if (!currentOHLCBars[symbol]) {
      const currentPrice = priceStore[symbol]?.ltp || 0;
      const currentTime = new Date();
      currentTime.setSeconds(0, 0); // Round to current minute
      
      currentOHLCBars[symbol] = {
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice,
        timestamp: currentTime.toISOString(),
        volume: 0
      };
    }
  });
}

// Update OHLC with new LTP data
function updateOHLCWithLTP(symbol, newPrice) {
  const currentTime = new Date();
  currentTime.setSeconds(0, 0); // Round to current minute
  const currentMinute = currentTime.toISOString();
  
  if (!currentOHLCBars[symbol]) {
    // Initialize if doesn't exist
    currentOHLCBars[symbol] = {
      open: newPrice,
      high: newPrice,
      low: newPrice,
      close: newPrice,
      timestamp: currentMinute,
      volume: 0
    };
  } else {
    const existingBar = currentOHLCBars[symbol];
    const existingMinute = new Date(existingBar.timestamp);
    existingMinute.setSeconds(0, 0);
    
    // Check if we're in a new minute
   if (currentTime.getTime() > existingMinute.getTime()) {
  // Ensure we emit at least once every new minute
  const lastBar = currentOHLCBars[symbol];

  // ✅ Emit the existing OHLC again, even if unchanged
  io.emit("ohlcUpdate", {
    symbol,
    open: lastBar.open,
    high: lastBar.high,
    low: lastBar.low,
    close: lastBar.close,
    timestamp: lastBar.timestamp,
    volume: lastBar.volume
  });

  // ✅ Start new bar for the new minute
  currentOHLCBars[symbol] = {
    open: lastBar.close,
    high: lastBar.close,
    low: lastBar.close,
    close: lastBar.close,
    timestamp: currentMinute,
    volume: 0
  };
}
 else {
      // Same minute - update current bar
      currentOHLCBars[symbol] = {
        ...existingBar,
        high: Math.max(existingBar.high, newPrice),
        low: Math.min(existingBar.low, newPrice),
        close: newPrice,
        volume: existingBar.volume + 1
      };
    }
  }
  
  // Emit the updated current bar
  io.emit("ohlcUpdate", {
    symbol,
    open: currentOHLCBars[symbol].open,
    high: currentOHLCBars[symbol].high,
    low: currentOHLCBars[symbol].low,
    close: currentOHLCBars[symbol].close,
    timestamp: currentOHLCBars[symbol].timestamp,
    volume: currentOHLCBars[symbol].volume
  });
}

app.get("/ohlc/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    // Fetch latest OHLC for the symbol
    const latest = await Stock.findOne({ symbol }).sort({ timestamp: -1 });

    if (latest) {
      res.json({
        symbol,
        open: latest.open,
        high: latest.high,
        low: latest.low,
        close: latest.close,
        timestamp: latest.timestamp,
      });
    } else {
      res.status(404).json({ error: "No data found for symbol." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// app.get("/api/ohlc/:symbol", async (req, res) => {
//   try {
//     const symbol = req.params.symbol.toUpperCase();

//     const nowUTC = new Date();

//     // Convert now to IST
//     const nowIST = new Date(nowUTC.getTime() + 5.5 * 60 * 60 * 1000);
//     const year = nowIST.getFullYear();
//     const month = String(nowIST.getMonth() + 1).padStart(2, "0");
//     const day = String(nowIST.getDate()).padStart(2, "0");

//     const dateStr = `${year}-${month}-${day}`;

//     const openIST = new Date(`${dateStr}T09:30:00+05:30`);
//     const closeIST = new Date(`${dateStr}T15:59:00+05:30`);
//     const openUTC = new Date(openIST.toISOString());
//     const closeUTC = new Date(closeIST.toISOString());

//     if (nowUTC >= closeUTC) {
//       // After market close → return the 3:59 PM candle only
//       const candle = await Stock.findOne({
//         symbol,
//         timestamp: {
//           $gte: closeUTC,
//           $lt: new Date(closeUTC.getTime() + 60 * 1000),
//         },
//       }).sort({ timestamp: -1 });

//       if (!candle) return res.status(404).json({ message: "No 3:59 PM candle found" });
//       return res.json(candle);
//     } else if (nowUTC >= openUTC && nowUTC < closeUTC) {
//       // Market open → fetch latest live candle
//       const candle = await Stock.findOne({ symbol }).sort({ timestamp: -1 });
//       if (!candle) return res.status(404).json({ message: "No live candle found" });
//       return res.json(candle);
//     } else {
//       // Before market open (9:30 AM IST)
//       return res.status(200).json({ message: "Market is closed" });
//     }
//   } catch (err) {
//     console.error("OHLC Fetch Error:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });


// app.get("/api/ohlc/:symbol", async (req, res) => {
//   try {
//     const symbol = req.params.symbol.toUpperCase();

//     const nowUTC = new Date();

//     // Convert current UTC to IST
//     const nowIST = new Date(nowUTC.getTime() + 5.5 * 60 * 60 * 1000);
//     const year = nowIST.getFullYear();
//     const month = String(nowIST.getMonth() + 1).padStart(2, "0");
//     const date = String(nowIST.getDate()).padStart(2, "0");

//     const currentDate = `${year}-${month}-${date}`;

//     // Construct 9:30 AM IST and 3:59 PM IST in UTC
//     const marketOpenIST = new Date(`${currentDate}T09:30:00+05:30`);
//     const marketCloseIST = new Date(`${currentDate}T15:59:00+05:30`);
//     const marketOpenUTC = new Date(marketOpenIST.toISOString());
//     const marketCloseUTC = new Date(marketCloseIST.toISOString());

//     let candle;

//     if (nowUTC >= marketCloseUTC || nowUTC < marketOpenUTC) {
//       // After market close OR before market open next day: fetch 3:59 PM candle of current day
//       candle = await Stock.findOne({
//         symbol,
//         timestamp: {
//           $gte: marketCloseUTC,
//           $lt: new Date(marketCloseUTC.getTime() + 60 * 1000),
//         },
//       }).sort({ timestamp: -1 });
//     } else {
//       // During market hours
//       candle = await Stock.findOne({ symbol }).sort({ timestamp: -1 });
//     }

//     if (!candle) {
//       return res.status(404).json({ message: "No OHLC data found for this time." });
//     }

//     // Add formatted IST time to response
//     const candleIST = new Date(new Date(candle.timestamp).getTime() + 5.5 * 60 * 60 * 1000);
//     const formattedISTTime = candleIST.toLocaleTimeString("en-IN", {
//       hour: "2-digit",
//       minute: "2-digit",
//       second: "2-digit",
//       hour12: true,
//     });

//     return res.json({ ...candle.toObject(), formattedISTTime });

//   } catch (err) {
//     console.error("OHLC Fetch Error:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });






// Helper: get latest LTP via DB
async function updateInitialPrice(symbol) {
  const doc = await Stock.findOne({ symbol }).sort({ timestamp: -1 });
  if (!doc) return;
  priceStore[symbol] = { ltp: doc.close, buyPrice: null, sellPrice: null };
}

Promise.all(stockSymbols.map(updateInitialPrice));


const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// app.use("/api/orders", orderRoutes(io));
mongoose.connect(
  "mongodb+srv://devangiparmar68730:JBbrZtz9nTke1l7R@cluster0.e8eow.mongodb.net/stockify?retryWrites=true&w=majority&appName=Cluster0",
  { useNewUrlParser: true, useUnifiedTopology: true }
);

function getISTDate() {
  const now = new Date();
  const istOffset = 5.5 * 60;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + istOffset * 60000);
}


// ✅ Order Execution Logic
 io.on("connection", (socket) => {
console.log("Client connected to Socket.IO");

  // setInterval(async () => {
  //   try {
  //     const latestStock = await Stock.findOne({ symbol: "AAPL" }).sort({ timestamp: -1 });
  //     if (!latestStock) return;

  //     const ltp = latestStock.close;

  //     const pendingOrders = await Order.find({ status: "pending" });

  //     for (let order of pendingOrders) {
  //       if (order.type === "market") {
  //         order.status = "executed";
  //         order.executedPrice = ltp;
  //         await order.save();
  //       } else if (order.type === "limit") {
  //         if (order.side === "buy" && ltp <= order.price) {
  //           order.status = "executed";
  //           order.executedPrice = ltp;
  //           await order.save();
  //         } else if (order.side === "sell" && ltp >= order.price) {
  //           order.status = "executed";
  //           order.executedPrice = ltp;
  //           await order.save();
  //         }
  //       }
  //     }

  //     socket.emit("ltp", { symbol: "AAPL", ltp });
  //   } catch (err) {
  //     console.error("Order Execution Error:", err);
  //   }
  // }, 1000);
//   setInterval(async () => {
//   const pendingOrders = await Order.find({ status: "pending" });

//   for (const order of pendingOrders) {
//     const { _id, type, symbol, side, price, quantity, userId } = order;
//     const ltp = priceStore[symbol]?.ltp;
//     if (!ltp) continue;

//     let shouldExecute = false;
//     let executionPrice = price;

//     if (type === "market") {
//       shouldExecute = true;
//       executionPrice = ltp;
//     } else if (type === "limit") {
//       if (side === "buy" && price >= ltp) {
//         shouldExecute = true;
//       } else if (side === "sell" && price <= ltp) {
//         shouldExecute = true;
//       }
//     }

//     if (shouldExecute) {
//       await Order.updateOne(
//         { _id },
//         { status: "executed", executedPrice: executionPrice }
//       );

//       if (side === "buy") {
//         priceStore[symbol].buyPrice = executionPrice;
//       } else if (side === "sell") {
//         priceStore[symbol].sellPrice = executionPrice;
//       }

//       io.emit("orderExecuted", {
//         orderId: _id,
//         symbol,
//         side,
//         executionPrice,
//         quantity,
//         userId,
//       });

//       console.log(`✅ Executed ${side.toUpperCase()} ${symbol} at ${executionPrice}`);
//     }
//   }
// }, 1000);
setInterval(async () => {
  try {
    const pendingOrders = await Order.find({ status: "pending" });

    for (const order of pendingOrders) {
      const { _id, type, symbol, price, quantity, user } = order;

      const latestLTP = priceStore[symbol]?.ltp;
      const lastBuy = priceStore[symbol]?.buyPrice ?? latestLTP;
      const lastSell = priceStore[symbol]?.sellPrice ?? latestLTP;

      let shouldExecute = false;
      let execPrice = latestLTP;

      if (order.orderType === "market") {
        // ✅ Market orders: execute immediately at current LTP
        shouldExecute = true;
      } else if (order.orderType === "limit") {
        // ✅ Limit orders: check if condition is met
        if (type === "buy" && price >= lastBuy) {
          shouldExecute = true;
          execPrice = price;
          priceStore[symbol].buyPrice = execPrice;
        } else if (type === "sell" && price <= lastSell) {
          shouldExecute = true;
          execPrice = price;
          priceStore[symbol].sellPrice = execPrice;
        }
      }

      if (shouldExecute) {
        await Order.updateOne(
          { _id },
          { status: "executed", executionPrice: execPrice }
        );

        // Emit update to frontend
        io.emit("orderExecuted", {
          orderId: _id,
          symbol,
          type,
          executionPrice: execPrice,
          quantity,
          user,
        });

        console.log(`[✔] Order executed: ${type.toUpperCase()} ${symbol} at ${execPrice}`);
      }
    }
  } catch (err) {
    console.error("Error checking and executing orders:", err);
  }
}, 1000); // every second

 });

 // Helper: round date to the start of the current minute
const roundToMinute = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes());
};

// // Emit OHLC every 60 seconds, aligned to the clock
// const emitOhlc = async () => {
//   const now = new Date();
//   const roundedTime = roundToMinute(now);

//   try {
//     const ohlc = await Stock.findOne({ timestamp: roundedTime });

//     if (ohlc) {
//       io.emit("ohlcData", {
//         timestamp: ohlc.timestamp,
//         symbol: ohlc.symbol,
//         open: ohlc.open,
//         high: ohlc.high,
//         low: ohlc.low,
//         close: ohlc.close,
//         volume: ohlc.volume,
//       });
//     } else {
//       console.log("No OHLC found for", roundedTime.toISOString());
//     }
//   } catch (error) {
//     console.error("Error emitting OHLC:", error);
//   }
// };

// // Align the first emit to the start of the next minute
// const startOhlcInterval = () => {
//   const now = new Date();
//   const delayUntilNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());

//   setTimeout(() => {
//     emitOhlc(); // emit immediately at the top of the minute
//     setInterval(emitOhlc, 60000); // every 60s after that
//   }, delayUntilNextMinute);
// };

// startOhlcInterval();




let allDataBySymbol = {};
let marketClosed = false;
let simulationInterval = null;

function getUtcRangeForTodayIST() {
  const now = new Date();
  const istNow = getISTDate();
  const istDate = new Date(istNow);
  istDate.setHours(0, 0, 0, 0);
  const utcStart = new Date(istDate.getTime() - 5.5 * 60 * 60 * 1000);
  const utcEnd = new Date(utcStart.getTime() + 24 * 60 * 60 * 1000);
  return { utcStart, utcEnd };
}

app.get('/api/ohlc/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol;
    // Find latest OHLC data for symbol (customize as per your DB schema and need)
    const ohlc = await Stock.findOne({ symbol }).sort({ timestamp: -1 });
    
    if (!ohlc) {
      return res.status(404).json({ message: 'No OHLC data found for symbol' });
    }
    
    // Optionally filter or transform the data object before sending
    res.json({
      symbol: ohlc.symbol,
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
      timestamp: ohlc.timestamp,
    });
  } catch (error) {
    console.error("Error in /api/ohlc/:symbol", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/orders/:side', async (req, res) => {
  try {
    const side = req.params.side.toLowerCase(); // should be 'buy' or 'sell'
    const { userId, symbol, type, quantity, price } = req.body;

    // Basic validation
    if (!userId || !symbol || !type || !quantity) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (side !== 'buy' && side !== 'sell') {
      return res.status(400).json({ error: "Invalid side" });
    }

    // Create new order document (adjust as your schema requires)
    const order = new Order({
      user: userId,
      symbol,
      type,
      quantity,
      price: price || null,
      status: "pending",
      orderType: type, // to distinguish e.g., market / limit
      side,
      createdAt: new Date()
    });

    await order.save();

    res.json({ message: "Order placed successfully", order });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// function generateRealisticTicks([timestamp, open, high, low, close, volume], numTicks = 30) {
//   const ticks = [];
//   const mean = close;
//   const stddev = (high - low) / 6 || 0.01;

//   for (let i = 0; i < numTicks; i++) {
//     let u1 = Math.random();
//     let u2 = Math.random();
//     let randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
//     let price = mean + stddev * randStdNormal;
//     price = Math.max(Math.min(price, high), low);
//     const biasFactor = i / numTicks;
//     price = price * (1 - biasFactor) + close * biasFactor;
//     const jitter = (Math.random() - 0.5) * 0.02;
//     const ltp = +(price + jitter).toFixed(2);
//     ticks.push(ltp);
//   }
//   return ticks;
// }

// Gaussian noise generator (mean 0, standard deviation 1)
function gaussianRandom(mean = 0, stdDev = 1) {
  let u = 1 - Math.random();
  let v = 1 - Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}



async function startMarketSimulation() {
  const { utcStart, utcEnd } = getUtcRangeForTodayIST();
  allDataBySymbol = {};
  marketClosed = false;

  for (let symbol of stockSymbols) {
    const data = await Stock.find({
      symbol,
      timestamp: { $gte: utcStart, $lt: utcEnd },
    }).sort({ timestamp: 1 });
    allDataBySymbol[symbol] = data;
    if (!data.length) console.log(`⚠️ No data for ${symbol}`);
  }

  const anyDataExists = Object.values(allDataBySymbol).some(arr => arr.length > 0);
  if (!anyDataExists) {
    marketClosed = true;
    console.log("❌ Market closed: No data for today.");
    return;
  }

 const lastPrices = stockSymbols
    .map(sym => allDataBySymbol[sym]?.at(-1))
    .filter(Boolean);

  // BEFORE this emission you must loop per symbol
//   lastPrices.forEach(todayLast => {
//     const symbol = todayLast.symbol;
//     io.emit("ltp", {
//       symbol,
//       ltp: todayLast.close,
//       open: todayLast.open,           // include open
//       timestamp: todayLast.timestamp,

//     });
// const current = priceStore[symbol] || {};
// const ltpRounded = +price.toFixed(2);

// priceStore[symbol] = {
//   ...current,
//   ltp: ltpRounded,
//   open: current.open ?? before.open,
//   high: current.high ? Math.max(current.high, ltpRounded) : ltpRounded,
//   low: current.low ? Math.min(current.low, ltpRounded) : ltpRounded,
//   close: ltpRounded,
// };

// io.emit("ohlcUpdate", {
//   symbol,
//   open: priceStore[symbol].open,
//   high: priceStore[symbol].high,
//   low: priceStore[symbol].low,
//   close: priceStore[symbol].close,
//   timestamp: istNow.toISOString(),
// });

// const marketOpenTime = new Date();
// marketOpenTime.setHours(9, 15, 0, 0);

// if (now.getHours() === 9 && now.getMinutes() === 15) {
//   for (const symbol in priceStore) {
//     const open = priceStore[symbol].ltp;
//     priceStore[symbol] = {
//       ltp: open,
//       open: open,
//       high: open,
//       low: open,
//       close: open,
//     };
//   }
// }



//   });

lastPrices.forEach(todayLast => {
  const symbol = todayLast.symbol;
  const current = priceStore[symbol] || {};
  const ltpRounded = +todayLast.close.toFixed(2);

  priceStore[symbol] = {
    ...current,
    ltp: ltpRounded,
    open: current.open ?? todayLast.open,
    high: current.high ? Math.max(current.high, ltpRounded) : ltpRounded,
    low: current.low ? Math.min(current.low, ltpRounded) : ltpRounded,
    close: ltpRounded,
  };

  io.emit("ohlcUpdate", {
    symbol,
    open: priceStore[symbol].open,
    high: priceStore[symbol].high,
    low: priceStore[symbol].low,
    close: priceStore[symbol].close,
    timestamp: new Date().toISOString(),
  });
});


  // console.log("📦 Sent today's last available data before market opens.");

  // then setup simulationInterval as before:
  if (simulationInterval) clearInterval(simulationInterval);

  simulationInterval = setInterval(() => {
    
    (async () => {
      // inside per-symbol loop:
      for (let symbol of stockSymbols) {
        const data = allDataBySymbol[symbol];
        if (!data?.length) continue;
        const istNow = getISTDate();
        const currentMillis = istNow.getTime();

        // find before/after candles
        let before = null, after = null;
        for (let i = 0; i < data.length - 1; i++) {
          const d1 = data[i], d2 = data[i+1];
          const t1 = new Date(d1.timestamp).getTime();
          const t2 = new Date(d2.timestamp).getTime();
          if (t1 <= currentMillis && currentMillis <= t2) {
            before = d1; after = d2;
            break;
          }
        }

        if (before && after) {
  const t1 = new Date(before.timestamp).getTime();
  const t2 = new Date(after.timestamp).getTime();
  const ratio = (currentMillis - t1) / (t2 - t1);
  let price = before.close + (after.close - before.close) * ratio;

  const stdDevPercentage = 0.002;
  const noise = gaussianRandom(0, price * stdDevPercentage);
  price += noise;

  const clampFactor = 0.01;
  const minPrice = price * (1 - clampFactor);
  const maxPrice = price * (1 + clampFactor);
  price = Math.max(minPrice, Math.min(maxPrice, price));

  priceStore[symbol] = { ...priceStore[symbol], ltp: +price.toFixed(2) };

  io.emit("ltp", {
    symbol,
    ltp: +price.toFixed(2),
    open: before.open,
    timestamp: istNow.toISOString(),
  });
}

        else {
          const hours = istNow.getHours(), mins = istNow.getMinutes();
          const afterClose = hours > 15 || (hours === 15 && mins >= 30);
          const beforeOpen = hours < 9 || (hours === 9 && mins < 30);

          if (afterClose) {
            const last = data.at(-1);
            io.emit("ltp", {
              symbol,
              ltp: last.close,
              open: last.open,
              timestamp: last.timestamp,
            });
          }
          else if (beforeOpen) {
            const prev = await Stock.find({ symbol }).sort({ timestamp: -1 });
            const prevClose = prev.find(d => new Date(d.timestamp).getTime() < new Date(data[0].timestamp).getTime());
            if (prevClose) {
              io.emit("ltp", {
                symbol,
                ltp: prevClose.close,
                open: prevClose.open,
                timestamp: prevClose.timestamp,
              });
            }
          }
        }
      }
    })();
  }, 1000);
}

setInterval(async () => {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  if (istNow.getHours() === 9 && istNow.getMinutes() === 15) {
    console.log("🕘 9:15 AM IST reached. Restarting market simulation.");
    await startMarketSimulation();
  }
}, 5000);

io.on("connection", async (socket) => {
  console.log("✅ Client connected");

  // Start simulation if not already
  if (!simulationInterval && !marketClosed) {
    await startMarketSimulation();
  }

  // Send static prices if market closed
  if (marketClosed) {
    const lastPrices = stockSymbols.map(sym => allDataBySymbol[sym]?.at(-1)).filter(Boolean);
    const timestamps = lastPrices.map(p => new Date(p.timestamp).getTime());
    const lastTime = new Date(Math.max(...timestamps)).toISOString();
    socket.emit("market-closed", { lastPrices, lastTime });
    return;
  }

  // Send current price store on connect
  socket.emit("bulkPrice", priceStore);
});


// // Listen for new buy order
// app.post("/api/orders/buy", async (req, res) => {
//   const { userId, symbol, quantity, type } = req.body;
//   const ref = priceStore[symbol] || {};
//   const executedPrice = ref.ltp;

//   const order = await BuyOrder.create({
//     userId, symbol, type, quantity, price: executedPrice, status: "executed"
//   });

//   // update priceStore
//   priceStore[symbol] = { ...ref, buyPrice: executedPrice };

//   io.emit("orderUpdate", { symbol, buyPrice: executedPrice });
//   res.json({ order });
// });

// // Similarly for sell
// app.post("/api/orders/sell", async (req, res) => {
//   const { userId, symbol, quantity, type } = req.body;
//   const ref = priceStore[symbol] || {};
//   const executedPrice = ref.ltp;

//   const order = await SellOrder.create({
//     userId, symbol, type, quantity, price: executedPrice, status: "executed"
//   });

//   priceStore[symbol] = { ...ref, sellPrice: executedPrice };
//   io.emit("orderUpdate", { symbol, sellPrice: executedPrice });
//   res.json({ order });
// });


// // Realtime LTP simulator (simplified)
// async function simulateLtp() {
//   for (let symbol of stockSymbols) {
//     const doc = await Stock.findOne({ symbol }).sort({ timestamp: -1 });
//     if (!doc) continue;
//     const newLtp = doc.close;  // or your generated tick
//     priceStore[symbol] = { ...priceStore[symbol], ltp: newLtp };
//     io.emit("ltp", { symbol, ltp: newLtp });
//   }
// }

// setInterval(simulateLtp, 1000);



// // ⏱ Emit OHLC every minute for all symbols
// const emitOHLCData = async () => {
//   try {
//     if (isMarketOpenIST()) {
//       // Market open: emit real-time OHLC for each symbol as before
//       const now = new Date();
//       now.setSeconds(0, 0);
//       // const oneMinuteAgo = new Date(now.getTime() - 60000);

//       for (let symbol of stockSymbols) {
//         const ohlc = await Stock.findOne({
//           symbol,
//           // timestamp: { $gte: oneMinuteAgo, $lt: now }
//           timestamp: now,
//         }).sort({ timestamp: -1 });

//         if (ohlc) {
//           io.emit("ohlcUpdate", {
//             symbol,
//             open: ohlc.open,
//             high: ohlc.high,
//             low: ohlc.low,
//             close: ohlc.close,
//             timestamp: ohlc.timestamp,
//           });
//           console.log(`[${symbol}] OHLC emitted at ${now.toLocaleTimeString()}`);
//         }
//       }
//     } else {
//       // Market closed: Emit last 3:59pm OHLC ONLY
//       // get today's date in IST, then create 15:59 IST in UTC
//       const istNow = getISTDate();
//       const year = istNow.getFullYear();
//       const month = `${istNow.getMonth() + 1}`.padStart(2, "0");
//       const day = `${istNow.getDate()}`.padStart(2, "0");
//       const marketCloseIST = new Date(`${year}-${month}-${day}T15:59:00+05:30`);
//       const marketCloseUTC = new Date(marketCloseIST.toISOString());

//       for (let symbol of stockSymbols) {
//         const bar359 = await Stock.findOne({
//           symbol,
//           timestamp: { $gte: marketCloseUTC, $lt: new Date(marketCloseUTC.getTime() + 60 * 1000) }
//         }).sort({ timestamp: -1 });

//         if (bar359) {
//           io.emit("ohlcUpdate", {
//             symbol,
//             open: bar359.open,
//             high: bar359.high,
//             low: bar359.low,
//             close: bar359.close,
//             timestamp: bar359.timestamp,
//           });
//           console.log(`[${symbol}] Persisting after-hours: 3:59pm OHLC candle`);
//         }
//       }
//     }
//   } catch (err) {
//     console.error("Error emitting OHLC data:", err.message);
//   }
// };

const startAlignedOHLCEmitter = () => {
  const now = new Date();
  const msUntilNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());

  setTimeout(() => {
    emitOHLCData(); // First aligned emit
    setInterval(emitOHLCData, 60000); // Then emit every 60 sec on the dot
  }, msUntilNextMinute);
};

startAlignedOHLCEmitter(); // Call this at server startup


// // 🕒 Run every 60 seconds
// setInterval(emitOHLCData, 60000);

// // Also run immediately at server start
// emitOHLCData();

server.listen(8080, () => {
  console.log("🚀 Server running on http://localhost:8080");
});
