import { useState } from "react";
import "./App.css";
import { Accounts } from "./components/Accounts";
import { Welcome } from "./components/Welcome";
import type { AppNetwork } from "./constants";
import {
  loadActiveNetwork,
  loadWallet,
  saveActiveNetwork,
} from "./utils/storage";

function App() {
  const [wallet, setWallet] = useState<{ mnemonic: string } | null>(() =>
    loadWallet(),
  );
  const [network, setNetwork] = useState<AppNetwork>(() => loadActiveNetwork());

  const handleWalletCreated = () => {
    const saved = loadWallet();
    if (saved) {
      setWallet(saved);
    }
  };

  const handleLogout = () => {
    setWallet(null);
  };

  const handleNetworkChange = (nextNetwork: AppNetwork) => {
    saveActiveNetwork(nextNetwork);
    setNetwork(nextNetwork);
  };

  if (!wallet) {
    return <Welcome onWalletCreated={handleWalletCreated} />;
  }

  return (
    <Accounts
      mnemonic={wallet.mnemonic}
      network={network}
      onNetworkChange={handleNetworkChange}
      onLogout={handleLogout}
    />
  );
}

export default App;
