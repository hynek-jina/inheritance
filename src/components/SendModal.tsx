import { useState } from "react";
import { sendBitcoin } from "../services/wallet";
import type { Account } from "../types";
import "./Modal.css";

interface SendModalProps {
  account: Account;
  mnemonic: string;
  onClose: () => void;
  onSent: () => void;
}

export function SendModal({
  account,
  mnemonic,
  onClose,
  onSent,
}: SendModalProps) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("5");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const validateAddress = (addr: string): boolean => {
    return (
      addr.startsWith("tb1") ||
      addr.startsWith("m") ||
      addr.startsWith("n") ||
      addr.startsWith("2")
    );
  };

  const handleSend = async () => {
    setError("");
    setSuccess("");

    // Validation
    if (!validateAddress(recipient)) {
      setError("Neplatná testnet adresa");
      return;
    }

    const amountSats = parseInt(amount, 10);
    if (!Number.isInteger(amountSats) || amountSats <= 0) {
      setError("Zadejte platnou částku v satech");
      return;
    }

    const feeRate = parseInt(fee);
    if (isNaN(feeRate) || feeRate <= 0) {
      setError("Zadejte platný fee");
      return;
    }

    if (amountSats > account.balance) {
      setError("Nedostatek prostředků");
      return;
    }

    setIsSending(true);

    try {
      const txid = await sendBitcoin(
        mnemonic,
        account,
        recipient,
        amountSats,
        feeRate,
      );
      setSuccess(`Transakce odeslána. TXID: ${txid}`);

      setTimeout(() => {
        onSent();
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Chyba při odesílání";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Odeslat Bitcoin</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Adresa příjemce</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="tb1..."
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Částka (sats)</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50000"
              className="form-input"
            />
            <div className="input-hint">
              Dostupné: {account.balance.toLocaleString("cs-CZ")} sats
            </div>
          </div>

          <div className="form-group">
            <label>Fee (sat/vB)</label>
            <div className="fee-options">
              <button
                onClick={() => setFee("1")}
                className={`fee-btn ${fee === "1" ? "active" : ""}`}
              >
                Slow (1)
              </button>
              <button
                onClick={() => setFee("5")}
                className={`fee-btn ${fee === "5" ? "active" : ""}`}
              >
                Normal (5)
              </button>
              <button
                onClick={() => setFee("20")}
                className={`fee-btn ${fee === "20" ? "active" : ""}`}
              >
                Fast (20)
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button
            onClick={handleSend}
            disabled={isSending || !recipient || !amount}
            className="btn-primary btn-full"
          >
            {isSending ? "Odesílání..." : "Odeslat"}
          </button>
        </div>
      </div>
    </div>
  );
}
