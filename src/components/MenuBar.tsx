import { useState } from "react";
import type { AppNetwork } from "../constants";
import { NETWORK_CONFIG } from "../constants";
import { clearWallet } from "../utils/storage";
import "./MenuBar.css";

interface MenuBarProps {
  mnemonic: string;
  network: AppNetwork;
  onNetworkChange: (network: AppNetwork) => void;
  onOpenContacts: () => void;
  onLogout: () => void;
}

export function MenuBar({
  mnemonic,
  network,
  onNetworkChange,
  onOpenContacts,
  onLogout,
}: MenuBarProps) {
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

  const handleToggleNetwork = () => {
    const nextNetwork: AppNetwork =
      network === "testnet" ? "signet" : "testnet";
    onNetworkChange(nextNetwork);
    setShowMenu(false);
  };

  const handleOpenContacts = () => {
    onOpenContacts();
    setShowMenu(false);
  };

  return (
    <div className="menu-bar">
      <div className="menu-title">Bitcoin {NETWORK_CONFIG[network].label}</div>

      <div className="menu-container">
        <button className="menu-button" onClick={() => setShowMenu(!showMenu)}>
          <span></span>
          <span></span>
          <span></span>
        </button>

        {showMenu && (
          <div className="menu-dropdown">
            <button onClick={handleOpenContacts} className="menu-item">
              <span className="menu-icon">👥</span>
              Kontakty
            </button>
            <button onClick={handleCopySeed} className="menu-item">
              <span className="menu-icon">📋</span>
              {copied ? "Zkopírováno!" : "Zkopírovat seed"}
            </button>
            <button onClick={handleToggleNetwork} className="menu-item">
              <span className="menu-icon">🌐</span>
              Přepnout na {network === "testnet" ? "Signet" : "Testnet"}
            </button>
            <button
              onClick={handleLogout}
              className="menu-item menu-item-danger"
            >
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
