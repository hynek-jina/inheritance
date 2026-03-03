import { useState } from "react";
import { createNewWallet, restoreWallet } from "../services/wallet";
import { validateMnemonic } from "../utils/bitcoin";
import "./Welcome.css";

interface WelcomeProps {
  onWalletCreated: () => void;
}

export function Welcome({ onWalletCreated }: WelcomeProps) {
  const [showImport, setShowImport] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleCreateWallet = async () => {
    setIsGenerating(true);
    try {
      await createNewWallet();
      onWalletCreated();
    } catch (err) {
      console.error("Error creating wallet:", err);
      setError("Nepodařilo se vytvořit peněženku");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImportWallet = async () => {
    const trimmedMnemonic = mnemonic.trim();

    // First check word count
    const words = trimmedMnemonic.split(/\s+/);
    if (words.length !== 20 && words.length !== 33) {
      setError(
        `Neplatný seed. SLIP-39 má 20 nebo 33 slov, zadáno ${words.length}.`,
      );
      return;
    }

    const isValid = validateMnemonic(trimmedMnemonic);
    if (!isValid) {
      setError("Neplatný seed. Zkontrolujte, že jste zadali správná slova.");
      return;
    }

    const wallet = await restoreWallet(trimmedMnemonic);
    if (wallet) {
      onWalletCreated();
    } else {
      setError("Nepodařilo se obnovit peněženku");
    }
  };

  if (showImport) {
    return (
      <div className="welcome-container">
        <div className="welcome-card">
          <h1>Obnovit peněženku</h1>
          <p>Zadejte svůj SLIP-39 seed (20 nebo 33 slov):</p>

          <textarea
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            placeholder="slovo1 slovo2 slovo3... (20 nebo 33 slov)"
            rows={4}
            className="mnemonic-input"
          />

          {error && <div className="error-message">{error}</div>}

          <div className="button-group">
            <button onClick={handleImportWallet} className="btn-primary">
              Obnovit
            </button>
            <button
              onClick={() => {
                setShowImport(false);
                setError("");
                setMnemonic("");
              }}
              className="btn-secondary"
            >
              Zpět
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-container">
      <div className="welcome-card">
        <div className="logo">
          <img src="/icon-192x192.png" alt="Be Cool logo" />
        </div>
        <h1>Be Cool</h1>
        <p className="subtitle">Bezpečná peněženka s dědickými účty</p>

        <div className="button-group">
          <button
            onClick={handleCreateWallet}
            disabled={isGenerating}
            className="btn-primary"
          >
            {isGenerating ? "Vytváření..." : "Vytvořit novou peněženku"}
          </button>

          <button onClick={() => setShowImport(true)} className="btn-secondary">
            Vložit SLIP-39 seed
          </button>
        </div>

        <p className="testnet-badge">Signet Only</p>
      </div>
    </div>
  );
}
