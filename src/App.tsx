import { useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import { Accounts } from "./components/Accounts";
import { Welcome } from "./components/Welcome";
import type { AppNetwork } from "./constants";
import { loadActiveNetwork, loadWallet } from "./utils/storage";

function App() {
  const [wallet, setWallet] = useState<{ mnemonic: string } | null>(() =>
    loadWallet(),
  );
  const [network] = useState<AppNetwork>(() => loadActiveNetwork());

  const handleWalletCreated = () => {
    const saved = loadWallet();
    if (saved) {
      setWallet(saved);
    }
  };

  const handleLogout = () => {
    setWallet(null);
  };

  // Routing logic
  // If wallet is not present, always redirect to /welcome
  // Otherwise, show routes for accounts, account detail, contacts
  const location = useLocation();

  // Redirect to /welcome if not logged in and not already there
  if (!wallet && location.pathname !== "/welcome") {
    return <Navigate to="/welcome" replace />;
  }

  // Redirect to / if logged in and on /welcome
  if (wallet && location.pathname === "/welcome") {
    return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      <Route
        path="/welcome"
        element={<Welcome onWalletCreated={handleWalletCreated} />}
      />
      <Route
        path="/"
        element={
          <Accounts
            mnemonic={wallet?.mnemonic ?? ""}
            network={network}
            onLogout={handleLogout}
          />
        }
      />
      <Route
        path="/account/:accountId"
        element={
          <Accounts
            mnemonic={wallet?.mnemonic ?? ""}
            network={network}
            onLogout={handleLogout}
            initialView="accountDetail"
          />
        }
      />
      <Route
        path="/contacts"
        element={
          <Accounts
            mnemonic={wallet?.mnemonic ?? ""}
            network={network}
            onLogout={handleLogout}
            initialView="contacts"
          />
        }
      />
    </Routes>
  );
}

export default App;
