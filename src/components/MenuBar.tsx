import { useEffect, useRef, useState } from "react";
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
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (menuContainerRef.current?.contains(target)) {
        return;
      }

      setShowMenu(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showMenu]);

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
      <div className="menu-title">
        Be Cool · {NETWORK_CONFIG[network].label}
      </div>

      <div className="menu-container" ref={menuContainerRef}>
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
