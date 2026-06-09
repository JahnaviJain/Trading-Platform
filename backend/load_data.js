const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const mongoose = require("mongoose");
const Stock = require("./models/stock");

const dataDir = path.join(__dirname, "data");

async function connectToDB() {
  try {
    await mongoose.connect("mongodb+srv://devangiparmar68730:JBbrZtz9nTke1l7R@cluster0.e8eow.mongodb.net/stockify?retryWrites=true&w=majority&appName=Cluster0", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err);
    process.exit(1);
  }
}

async function loadCSVFiles() {
  fs.readdir(dataDir, (err, files) => {
    if (err) throw err;

    const csvFiles = files.filter(file => file.endsWith(".csv"));

    if (csvFiles.length === 0) {
      console.log("❗ No CSV files found in the 'data' directory.");
      return;
    }

    let totalFiles = csvFiles.length;
    let filesProcessed = 0;

    csvFiles.forEach(file => {
      const filePath = path.join(dataDir, file);
      const match = file.match(/simulated_(.*?)_live\.csv/);
      const symbolFromFilename = match ? match[1] : "UNKNOWN";

      const promises = []; // collect save promises

      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
          const newStock = new Stock({
            timestamp: new Date(row.timestamp),
            symbol: symbolFromFilename,
            open: parseFloat(row.open),
            high: parseFloat(row.high),
            low: parseFloat(row.low),
            close: parseFloat(row.close),
          });

          promises.push(newStock.save().catch(err => {
            console.error(`❌ Error saving row from ${file}:`, err.message);
          }));
        })
        .on("end", async () => {
          try {
            await Promise.all(promises); // wait for all saves to complete
            console.log(`✅ Finished processing ${file}`);
          } catch (err) {
            console.error(`❌ Error processing ${file}:`, err);
          }

          filesProcessed++;
          if (filesProcessed === totalFiles) {
            console.log("✅ All files loaded successfully.");
            mongoose.disconnect();
            process.exit();
          }
        });
    });
  });
}



(async () => {
  await connectToDB();
  await loadCSVFiles();
})();
