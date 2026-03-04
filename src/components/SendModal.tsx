import { useEffect, useRef, useState } from "react";
import type { AppLanguage } from "../constants";
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
  language: AppLanguage;
  onClose: () => void;
  onSent: () => void;
}

type QrScannerModule = typeof import("qr-scanner");

export function SendModal({
  account,
  accounts,
  mnemonic,
  language,
  onClose,
  onSent,
}: SendModalProps) {
  const locale = language === "cs" ? "cs-CZ" : "en-US";
  const labels =
    language === "cs"
      ? {
          accountStandard: "Standardní",
          accountInheritance: "Dědický",
          invalidQrAddress: "QR neobsahuje platnou signet adresu.",
          scannedRecipient: "Adresa příjemce naskenována.",
          scanUnsupported: "Skenování QR není v tomto prohlížeči podporované.",
          scanFailed: "Skenování se nepodařilo. Zkuste to znovu.",
          cameraAccessFailed: "Nepodařilo se získat přístup ke kameře.",
          invalidAmount: "Zadejte platnou částku v satech",
          invalidFee: "Zadejte platný fee",
          insufficientFunds: "Nedostatek prostředků",
          invalidAddress: "Neplatná signet adresa",
          txSent: (txid: string) => `Transakce odeslána. TXID: ${txid}`,
          sendError: "Chyba při odesílání",
          psbtCreatedWithChange: (
            feeAmount: number,
            changeAmount: number,
            changeAddress: string,
          ) =>
            `PSBT vytvořeno. Fee: ${feeAmount} sats. Change: ${changeAmount} sats → ${changeAddress}`,
          psbtCreated: (feeAmount: number) =>
            `PSBT vytvořeno. Fee: ${feeAmount} sats.`,
          psbtCreateError: "Chyba při tvorbě PSBT",
          enterPsbt: "Vložte PSBT k dopodepsání",
          txFinalized: (txid: string) =>
            `Transakce dopodepsána a odeslána. TXID: ${txid}`,
          psbtFinalizeError: "Chyba při dopodepsání PSBT",
          psbtCopied: "PSBT zkopírováno do schránky.",
          psbtCopyFailed: "PSBT nešlo zkopírovat do schránky",
          sendAllSet: (amountSats: number, feeAmount: number) =>
            `Nastaveno maximum ${amountSats.toLocaleString("cs-CZ")} sats (fee ${feeAmount.toLocaleString("cs-CZ")} sats).`,
          sendAllCalcError: "Částku pro odeslání všeho se nepodařilo spočítat",
          title: "Odeslat Bitcoin",
          inheritanceSendMode: "Režim dědického odeslání",
          createAndSignPsbt: "Vytvořit + podepsat PSBT",
          finalizeAndSendPsbt: "Vložit PSBT a odeslat",
          sendTarget: "Cíl odeslání",
          address: "Adresa",
          ownAccount: "Můj účet",
          chooseOwnAccount: "Vyberte vlastní účet",
          recipientAddress: "Adresa příjemce",
          chooseAccount: "Vyberte účet",
          stopScan: "Zastavit skenování",
          startScan: "Naskenovat adresu",
          accountAddress: "Adresa účtu",
          amount: "Částka (sats)",
          available: "Dostupné",
          sendAll: "Odeslat vše",
          fee: "Fee (sat/vB)",
          counterpartyPsbt: "PSBT od protistrany (base64)",
          psbtHint: "Vložte částečně podepsanou PSBT a odešlete na síť.",
          exportedPsbt: "Exportovaná PSBT",
          copyPsbt: "Zkopírovat PSBT",
          sending: "Odesílání...",
          send: "Odeslat",
          signing: "Podepisování...",
          signAndExport: "Podepsat a exportovat PSBT",
          cosigning: "Dopodepisování...",
          cosignAndSend: "Dopodepsat a odeslat",
        }
      : {
          accountStandard: "Standard",
          accountInheritance: "Inheritance",
          invalidQrAddress: "QR does not contain a valid signet address.",
          scannedRecipient: "Recipient address scanned.",
          scanUnsupported: "QR scanning is not supported in this browser.",
          scanFailed: "Scanning failed. Please try again.",
          cameraAccessFailed: "Failed to access camera.",
          invalidAmount: "Enter a valid amount in sats",
          invalidFee: "Enter a valid fee",
          insufficientFunds: "Insufficient funds",
          invalidAddress: "Invalid signet address",
          txSent: (txid: string) => `Transaction sent. TXID: ${txid}`,
          sendError: "Error while sending",
          psbtCreatedWithChange: (
            feeAmount: number,
            changeAmount: number,
            changeAddress: string,
          ) =>
            `PSBT created. Fee: ${feeAmount} sats. Change: ${changeAmount} sats → ${changeAddress}`,
          psbtCreated: (feeAmount: number) =>
            `PSBT created. Fee: ${feeAmount} sats.`,
          psbtCreateError: "Error creating PSBT",
          enterPsbt: "Paste PSBT to cosign",
          txFinalized: (txid: string) =>
            `Transaction cosigned and sent. TXID: ${txid}`,
          psbtFinalizeError: "Error while cosigning PSBT",
          psbtCopied: "PSBT copied to clipboard.",
          psbtCopyFailed: "Failed to copy PSBT to clipboard",
          sendAllSet: (amountSats: number, feeAmount: number) =>
            `Maximum set to ${amountSats.toLocaleString("en-US")} sats (fee ${feeAmount.toLocaleString("en-US")} sats).`,
          sendAllCalcError: "Failed to calculate send-all amount",
          title: "Send Bitcoin",
          inheritanceSendMode: "Inheritance sending mode",
          createAndSignPsbt: "Create + sign PSBT",
          finalizeAndSendPsbt: "Paste PSBT and send",
          sendTarget: "Send target",
          address: "Address",
          ownAccount: "My account",
          chooseOwnAccount: "Select your account",
          recipientAddress: "Recipient address",
          chooseAccount: "Select account",
          stopScan: "Stop scanning",
          startScan: "Scan address",
          accountAddress: "Account address",
          amount: "Amount (sats)",
          available: "Available",
          sendAll: "Send all",
          fee: "Fee (sat/vB)",
          counterpartyPsbt: "Counterparty PSBT (base64)",
          psbtHint: "Paste partially signed PSBT and broadcast it.",
          exportedPsbt: "Exported PSBT",
          copyPsbt: "Copy PSBT",
          sending: "Sending...",
          send: "Send",
          signing: "Signing...",
          signAndExport: "Sign and export PSBT",
          cosigning: "Cosigning...",
          cosignAndSend: "Cosign and send",
        };
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  const isInheritance = account.type === "inheritance";
  const inheritanceStatus = account.inheritanceStatus;
  const inheritanceLocalRole = account.localRole || "user";
  const canLocalInheritanceSpend =
    isInheritance &&
    (inheritanceLocalRole === "heir"
      ? Boolean(inheritanceStatus?.canHeirSpend)
      : Boolean(inheritanceStatus?.canUserSpend));
  const inheritanceNeedsCounterparty =
    isInheritance && (inheritanceStatus?.requiresMultisig ?? true);
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
        accountLabel: `${candidate.name} (${candidate.type === "standard" ? labels.accountStandard : labels.accountInheritance})`,
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
  const qrScannerFrameRef = useRef<number | null>(null);
  const qrScannerModulePromiseRef = useRef<Promise<QrScannerModule> | null>(
    null,
  );

  const stopScanner = () => {
    if (scanFrameRef.current !== null) {
      window.cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    if (qrScannerFrameRef.current !== null) {
      window.cancelAnimationFrame(qrScannerFrameRef.current);
      qrScannerFrameRef.current = null;
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
      return decodeURIComponent(withoutScheme.split("?")[0].trim());
    }

    return trimmed;
  };

  const getQrScannerModule = async (): Promise<QrScannerModule> => {
    if (!qrScannerModulePromiseRef.current) {
      qrScannerModulePromiseRef.current = import("qr-scanner");
    }

    return qrScannerModulePromiseRef.current;
  };

  const handleScanResult = (rawValue: string): boolean => {
    const parsedAddress = parseScannedAddress(rawValue);
    if (!validateAddress(parsedAddress)) {
      setScanError(labels.invalidQrAddress);
      return false;
    }

    setRecipient(parsedAddress);
    setRecipientMode("address");
    setSuccess(labels.scannedRecipient);
    stopScanner();
    return true;
  };

  const startQrScannerFallback = async () => {
    const module = await getQrScannerModule();
    const scanImage = module.default.scanImage;

    const scanLoop = async () => {
      if (!videoRef.current) {
        return;
      }

      try {
        const result = await scanImage(videoRef.current, {
          returnDetailedScanResult: true,
          alsoTryWithoutScanRegion: true,
        });

        if (result?.data && handleScanResult(result.data)) {
          return;
        }
      } catch {
        // no QR on current frame, keep scanning
      }

      qrScannerFrameRef.current = window.requestAnimationFrame(scanLoop);
    };

    qrScannerFrameRef.current = window.requestAnimationFrame(scanLoop);
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

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError(labels.scanUnsupported);
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

        if (!BarcodeDetectorCtor) {
          void startQrScannerFallback().catch(() => {
            setScanError(labels.scanFailed);
          });
          return;
        }

        const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });

        const scanLoop = async () => {
          if (!videoRef.current) {
            return;
          }

          try {
            const barcodes = await detector.detect(videoRef.current);
            const scanned = barcodes[0]?.rawValue;

            if (scanned && handleScanResult(scanned)) {
              return;
            }
          } catch {
            setScanError(labels.scanFailed);
          }

          scanFrameRef.current = window.requestAnimationFrame(scanLoop);
        };

        scanFrameRef.current = window.requestAnimationFrame(scanLoop);
      }, 0);
    } catch {
      setScanError(labels.cameraAccessFailed);
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
    const normalized = addr.trim().toLowerCase();

    return (
      normalized.startsWith("tb1") ||
      normalized.startsWith("m") ||
      normalized.startsWith("n") ||
      normalized.startsWith("2")
    );
  };

  const validateAmountAndFee = (): {
    amountSats: number;
    feeRate: number;
  } | null => {
    const amountSats = parseInt(amount, 10);
    if (!Number.isInteger(amountSats) || amountSats <= 0) {
      setError(labels.invalidAmount);
      return null;
    }

    const feeRate = parseInt(fee, 10);
    if (Number.isNaN(feeRate) || feeRate <= 0) {
      setError(labels.invalidFee);
      return null;
    }

    if (amountSats > account.balance) {
      setError(labels.insufficientFunds);
      return null;
    }

    return { amountSats, feeRate };
  };

  const handleStandardSend = async () => {
    setError("");
    setSuccess("");

    // Validation
    if (!validateAddress(resolvedRecipientAddress)) {
      setError(labels.invalidAddress);
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
      setSuccess(labels.txSent(txid));

      setTimeout(() => {
        onSent();
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : labels.sendError;
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleCreatePartial = async () => {
    setError("");
    setSuccess("");

    if (!validateAddress(resolvedRecipientAddress)) {
      setError(labels.invalidAddress);
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
          ? labels.psbtCreatedWithChange(
              draft.fee,
              draft.changeAmount,
              draft.changeAddress,
            )
          : labels.psbtCreated(draft.fee),
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : labels.psbtCreateError;
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleFinalizeAndBroadcast = async () => {
    setError("");
    setSuccess("");

    if (!psbtInput.trim()) {
      setError(labels.enterPsbt);
      return;
    }

    setIsSending(true);
    try {
      const txid = await completeInheritanceTransactionFromPsbt(
        mnemonic,
        account,
        psbtInput,
      );
      setSuccess(labels.txFinalized(txid));

      setTimeout(() => {
        onSent();
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : labels.psbtFinalizeError;
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleLocalInheritanceSend = async () => {
    setError("");
    setSuccess("");

    if (!validateAddress(resolvedRecipientAddress)) {
      setError(labels.invalidAddress);
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

      const txid = await completeInheritanceTransactionFromPsbt(
        mnemonic,
        account,
        draft.psbt,
      );

      setSuccess(labels.txSent(txid));

      setTimeout(() => {
        onSent();
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : labels.sendError;
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
      setSuccess(labels.psbtCopied);
    } catch {
      setError(labels.psbtCopyFailed);
    }
  };

  const handleSendAll = async () => {
    setError("");
    setSuccess("");

    const feeRate = parseInt(fee, 10);
    if (Number.isNaN(feeRate) || feeRate <= 0) {
      setError(labels.invalidFee);
      return;
    }

    setIsSending(true);
    try {
      const { amountSats, fee: calculatedFee } =
        await calculateMaxSendAmountNoChange(mnemonic, account, feeRate);
      setAmount(String(amountSats));
      setIsSendAllMode(true);
      setSuccess(labels.sendAllSet(amountSats, calculatedFee));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : labels.sendAllCalcError;
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{labels.title}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {isInheritance && inheritanceNeedsCounterparty && (
            <div className="form-group">
              <label>{labels.inheritanceSendMode}</label>
              <div className="fee-options">
                <button
                  type="button"
                  onClick={() => setInheritanceMode("create")}
                  className={`fee-btn ${inheritanceMode === "create" ? "active" : ""}`}
                >
                  {labels.createAndSignPsbt}
                </button>
                <button
                  type="button"
                  onClick={() => setInheritanceMode("finalize")}
                  className={`fee-btn ${inheritanceMode === "finalize" ? "active" : ""}`}
                >
                  {labels.finalizeAndSendPsbt}
                </button>
              </div>
            </div>
          )}

          {(!isInheritance || inheritanceMode === "create") && (
            <>
              {availableOwnAccountTargets.length > 0 && (
                <div className="form-group">
                  <label>{labels.sendTarget}</label>
                  <div className="fee-options">
                    <button
                      type="button"
                      onClick={() => setRecipientMode("address")}
                      className={`fee-btn ${recipientMode === "address" ? "active" : ""}`}
                    >
                      {labels.address}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipientMode("account")}
                      className={`fee-btn ${recipientMode === "account" ? "active" : ""}`}
                    >
                      {labels.ownAccount}
                    </button>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>
                  {recipientMode === "account"
                    ? labels.chooseOwnAccount
                    : labels.recipientAddress}
                </label>
                {recipientMode === "account" ? (
                  <select
                    value={selectedOwnAccountId}
                    onChange={(e) => setSelectedOwnAccountId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">{labels.chooseAccount}</option>
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
                      {isScanningRecipient ? labels.stopScan : labels.startScan}
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
                    {labels.accountAddress}: {resolvedRecipientAddress}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>{labels.amount}</label>
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
                  {labels.available}: {account.balance.toLocaleString(locale)}{" "}
                  sats
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-full"
                  onClick={handleSendAll}
                  disabled={isSending}
                >
                  {labels.sendAll}
                </button>
              </div>

              <div className="form-group">
                <label>{labels.fee}</label>
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

          {isInheritance &&
            inheritanceNeedsCounterparty &&
            inheritanceMode === "finalize" && (
              <div className="form-group">
                <label>{labels.counterpartyPsbt}</label>
                <textarea
                  value={psbtInput}
                  onChange={(e) => setPsbtInput(e.target.value)}
                  rows={5}
                  className="form-input"
                  placeholder="cHNidP8B..."
                />
                <div className="input-hint">{labels.psbtHint}</div>
              </div>
            )}

          {isInheritance && exportedPsbt && (
            <div className="form-group">
              <label>{labels.exportedPsbt}</label>
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
                {labels.copyPsbt}
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
              {isSending ? labels.sending : labels.send}
            </button>
          )}

          {isInheritance &&
            inheritanceNeedsCounterparty &&
            inheritanceMode === "create" && (
              <button
                onClick={handleCreatePartial}
                disabled={isSending || !resolvedRecipientAddress || !amount}
                className="btn-primary btn-full"
              >
                {isSending ? labels.signing : labels.signAndExport}
              </button>
            )}

          {isInheritance &&
            canLocalInheritanceSpend &&
            !inheritanceNeedsCounterparty && (
              <button
                onClick={handleLocalInheritanceSend}
                disabled={isSending || !resolvedRecipientAddress || !amount}
                className="btn-primary btn-full"
              >
                {isSending ? labels.sending : labels.send}
              </button>
            )}

          {isInheritance &&
            inheritanceNeedsCounterparty &&
            inheritanceMode === "finalize" && (
              <button
                onClick={handleFinalizeAndBroadcast}
                disabled={isSending || !psbtInput.trim()}
                className="btn-primary btn-full"
              >
                {isSending ? labels.cosigning : labels.cosignAndSend}
              </button>
            )}
        </div>
      </div>
    </div>
  );
}
