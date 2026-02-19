import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
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
  onClose: () => void;
}

export function ReceiveModal({
  account,
  mnemonic,
  onClose,
}: ReceiveModalProps) {
  const [address, setAddress] = useState<string>("");
  const [addressError, setAddressError] = useState("");
  const [copied, setCopied] = useState(false);
  const network = loadActiveNetwork();
  const isActivatedInheritance =
    account.type === "inheritance" && isInheritanceAccountActivated(account);

  useEffect(() => {
    const loadAddress = async () => {
      setAddressError("");

      if (account.type === "inheritance" && isActivatedInheritance) {
        setAddress("");
        setAddressError(
          "Účet je aktivovaný. Na funding adresy už nelze přijímat další prostředky.",
        );
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
            error instanceof Error
              ? error.message
              : "Adresu se nepodařilo vytvořit";
          setAddress("");
          setAddressError(message);
        }
      }
    };

    void loadAddress();
  }, [account, mnemonic, isActivatedInheritance]);

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
          <h2>Přijmout Bitcoin</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            {account.type === "inheritance" && isActivatedInheritance
              ? "Účet je už aktivovaný. Funding fáze je uzavřená a nové vklady už nepřijímá."
              : account.type === "inheritance"
                ? "Tato adresa je funding multisig (uživatel + server). Po přijetí prostředků použijte Aktivovat prostředky pro přesun na dědický účet."
                : "Naskenujte QR kód nebo zkopírujte adresu pro příjem signet bitcoinů"}
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
                {addressError ? "Příjem není dostupný" : "Načítání..."}
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
              {copied ? "✓ Zkopírováno" : "Kopírovat"}
            </button>
          </div>

          {addressError && <div className="error-message">{addressError}</div>}

          <div className="network-badge">
            {NETWORK_CONFIG[network].label} adresy začínají na "tb1..."
          </div>
        </div>
      </div>
    </div>
  );
}
