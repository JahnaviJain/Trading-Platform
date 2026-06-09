const router = require("express").Router();
const Stock = require("../models/stock");
const auth = require("../middleware/auth"); // Also protect this route

// In a real application, this would also be in a database.
const stockMasterData = {
    AAPL: { name: "Apple Inc." },
    GOOG: { name: "Alphabet Inc." },
    MSFT: { name: "Microsoft Corp." },
    TSLA: { name: "Tesla, Inc." },
    IBM: { name: "IBM Corp." },
    WMT: { name: "Walmart Inc." },
    UL: { name: "Unilever PLC" },
};

// POST /api/stocks/bulk-details - Get detailed data for a list of symbols
router.post("/bulk-details", auth, async (req, res) => {
    try {
        const { symbols } = req.body;
        if (!Array.isArray(symbols) || symbols.length === 0) {
            return res.status(400).send({ message: "Request body must be a non-empty array of symbols." });
        }

        const detailPromises = symbols.map(async (symbol) => {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const weeklyData = await Stock.aggregate([
                { $match: { symbol: symbol, timestamp: { $gte: sevenDaysAgo } } },
                { $sort: { timestamp: 1 } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                        dailyClose: { $last: "$close" },
                        totalVolume: { $sum: "$volume" }
                    },
                },
                { $sort: { _id: 1 } },
            ]);
            
            const weeklyPrices = weeklyData.map(day => day.dailyClose);
            const latestVolume = weeklyData.length > 0 ? weeklyData[weeklyData.length - 1].totalVolume : 0;
            const formattedVolume = latestVolume > 1000000 
                ? `${(latestVolume / 1000000).toFixed(2)}M`
                : `${(latestVolume / 1000).toFixed(2)}K`;

            return {
                symbol: symbol,
                name: stockMasterData[symbol]?.name || "Unknown Company",
                weeklyPrices: weeklyPrices,
                volume: formattedVolume,
            };
        });

        const results = await Promise.all(detailPromises);
        res.status(200).json(results);

    } catch (error) {
        console.error("Server error fetching stock details:", error);
        res.status(500).send({ message: "Server error fetching stock details." });
    }
});

module.exports = router;