import { useState } from "react";
import type { AppLanguage } from "../constants";
import { createNewWallet, restoreWallet } from "../services/wallet";
import { validateMnemonic } from "../utils/bitcoin";
import "./Welcome.css";

interface WelcomeProps {
  onWalletCreated: () => void;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
}

export function Welcome({
  onWalletCreated,
  language,
  onLanguageChange,
}: WelcomeProps) {
  const [showImport, setShowImport] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const labels =
    language === "cs"
      ? {
          createError: "Nepodařilo se vytvořit peněženku",
          invalidSeedCount: (count: number) =>
            `Neplatný seed. SLIP-39 má 20 nebo 33 slov, zadáno ${count}.`,
          invalidSeedWords:
            "Neplatný seed. Zkontrolujte, že jste zadali správná slova.",
          restoreError: "Nepodařilo se obnovit peněženku",
          restoreTitle: "Obnovit peněženku",
          restoreDescription: "Zadejte svůj SLIP-39 seed (20 nebo 33 slov):",
          seedPlaceholder: "slovo1 slovo2 slovo3... (20 nebo 33 slov)",
          restoreButton: "Obnovit",
          backButton: "Zpět",
          subtitle: "Bezpečná peněženka s dědickými účty",
          generating: "Vytváření...",
          createWallet: "Vytvořit novou peněženku",
          pasteSeed: "Vložit SLIP-39 seed",
          language: "Jazyk",
        }
      : {
          createError: "Failed to create wallet",
          invalidSeedCount: (count: number) =>
            `Invalid seed. SLIP-39 requires 20 or 33 words, received ${count}.`,
          invalidSeedWords:
            "Invalid seed. Check that all entered words are correct.",
          restoreError: "Failed to restore wallet",
          restoreTitle: "Restore wallet",
          restoreDescription: "Enter your SLIP-39 seed (20 or 33 words):",
          seedPlaceholder: "word1 word2 word3... (20 or 33 words)",
          restoreButton: "Restore",
          backButton: "Back",
          subtitle: "Secure wallet with inheritance accounts",
          generating: "Creating...",
          createWallet: "Create new wallet",
          pasteSeed: "Paste SLIP-39 seed",
          language: "Language",
        };

  const handleCreateWallet = async () => {
    setIsGenerating(true);
    try {
      await createNewWallet();
      onWalletCreated();
    } catch (err) {
      console.error("Error creating wallet:", err);
      setError(labels.createError);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImportWallet = async () => {
    const trimmedMnemonic = mnemonic.trim();

    // First check word count
    const words = trimmedMnemonic.split(/\s+/);
    if (words.length !== 20 && words.length !== 33) {
      setError(labels.invalidSeedCount(words.length));
      return;
    }

    const isValid = validateMnemonic(trimmedMnemonic);
    if (!isValid) {
      setError(labels.invalidSeedWords);
      return;
    }

    const wallet = await restoreWallet(trimmedMnemonic);
    if (wallet) {
      onWalletCreated();
    } else {
      setError(labels.restoreError);
    }
  };

  if (showImport) {
    return (
      <div className="welcome-container">
        <div className="welcome-card">
          <div className="welcome-language-switch">
            <span>{labels.language}</span>
            <button
              type="button"
              className={`welcome-lang-btn ${language === "cs" ? "active" : ""}`}
              onClick={() => onLanguageChange("cs")}
            >
              CZ
            </button>
            <button
              type="button"
              className={`welcome-lang-btn ${language === "en" ? "active" : ""}`}
              onClick={() => onLanguageChange("en")}
            >
              EN
            </button>
          </div>
          <h1>{labels.restoreTitle}</h1>
          <p>{labels.restoreDescription}</p>

          <textarea
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            placeholder={labels.seedPlaceholder}
            rows={4}
            className="mnemonic-input"
          />

          {error && <div className="error-message">{error}</div>}

          <div className="button-group">
            <button onClick={handleImportWallet} className="btn-primary">
              {labels.restoreButton}
            </button>
            <button
              onClick={() => {
                setShowImport(false);
                setError("");
                setMnemonic("");
              }}
              className="btn-secondary"
            >
              {labels.backButton}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-container">
      <div className="welcome-card">
        <div className="welcome-language-switch">
          <span>{labels.language}</span>
          <button
            type="button"
            className={`welcome-lang-btn ${language === "cs" ? "active" : ""}`}
            onClick={() => onLanguageChange("cs")}
          >
            CZ
          </button>
          <button
            type="button"
            className={`welcome-lang-btn ${language === "en" ? "active" : ""}`}
            onClick={() => onLanguageChange("en")}
          >
            EN
          </button>
        </div>
        <div className="logo">
          <img src="/icon-192x192.png" alt="Be Cool logo" />
        </div>
        <h1>Be Cool</h1>
        <p className="subtitle">{labels.subtitle}</p>

        <div className="button-group">
          <button
            onClick={handleCreateWallet}
            disabled={isGenerating}
            className="btn-primary"
          >
            {isGenerating ? labels.generating : labels.createWallet}
          </button>

          <button onClick={() => setShowImport(true)} className="btn-secondary">
            {labels.pasteSeed}
          </button>
        </div>

        <p className="testnet-badge">Signet Only</p>
      </div>
    </div>
  );
}
