import { useState } from "react";
import type { AppNetwork } from "../constants";
import { NETWORK_CONFIG } from "../constants";
import { clearWallet } from "../utils/storage";
import "./MenuBar.css";

interface MenuBarProps {
  mnemonic: string;
  network: AppNetwork;
  onPasteAccount: () => Promise<void>;
  onOpenContacts: () => void;
  onLogout: () => void;
}

export function MenuBar({
  mnemonic,
  network,
  onPasteAccount,
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

  const handleOpenContacts = () => {
    onOpenContacts();
    setShowMenu(false);
  };

  const handlePasteAccount = () => {
    setShowMenu(false);
    void onPasteAccount();
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
            <button onClick={handlePasteAccount} className="menu-item">
              <span className="menu-icon">📥</span>
              Vložit účet
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
