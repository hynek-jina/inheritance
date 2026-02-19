import { useState } from "react";
import {
  completeInheritanceTransactionFromPsbt,
  createInheritancePartiallySignedTransaction,
  isInheritanceAccountActivated,
  sendBitcoin,
} from "../services/wallet";
import type { Account } from "../types";
import "./Modal.css";

interface InheritanceRecipientOption {
  accountId: string;
  accountName: string;
  address: string;
}

interface SendModalProps {
  account: Account;
  accounts: Account[];
  mnemonic: string;
  onClose: () => void;
  onSent: () => void;
}

export function SendModal({
  account,
  accounts,
  mnemonic,
  onClose,
  onSent,
}: SendModalProps) {
  const isInheritance = account.type === "inheritance";
  const availableInheritanceTargets: InheritanceRecipientOption[] = accounts
    .filter(
      (candidate) =>
        candidate.type === "inheritance" &&
        candidate.id !== account.id &&
        !isInheritanceAccountActivated(candidate),
    )
    .map((candidate) => {
      const fundingAddresses = candidate.derivedAddresses
        .filter((address) => address.role === "funding" && !address.change)
        .sort((a, b) => a.index - b.index);

      const preferredAddress =
        fundingAddresses.find((address) => !address.used) ||
        fundingAddresses[0] ||
        null;

      if (!preferredAddress) {
        return null;
      }

      return {
        accountId: candidate.id,
        accountName: candidate.name,
        address: preferredAddress.address,
      };
    })
    .filter(
      (item): item is InheritanceRecipientOption =>
        item !== null && Boolean(item.address),
    );

  const [recipientMode, setRecipientMode] = useState<"address" | "account">(
    "address",
  );
  const [selectedInheritanceAccountId, setSelectedInheritanceAccountId] =
    useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("5");
  const [inheritanceMode, setInheritanceMode] = useState<"create" | "finalize">(
    "create",
  );
  const [psbtInput, setPsbtInput] = useState("");
  const [exportedPsbt, setExportedPsbt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const resolvedRecipientAddress =
    recipientMode === "account"
      ? availableInheritanceTargets.find(
          (target) => target.accountId === selectedInheritanceAccountId,
        )?.address || ""
      : recipient;

  const validateAddress = (addr: string): boolean => {
    return (
      addr.startsWith("tb1") ||
      addr.startsWith("m") ||
      addr.startsWith("n") ||
      addr.startsWith("2")
    );
  };

  const validateAmountAndFee = (): {
    amountSats: number;
    feeRate: number;
  } | null => {
    const amountSats = parseInt(amount, 10);
    if (!Number.isInteger(amountSats) || amountSats <= 0) {
      setError("Zadejte platnou částku v satech");
      return null;
    }

    const feeRate = parseInt(fee, 10);
    if (Number.isNaN(feeRate) || feeRate <= 0) {
      setError("Zadejte platný fee");
      return null;
    }

    if (amountSats > account.balance) {
      setError("Nedostatek prostředků");
      return null;
    }

    return { amountSats, feeRate };
  };

  const handleStandardSend = async () => {
    setError("");
    setSuccess("");

    // Validation
    if (!validateAddress(resolvedRecipientAddress)) {
      setError("Neplatná signet adresa");
      return;
    }

    const validated = validateAmountAndFee();
    if (!validated) {
      return;
    }
    const { amountSats, feeRate } = validated;

    setIsSending(true);

    try {
      const txid = await sendBitcoin(
        mnemonic,
        account,
        resolvedRecipientAddress,
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

  const handleCreatePartial = async () => {
    setError("");
    setSuccess("");

    if (!validateAddress(resolvedRecipientAddress)) {
      setError("Neplatná signet adresa");
      return;
    }

    const validated = validateAmountAndFee();
    if (!validated) {
      return;
    }

    setIsSending(true);
    try {
      const draft = await createInheritancePartiallySignedTransaction(
        mnemonic,
        account,
        resolvedRecipientAddress,
        validated.amountSats,
        validated.feeRate,
      );

      setExportedPsbt(draft.psbt);
      setSuccess(
        draft.changeAddress
          ? `PSBT vytvořeno. Fee: ${draft.fee} sats. Change: ${draft.changeAmount} sats → ${draft.changeAddress}`
          : `PSBT vytvořeno. Fee: ${draft.fee} sats.`,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Chyba při tvorbě PSBT";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleFinalizeAndBroadcast = async () => {
    setError("");
    setSuccess("");

    if (!psbtInput.trim()) {
      setError("Vložte PSBT k dopodepsání");
      return;
    }

    setIsSending(true);
    try {
      const txid = await completeInheritanceTransactionFromPsbt(
        mnemonic,
        account,
        psbtInput,
      );
      setSuccess(`Transakce dopodepsána a odeslána. TXID: ${txid}`);

      setTimeout(() => {
        onSent();
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Chyba při dopodepsání PSBT";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyPsbt = async () => {
    if (!exportedPsbt) {
      return;
    }

    try {
      await navigator.clipboard.writeText(exportedPsbt);
      setSuccess("PSBT zkopírováno do schránky.");
    } catch {
      setError("PSBT nešlo zkopírovat do schránky");
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
          {isInheritance && (
            <div className="form-group">
              <label>Režim dědického odeslání</label>
              <div className="fee-options">
                <button
                  type="button"
                  onClick={() => setInheritanceMode("create")}
                  className={`fee-btn ${inheritanceMode === "create" ? "active" : ""}`}
                >
                  Vytvořit + podepsat PSBT
                </button>
                <button
                  type="button"
                  onClick={() => setInheritanceMode("finalize")}
                  className={`fee-btn ${inheritanceMode === "finalize" ? "active" : ""}`}
                >
                  Vložit PSBT a odeslat
                </button>
              </div>
            </div>
          )}

          {(!isInheritance || inheritanceMode === "create") && (
            <>
              {availableInheritanceTargets.length > 0 && (
                <div className="form-group">
                  <label>Cíl odeslání</label>
                  <div className="fee-options">
                    <button
                      type="button"
                      onClick={() => setRecipientMode("address")}
                      className={`fee-btn ${recipientMode === "address" ? "active" : ""}`}
                    >
                      Adresa
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipientMode("account")}
                      className={`fee-btn ${recipientMode === "account" ? "active" : ""}`}
                    >
                      Dědický účet
                    </button>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>
                  {recipientMode === "account"
                    ? "Vyberte dědický účet"
                    : "Adresa příjemce"}
                </label>
                {recipientMode === "account" ? (
                  <select
                    value={selectedInheritanceAccountId}
                    onChange={(e) =>
                      setSelectedInheritanceAccountId(e.target.value)
                    }
                    className="form-input"
                  >
                    <option value="">Vyberte účet</option>
                    {availableInheritanceTargets.map((target) => (
                      <option key={target.accountId} value={target.accountId}>
                        {target.accountName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="tb1..."
                    className="form-input"
                  />
                )}
                {recipientMode === "account" && resolvedRecipientAddress && (
                  <div className="input-hint mono">
                    Funding adresa: {resolvedRecipientAddress}
                  </div>
                )}
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
                    type="button"
                    onClick={() => setFee("1")}
                    className={`fee-btn ${fee === "1" ? "active" : ""}`}
                  >
                    Slow (1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFee("5")}
                    className={`fee-btn ${fee === "5" ? "active" : ""}`}
                  >
                    Normal (5)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFee("20")}
                    className={`fee-btn ${fee === "20" ? "active" : ""}`}
                  >
                    Fast (20)
                  </button>
                </div>
              </div>
            </>
          )}

          {isInheritance && inheritanceMode === "finalize" && (
            <div className="form-group">
              <label>PSBT od protistrany (base64)</label>
              <textarea
                value={psbtInput}
                onChange={(e) => setPsbtInput(e.target.value)}
                rows={5}
                className="form-input"
                placeholder="cHNidP8B..."
              />
              <div className="input-hint">
                Vložte částečně podepsanou PSBT a odešlete na síť.
              </div>
            </div>
          )}

          {isInheritance && exportedPsbt && (
            <div className="form-group">
              <label>Exportovaná PSBT</label>
              <textarea
                value={exportedPsbt}
                rows={5}
                readOnly
                className="form-input"
              />
              <button
                type="button"
                className="btn-secondary btn-full"
                onClick={handleCopyPsbt}
              >
                Zkopírovat PSBT
              </button>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          {!isInheritance && (
            <button
              onClick={handleStandardSend}
              disabled={isSending || !resolvedRecipientAddress || !amount}
              className="btn-primary btn-full"
            >
              {isSending ? "Odesílání..." : "Odeslat"}
            </button>
          )}

          {isInheritance && inheritanceMode === "create" && (
            <button
              onClick={handleCreatePartial}
              disabled={isSending || !resolvedRecipientAddress || !amount}
              className="btn-primary btn-full"
            >
              {isSending ? "Podepisování..." : "Podepsat a exportovat PSBT"}
            </button>
          )}

          {isInheritance && inheritanceMode === "finalize" && (
            <button
              onClick={handleFinalizeAndBroadcast}
              disabled={isSending || !psbtInput.trim()}
              className="btn-primary btn-full"
            >
              {isSending ? "Dopodepisování..." : "Dopodepsat a odeslat"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
