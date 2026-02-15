import { useEffect, useState } from "react";
import { DEFAULT_INHERITANCE_CONDITIONS } from "../constants";
import {
  createInheritanceAccount,
  getLocalInheritanceIdentity,
} from "../services/wallet";
import "./Modal.css";

interface InheritanceModalProps {
  mnemonic: string;
  onClose: () => void;
}

export function InheritanceModal({ mnemonic, onClose }: InheritanceModalProps) {
  const [localRole, setLocalRole] = useState<"user" | "heir">("user");
  const [accountName, setAccountName] = useState("Dědický účet");
  const [counterpartyFingerprint, setCounterpartyFingerprint] = useState("");
  const [counterpartyXpub, setCounterpartyXpub] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [localIdentity, setLocalIdentity] = useState<{
    fingerprint: string;
    tpub: string;
    derivationPath: string;
  } | null>(null);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void getLocalInheritanceIdentity(mnemonic)
        .then((identity) => setLocalIdentity(identity))
        .catch(() => {
          setError("Nepodařilo se načíst lokální identitu");
        });
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [mnemonic]);

  const handleCreate = async () => {
    setError("");
    const normalizedFingerprint = counterpartyFingerprint
      .trim()
      .replace(/^0x/, "");
    const normalizedXpub = counterpartyXpub.replace(/\s+/g, "").trim();

    if (!accountName.trim()) {
      setError("Zadejte název účtu");
      return;
    }

    if (!/^[0-9a-fA-F]{8}$/.test(normalizedFingerprint)) {
      setError("Fingerprint dědice musí mít 8 hex znaků");
      return;
    }

    if (!normalizedXpub) {
      setError("Zadejte tpub/xpub dědice");
      return;
    }

    setIsCreating(true);
    try {
      await createInheritanceAccount(
        mnemonic,
        accountName.trim(),
        {
          id: `heir-${Date.now()}`,
          name: localRole === "user" ? "Dědic" : "Uživatel",
          fingerprint: normalizedFingerprint,
          xpub: normalizedXpub,
        },
        localRole,
        DEFAULT_INHERITANCE_CONDITIONS,
      );
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Chyba při vytváření dědického účtu";
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-large"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Přidat dědický účet</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="step-description">
            Zadejte údaje protistrany. Pokud obě strany použijí stejný pár
            fingerprint+tpub, vznikne stejný společný účet. Podmínky: 0–4 bloky
            nikdo, od 5 bloků uživatel + dědic, od 10 bloků uživatel, od 20
            bloků dědic.
          </p>

          <div className="form-group">
            <label>Moje role</label>
            <div className="fee-options">
              <button
                type="button"
                className={`fee-btn ${localRole === "user" ? "active" : ""}`}
                onClick={() => setLocalRole("user")}
              >
                Jsem uživatel
              </button>
              <button
                type="button"
                className={`fee-btn ${localRole === "heir" ? "active" : ""}`}
                onClick={() => setLocalRole("heir")}
              >
                Jsem dědic
              </button>
            </div>
          </div>

          {localIdentity && (
            <div className="summary-box">
              <h4>Moje údaje ke sdílení</h4>
              <div className="summary-item">
                <span>Fingerprint</span>
                <span>{localIdentity.fingerprint}</span>
              </div>
              <div className="summary-item">
                <span>Derivační cesta</span>
                <span>{localIdentity.derivationPath}</span>
              </div>
              <div className="summary-item mono">
                <span>tpub</span>
                <span>{localIdentity.tpub.slice(0, 32)}…</span>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Název účtu</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>
              Fingerprint protistrany (
              {localRole === "user" ? "dědice" : "uživatele"})
            </label>
            <input
              type="text"
              value={counterpartyFingerprint}
              onChange={(e) => setCounterpartyFingerprint(e.target.value)}
              placeholder="např. d90c6a4f"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>
              tpub protistrany ({localRole === "user" ? "dědice" : "uživatele"})
            </label>
            <textarea
              value={counterpartyXpub}
              onChange={(e) => setCounterpartyXpub(e.target.value)}
              placeholder="tpub..."
              className="form-input"
              rows={3}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            onClick={handleCreate}
            disabled={
              isCreating || !counterpartyFingerprint || !counterpartyXpub
            }
            className="btn-primary btn-full"
          >
            {isCreating ? "Vytváření..." : "Vytvořit společný účet"}
          </button>
        </div>
      </div>
    </div>
  );
}
