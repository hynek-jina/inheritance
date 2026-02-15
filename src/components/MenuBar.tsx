import { useState } from 'react';
import { clearWallet } from '../utils/storage';
import './MenuBar.css';

interface MenuBarProps {
  mnemonic: string;
  onLogout: () => void;
}

export function MenuBar({ mnemonic, onLogout }: MenuBarProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopySeed = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setShowMenu(false);
  };

  const handleLogout = () => {
    clearWallet();
    onLogout();
  };

  return (
    <div className="menu-bar">
      <div className="menu-title">Bitcoin Testnet</div>
      
      <div className="menu-container">
        <button 
          className="menu-button"
          onClick={() => setShowMenu(!showMenu)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        {showMenu && (
          <div className="menu-dropdown">
            <button onClick={handleCopySeed} className="menu-item">
              <span className="menu-icon">📋</span>
              {copied ? 'Zkopírováno!' : 'Zkopírovat seed'}
            </button>
            <button onClick={handleLogout} className="menu-item menu-item-danger">
              <span className="menu-icon">🚪</span>
              Odhlásit se
            </button>
          </div>
        )}
      </div>

      {showMenu && (
        <div className="menu-overlay" onClick={() => setShowMenu(false)} />
      )}
    </div>
  );
}