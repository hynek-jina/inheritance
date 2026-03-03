import { useEffect, useRef, useState } from "react";
import {
  calculateMaxSendAmountNoChange,
  completeInheritanceTransactionFromPsbt,
  createInheritancePartiallySignedTransaction,
  isInheritanceAccountActivated,
  sendBitcoin,
} from "../services/wallet";
import type { Account } from "../types";
import "./Modal.css";

interface OwnRecipientOption {
  accountId: string;
  accountLabel: string;
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  const isInheritance = account.type === "inheritance";
  const availableOwnAccountTargets: OwnRecipientOption[] = accounts
    .filter(
      (candidate) =>
        candidate.id !== account.id &&
        (candidate.type !== "inheritance" ||
          !isInheritanceAccountActivated(candidate)),
    )
    .map((candidate) => {
      const standardReceiveAddresses = candidate.derivedAddresses
        .filter((address) => !address.change && candidate.type === "standard")
        .sort((a, b) => a.index - b.index);

      const inheritanceFundingAddresses = candidate.derivedAddresses
        .filter(
          (address) =>
            candidate.type === "inheritance" &&
            address.role === "funding" &&
            !address.change,
        )
        .sort((a, b) => a.index - b.index);

      const inheritanceActiveAddresses = candidate.derivedAddresses
        .filter(
          (address) =>
            candidate.type === "inheritance" &&
            (address.role === "active" || address.role === undefined) &&
            !address.change,
        )
        .sort((a, b) => a.index - b.index);

      const preferredAddress =
        candidate.type === "standard"
          ? standardReceiveAddresses.find((address) => !address.used) ||
            standardReceiveAddresses[0] ||
            null
          : inheritanceFundingAddresses.find((address) => !address.used) ||
            inheritanceFundingAddresses[0] ||
            inheritanceActiveAddresses.find((address) => !address.used) ||
            inheritanceActiveAddresses[0] ||
            null;

      if (!preferredAddress) {
        return null;
      }

      return {
        accountId: candidate.id,
        accountLabel: `${candidate.name} (${candidate.type === "standard" ? "Standardní" : "Dědický"})`,
        address: preferredAddress.address,
      };
    })
    .filter(
      (item): item is OwnRecipientOption =>
        item !== null && Boolean(item.address),
    );

  const [recipientMode, setRecipientMode] = useState<"address" | "account">(
    "address",
  );
  const [selectedOwnAccountId, setSelectedOwnAccountId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("5");
  const [isSendAllMode, setIsSendAllMode] = useState(false);
  const [inheritanceMode, setInheritanceMode] = useState<"create" | "finalize">(
    "create",
  );
  const [psbtInput, setPsbtInput] = useState("");
  const [exportedPsbt, setExportedPsbt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isScanningRecipient, setIsScanningRecipient] = useState(false);
  const [scanError, setScanError] = useState("");

  const stopScanner = () => {
    if (scanFrameRef.current !== null) {
      window.cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanningRecipient(false);
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const parseScannedAddress = (rawValue: string): string => {
    const trimmed = rawValue.trim();

    if (trimmed.toLowerCase().startsWith("bitcoin:")) {
      const withoutScheme = trimmed.slice("bitcoin:".length);
      return withoutScheme.split("?")[0].trim();
    }

    return trimmed;
  };

  const handleStartScan = async () => {
    setError("");
    setSuccess("");
    setScanError("");

    const BarcodeDetectorCtor = (
      window as Window & {
        BarcodeDetector?: new (options?: { formats?: string[] }) => {
          detect: (
            image: ImageBitmapSource,
          ) => Promise<Array<{ rawValue?: string }>>;
        };
      }
    ).BarcodeDetector;

    if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      setScanError("Skenování QR není v tomto prohlížeči podporované.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });

      streamRef.current = stream;
      setIsScanningRecipient(true);

      window.setTimeout(() => {
        if (!videoRef.current) {
          return;
        }

        videoRef.current.srcObject = stream;
        void videoRef.current.play();

        const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });

        const scanLoop = async () => {
          if (!videoRef.current) {
            return;
          }

          try {
            const barcodes = await detector.detect(videoRef.current);
            const scanned = barcodes[0]?.rawValue;

            if (scanned) {
              const parsedAddress = parseScannedAddress(scanned);
              if (validateAddress(parsedAddress)) {
                setRecipient(parsedAddress);
                setRecipientMode("address");
                setSuccess("Adresa příjemce naskenována.");
                stopScanner();
                return;
              }

              setScanError("QR neobsahuje platnou signet adresu.");
            }
          } catch {
            setScanError("Skenování se nepodařilo. Zkuste to znovu.");
          }

          scanFrameRef.current = window.requestAnimationFrame(scanLoop);
        };

        scanFrameRef.current = window.requestAnimationFrame(scanLoop);
      }, 0);
    } catch {
      setScanError("Nepodařilo se získat přístup ke kameře.");
      stopScanner();
    }
  };

  const resolvedRecipientAddress =
    recipientMode === "account"
      ? availableOwnAccountTargets.find(
          (target) => target.accountId === selectedOwnAccountId,
        )?.address || ""
      : recipient;

  const applyFeeRate = (value: string) => {
    setFee(value);
    setIsSendAllMode(false);
  };

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
        isSendAllMode,
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
        isSendAllMode,
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

  const handleSendAll = async () => {
    setError("");
    setSuccess("");

    const feeRate = parseInt(fee, 10);
    if (Number.isNaN(feeRate) || feeRate <= 0) {
      setError("Zadejte platný fee");
      return;
    }

    setIsSending(true);
    try {
      const { amountSats, fee: calculatedFee } =
        await calculateMaxSendAmountNoChange(mnemonic, account, feeRate);
      setAmount(String(amountSats));
      setIsSendAllMode(true);
      setSuccess(
        `Nastaveno maximum ${amountSats.toLocaleString("cs-CZ")} sats (fee ${calculatedFee.toLocaleString("cs-CZ")} sats).`,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Částku pro odeslání všeho se nepodařilo spočítat";
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
              {availableOwnAccountTargets.length > 0 && (
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
                      Můj účet
                    </button>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>
                  {recipientMode === "account"
                    ? "Vyberte vlastní účet"
                    : "Adresa příjemce"}
                </label>
                {recipientMode === "account" ? (
                  <select
                    value={selectedOwnAccountId}
                    onChange={(e) => setSelectedOwnAccountId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Vyberte účet</option>
                    {availableOwnAccountTargets.map((target) => (
                      <option key={target.accountId} value={target.accountId}>
                        {target.accountLabel}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      type="text"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="tb1..."
                      className="form-input"
                    />
                    <button
                      type="button"
                      className="btn-secondary btn-full"
                      onClick={
                        isScanningRecipient ? stopScanner : handleStartScan
                      }
                    >
                      {isScanningRecipient
                        ? "Zastavit skenování"
                        : "Naskenovat adresu"}
                    </button>

                    {isScanningRecipient && (
                      <div className="scan-preview-box">
                        <video
                          ref={videoRef}
                          className="scan-preview-video"
                          playsInline
                          muted
                        />
                      </div>
                    )}

                    {scanError && <div className="input-hint">{scanError}</div>}
                  </>
                )}
                {recipientMode === "account" && resolvedRecipientAddress && (
                  <div className="input-hint mono">
                    Adresa účtu: {resolvedRecipientAddress}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Částka (sats)</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setIsSendAllMode(false);
                  }}
                  placeholder="50000"
                  className="form-input"
                />
                <div className="input-hint">
                  Dostupné: {account.balance.toLocaleString("cs-CZ")} sats
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-full"
                  onClick={handleSendAll}
                  disabled={isSending}
                >
                  Odeslat vše
                </button>
              </div>

              <div className="form-group">
                <label>Fee (sat/vB)</label>
                <div className="fee-options">
                  <button
                    type="button"
                    onClick={() => applyFeeRate("1")}
                    className={`fee-btn ${fee === "1" ? "active" : ""}`}
                  >
                    Slow (1)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFeeRate("5")}
                    className={`fee-btn ${fee === "5" ? "active" : ""}`}
                  >
                    Normal (5)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFeeRate("20")}
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
