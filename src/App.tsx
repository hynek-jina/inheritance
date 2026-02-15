import { useState, useEffect } from 'react';
import { Welcome } from './components/Welcome';
import { Accounts } from './components/Accounts';
import { loadWallet } from './utils/storage';
import './App.css';

function App() {
  const [wallet, setWallet] = useState<{ mnemonic: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const saved = loadWallet();
    if (saved) {
      setWallet(saved);
    }
    setIsLoading(false);
  }, []);

  const handleWalletCreated = () => {
    const saved = loadWallet();
    if (saved) {
      setWallet(saved);
    }
  };

  const handleLogout = () => {
    setWallet(null);
  };

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!wallet) {
    return <Welcome onWalletCreated={handleWalletCreated} />;
  }

  return <Accounts mnemonic={wallet.mnemonic} onLogout={handleLogout} />;
}

export default App;