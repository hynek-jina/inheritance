import { useState } from "react";
import "./App.css";
import { Accounts } from "./components/Accounts";
import { Welcome } from "./components/Welcome";
import { loadWallet } from "./utils/storage";

function App() {
  const [wallet, setWallet] = useState<{ mnemonic: string } | null>(() =>
    loadWallet(),
  );

  const handleWalletCreated = () => {
    const saved = loadWallet();
    if (saved) {
      setWallet(saved);
    }
  };

  const handleLogout = () => {
    setWallet(null);
  };

  if (!wallet) {
    return <Welcome onWalletCreated={handleWalletCreated} />;
  }

  return <Accounts mnemonic={wallet.mnemonic} onLogout={handleLogout} />;
}

export default App;
