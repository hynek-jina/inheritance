import { useEffect, useRef, useState } from "react";
import type { AppLanguage, AppNetwork } from "../constants";
import { NETWORK_CONFIG } from "../constants";
import { clearWallet } from "../utils/storage";
import "./MenuBar.css";

interface MenuBarProps {
  mnemonic: string;
  network: AppNetwork;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  onPasteAccount: () => Promise<void>;
  onOpenContacts: () => void;
  onLogout: () => void;
}

export function MenuBar({
  mnemonic,
  network,
  language,
  onLanguageChange,
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

  const labels =
    language === "cs"
      ? {
          contacts: "Kontakty",
          copySeed: "Zkopírovat seed",
          copied: "Zkopírováno!",
          pasteAccount: "Vložit účet",
          language: "Jazyk",
          logout: "Odhlásit se",
        }
      : {
          contacts: "Contacts",
          copySeed: "Copy seed phrase",
          copied: "Copied!",
          pasteAccount: "Paste account",
          language: "Language",
          logout: "Log out",
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
              {labels.contacts}
            </button>
            <button onClick={handleCopySeed} className="menu-item">
              <span className="menu-icon">📋</span>
              {copied ? labels.copied : labels.copySeed}
            </button>
            <button onClick={handlePasteAccount} className="menu-item">
              <span className="menu-icon">📥</span>
              {labels.pasteAccount}
            </button>
            <div className="menu-item menu-item-language" role="group">
              <span className="menu-icon">🌐</span>
              <span className="menu-language-label">{labels.language}</span>
              <div className="menu-language-switch">
                <button
                  type="button"
                  className={`menu-lang-btn ${language === "cs" ? "active" : ""}`}
                  onClick={() => onLanguageChange("cs")}
                >
                  CZ
                </button>
                <button
                  type="button"
                  className={`menu-lang-btn ${language === "en" ? "active" : ""}`}
                  onClick={() => onLanguageChange("en")}
                >
                  EN
                </button>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="menu-item menu-item-danger"
            >
              <span className="menu-icon">🚪</span>
              {labels.logout}
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
