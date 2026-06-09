const router = require("express").Router();
const { User } = require("../models/user");
const auth = require("../middleware/auth");

// GET /api/watchlist - Get the user's current watchlist (This route is correct)
router.get("/", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("watchlist");
        if (!user) {
            return res.status(404).send({ message: "User not found." });
        }
        res.status(200).json(user.watchlist);
    } catch (error) {
        console.error("Server error fetching watchlist:", error); // Added for better logging
        res.status(500).send({ message: "Server error fetching watchlist." });
    }
});

// POST /api/watchlist/add - Add a stock to the user's watchlist
router.post("/add", auth, async (req, res) => {
    const { symbol } = req.body;
    if (!symbol) {
        return res.status(400).send({ message: "Stock symbol is required." });
    }
    try {
        // Use $addToSet to add the symbol to the array, preventing duplicates
        const updatedUser = await User.findByIdAndUpdate(req.user._id, {
            $addToSet: { watchlist: symbol } 
        }, { new: true }); // {new: true} returns the updated document
        
        res.status(200).json(updatedUser.watchlist); // Send back the new watchlist
    } catch (error) {
        console.error("Error adding to watchlist:", error); // Added for better logging
        res.status(500).send({ message: "Error adding to watchlist." });
    }
});

// POST /api/watchlist/remove - Remove a stock from the watchlist
router.post("/remove", auth, async (req, res) => {
    const { symbol } = req.body;
    if (!symbol) {
        return res.status(400).send({ message: "Stock symbol is required." });
    }
    try {
        // Use $pull to remove all instances of the symbol from the array
        const updatedUser = await User.findByIdAndUpdate(req.user._id, {
            $pull: { watchlist: symbol } 
        }, { new: true });

        res.status(200).json(updatedUser.watchlist); // Send back the new watchlist
    } catch (error) {
        console.error("Error removing from watchlist:", error); // Added for better logging
        res.status(500).send({ message: "Error removing from watchlist." });
    }
});

module.exports = router;