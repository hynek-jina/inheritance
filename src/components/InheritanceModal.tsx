import { useState } from "react";
import { DEFAULT_INHERITANCE_CONDITIONS } from "../constants";
import { createInheritanceAccount } from "../services/wallet";
import type { Contact, SpendingConditions } from "../types";
import { loadContacts } from "../utils/storage";
import "./Modal.css";

interface InheritanceModalProps {
  mnemonic: string;
  onClose: () => void;
}

export function InheritanceModal({ mnemonic, onClose }: InheritanceModalProps) {
  const [contacts] = useState<Contact[]>(() => loadContacts());
  const [localRole, setLocalRole] = useState<"user" | "heir">("user");
  const [accountName, setAccountName] = useState("Dědický účet");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [multisigAfterBlocks, setMultisigAfterBlocks] = useState(
    DEFAULT_INHERITANCE_CONDITIONS.multisigAfterBlocks,
  );
  const [userOnlyAfterBlocks, setUserOnlyAfterBlocks] = useState(
    DEFAULT_INHERITANCE_CONDITIONS.userOnlyAfterBlocks,
  );
  const [heirOnlyAfterBlocks, setHeirOnlyAfterBlocks] = useState(
    DEFAULT_INHERITANCE_CONDITIONS.heirOnlyAfterBlocks,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const selectedContact = contacts.find(
    (contact) => contact.id === selectedContactId,
  );

  const handleCreate = async () => {
    setError("");

    if (!accountName.trim()) {
      setError("Zadejte název účtu");
      return;
    }

    if (!selectedContact) {
      setError("Vyberte kontakt protistrany");
      return;
    }

    const normalizedFingerprint = selectedContact.fingerprint
      .trim()
      .replace(/^0x/, "");
    const normalizedXpub = selectedContact.xpub.replace(/\s+/g, "").trim();

    if (!/^[0-9a-fA-F]{8}$/.test(normalizedFingerprint)) {
      setError(
        "Vybraný kontakt má neplatný fingerprint (musí mít 8 hex znaků)",
      );
      return;
    }

    if (!normalizedXpub) {
      setError("Vybraný kontakt má prázdný xpub/tpub");
      return;
    }

    const parsedMultisigAfter = Math.floor(Number(multisigAfterBlocks));
    const parsedUserOnlyAfter = Math.floor(Number(userOnlyAfterBlocks));
    const parsedHeirOnlyAfter = Math.floor(Number(heirOnlyAfterBlocks));

    if (
      parsedMultisigAfter < 0 ||
      parsedUserOnlyAfter < 0 ||
      parsedHeirOnlyAfter < 0 ||
      Number.isNaN(parsedMultisigAfter) ||
      Number.isNaN(parsedUserOnlyAfter) ||
      Number.isNaN(parsedHeirOnlyAfter)
    ) {
      setError("Počty bloků musí být nezáporná celá čísla");
      return;
    }

    if (
      parsedMultisigAfter > parsedUserOnlyAfter ||
      parsedMultisigAfter > parsedHeirOnlyAfter
    ) {
      setError(
        "Společné utrácení musí začínat nejpozději ve stejném bloku jako samostatné utrácení",
      );
      return;
    }

    const spendingConditions: SpendingConditions = {
      noSpendBlocks: parsedMultisigAfter,
      multisigAfterBlocks: parsedMultisigAfter,
      userOnlyAfterBlocks: parsedUserOnlyAfter,
      heirOnlyAfterBlocks: parsedHeirOnlyAfter,
    };

    setIsCreating(true);
    try {
      await createInheritanceAccount(
        mnemonic,
        accountName.trim(),
        {
          id: `heir-${Date.now()}`,
          name:
            selectedContact.name ||
            (localRole === "user" ? "Dědic" : "Uživatel"),
          fingerprint: normalizedFingerprint,
          xpub: normalizedXpub,
        },
        localRole,
        spendingConditions,
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
            Vyberte kontakt protistrany a nastavte od kolika bloků bude možné
            společné a samostatné utrácení.
          </p>

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

          <div className="form-group">
            <label>
              Kontakt protistrany (
              {localRole === "user" ? "dědice" : "uživatele"})
            </label>
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className="form-input"
            >
              <option value="">Vyberte kontakt</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
            {selectedContact && (
              <div className="input-hint mono">
                fp: {selectedContact.fingerprint} • xpub:{" "}
                {selectedContact.xpub.slice(0, 20)}…
              </div>
            )}
            {!selectedContact && contacts.length === 0 && (
              <div className="input-hint">
                Nemáte uložené kontakty. Přidejte je v sekci Kontakty.
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Od kolika bloků může utrácet uživatel + dědic</label>
            <input
              type="number"
              min={0}
              value={multisigAfterBlocks}
              onChange={(e) => setMultisigAfterBlocks(Number(e.target.value))}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Od kolika bloků stačí uživatel</label>
            <input
              type="number"
              min={0}
              value={userOnlyAfterBlocks}
              onChange={(e) => setUserOnlyAfterBlocks(Number(e.target.value))}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Od kolika bloků stačí dědic</label>
            <input
              type="number"
              min={0}
              value={heirOnlyAfterBlocks}
              onChange={(e) => setHeirOnlyAfterBlocks(Number(e.target.value))}
              className="form-input"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            onClick={handleCreate}
            disabled={isCreating || !selectedContactId}
            className="btn-primary btn-full"
          >
            {isCreating ? "Vytváření..." : "Vytvořit společný účet"}
          </button>
        </div>
      </div>
    </div>
  );
}
