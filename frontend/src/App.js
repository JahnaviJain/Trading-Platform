
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";

import Signup from "./components/Singup";
import Login from "./components/Login";
import TradePage from "./components/TradePage";
import AddBalance from "./components/AddBalance";
import Portfolio from "./components/Portfolio";
import NewsPage from "./components/NewsPage";
import OrderExecutionUI from "./components/OrderExecutionUI";
import TradingPage from "./components/TradingPage";
import WatchlistPage from "./components/WatchlistPage";
import MarketStats from "./components/stat";


const App = () => {
  const user = localStorage.getItem("token");

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/signup" exact element={<Signup />} />
          <Route path="/login" exact element={<Login />} />
          {user && (
            <>
              <Route path="/home" element={<TradePage />} />
              <Route path="/news/:ticker" element={<NewsPage   />} />


              <Route path="/wallet/balance" element={<AddBalance />} />

                 <Route path="/portfolio" element={<Portfolio />} />
                    <Route path="/trade/:symbol" element={<TradingPage />} />
                    <Route path="/watchlist" element={<WatchlistPage />} />
                    <Route path="/stat" element={<MarketStats />} />
            </>
          )}


          <Route path="/" element={<Navigate replace to="/login" />} />

          <Route path="/home" exact element={<TradePage />} />



        </Routes>

      </div>
    </Router>
  );
};

export default App;