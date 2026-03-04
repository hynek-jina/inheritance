import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import type { AppLanguage } from "../constants";
import { NETWORK_CONFIG } from "../constants";
import {
  generateNewAddress,
  getNextUnusedAddress,
  isInheritanceAccountActivated,
} from "../services/wallet";
import type { Account } from "../types";
import { loadActiveNetwork } from "../utils/storage";
import "./Modal.css";

interface ReceiveModalProps {
  account: Account;
  mnemonic: string;
  language: AppLanguage;
  onClose: () => void;
}

export function ReceiveModal({
  account,
  mnemonic,
  language,
  onClose,
}: ReceiveModalProps) {
  const [address, setAddress] = useState<string>("");
  const [addressError, setAddressError] = useState("");
  const [copied, setCopied] = useState(false);
  const network = loadActiveNetwork();
  const labels =
    language === "cs"
      ? {
          activatedClosed:
            "Účet je aktivovaný. Na funding adresy už nelze přijímat další prostředky.",
          addressCreateFailed: "Adresu se nepodařilo vytvořit",
          title: "Přijmout Bitcoin",
          activatedDescription:
            "Účet je už aktivovaný. Funding fáze je uzavřená a nové vklady už nepřijímá.",
          fundingDescription:
            "Tato adresa je funding multisig (uživatel + server). Po přijetí prostředků použijte Aktivovat prostředky pro přesun na dědický účet.",
          receiveDescription:
            "Naskenujte QR kód nebo zkopírujte adresu pro příjem signet bitcoinů",
          receiveUnavailable: "Příjem není dostupný",
          loading: "Načítání...",
          copied: "✓ Zkopírováno",
          copy: "Kopírovat",
          addressPrefix: 'adresy začínají na "tb1..."',
        }
      : {
          activatedClosed:
            "Account is activated. Funding addresses no longer accept new deposits.",
          addressCreateFailed: "Failed to generate address",
          title: "Receive Bitcoin",
          activatedDescription:
            "This account is already activated. Funding phase is closed and no longer accepts deposits.",
          fundingDescription:
            "This is a funding multisig address (user + server). After funds arrive, use Activate funds to move them into the inheritance account.",
          receiveDescription:
            "Scan QR code or copy address to receive signet bitcoin",
          receiveUnavailable: "Receive is unavailable",
          loading: "Loading...",
          copied: "✓ Copied",
          copy: "Copy",
          addressPrefix: 'addresses start with "tb1..."',
        };
  const isActivatedInheritance =
    account.type === "inheritance" && isInheritanceAccountActivated(account);

  useEffect(() => {
    const loadAddress = async () => {
      setAddressError("");

      if (account.type === "inheritance" && isActivatedInheritance) {
        setAddress("");
        setAddressError(labels.activatedClosed);
        return;
      }

      const unused = getNextUnusedAddress(account);
      if (unused) {
        setAddress(unused.address);
      } else {
        try {
          const newAddr = await generateNewAddress(mnemonic, account);
          setAddress(newAddr.address);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : labels.addressCreateFailed;
          setAddress("");
          setAddressError(message);
        }
      }
    };

    void loadAddress();
  }, [account, mnemonic, isActivatedInheritance, language]);

  const handleCopy = () => {
    if (!address) {
      return;
    }
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <p className="modal-description">
            {account.type === "inheritance" && isActivatedInheritance
              ? labels.activatedDescription
              : account.type === "inheritance"
                ? labels.fundingDescription
                : labels.receiveDescription}
          </p>

          <div className="qr-container">
            {address ? (
              <QRCodeSVG
                value={address}
                size={200}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
              />
            ) : (
              <div className="qr-loading">
                {addressError ? labels.receiveUnavailable : labels.loading}
              </div>
            )}
          </div>

          <div className="address-box">
            <code className="address-text">{address || "—"}</code>
            <button
              onClick={handleCopy}
              disabled={!address}
              className={`copy-btn ${copied ? "copied" : ""}`}
            >
              {copied ? labels.copied : labels.copy}
            </button>
          </div>

          {addressError && <div className="error-message">{addressError}</div>}

          <div className="network-badge">
            {NETWORK_CONFIG[network].label} {labels.addressPrefix}
          </div>
        </div>
      </div>
    </div>
  );
}
