import { useState } from "react";
import type { AppLanguage } from "../constants";
import { DEFAULT_INHERITANCE_CONDITIONS } from "../constants";
import { createInheritanceAccount } from "../services/wallet";
import type { Contact, SpendingConditions } from "../types";
import { loadContacts } from "../utils/storage";
import "./Modal.css";

interface InheritanceModalProps {
  mnemonic: string;
  language: AppLanguage;
  onClose: () => void;
}

export function InheritanceModal({
  mnemonic,
  language,
  onClose,
}: InheritanceModalProps) {
  const [contacts] = useState<Contact[]>(() => loadContacts());
  const labels =
    language === "cs"
      ? {
          defaultName: "Dědický účet",
          enterName: "Zadejte název účtu",
          selectContact: "Vyberte kontakt protistrany",
          invalidFp:
            "Vybraný kontakt má neplatný fingerprint (musí mít 8 hex znaků)",
          emptyXpub: "Vybraný kontakt má prázdný xpub/tpub",
          invalidBlocks: "Počty bloků musí být nezáporná celá čísla",
          invalidOrder:
            "Společné utrácení musí začínat nejpozději ve stejném bloku jako samostatné utrácení",
          heirFallback: "Dědic",
          createError: "Chyba při vytváření dědického účtu",
          title: "Přidat dědický účet",
          description:
            "Vyberte kontakt protistrany a nastavte od kolika bloků bude možné společné a samostatné utrácení.",
          accountName: "Název účtu",
          heirContact: "Kontakt dědice",
          selectContactOption: "Vyberte kontakt",
          noContacts: "Nemáte uložené kontakty. Přidejte je v sekci Kontakty.",
          bothSpendAfter: "Od kolika bloků může utrácet uživatel + dědic",
          userSpendAfter: "Od kolika bloků stačí uživatel",
          heirSpendAfter: "Od kolika bloků stačí dědic",
          creating: "Vytváření...",
          createShared: "Vytvořit společný účet",
        }
      : {
          defaultName: "Inheritance account",
          enterName: "Enter account name",
          selectContact: "Select counterparty contact",
          invalidFp:
            "Selected contact has invalid fingerprint (must be 8 hex characters)",
          emptyXpub: "Selected contact has an empty xpub/tpub",
          invalidBlocks: "Block counts must be non-negative integers",
          invalidOrder:
            "Shared spending must start no later than single-party spending",
          heirFallback: "Heir",
          createError: "Error while creating inheritance account",
          title: "Add inheritance account",
          description:
            "Select counterparty contact and set from which block heights shared and single-party spending is allowed.",
          accountName: "Account name",
          heirContact: "Heir contact",
          selectContactOption: "Select contact",
          noContacts:
            "You have no saved contacts. Add them in Contacts section.",
          bothSpendAfter: "From which block can user + heir spend together",
          userSpendAfter: "From which block user alone is enough",
          heirSpendAfter: "From which block heir alone is enough",
          creating: "Creating...",
          createShared: "Create shared account",
        };
  const [accountName, setAccountName] = useState(labels.defaultName);
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
      setError(labels.enterName);
      return;
    }

    if (!selectedContact) {
      setError(labels.selectContact);
      return;
    }

    const normalizedFingerprint = selectedContact.fingerprint
      .trim()
      .replace(/^0x/, "");
    const normalizedXpub = selectedContact.xpub.replace(/\s+/g, "").trim();

    if (!/^[0-9a-fA-F]{8}$/.test(normalizedFingerprint)) {
      setError(labels.invalidFp);
      return;
    }

    if (!normalizedXpub) {
      setError(labels.emptyXpub);
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
      setError(labels.invalidBlocks);
      return;
    }

    if (
      parsedMultisigAfter > parsedUserOnlyAfter ||
      parsedMultisigAfter > parsedHeirOnlyAfter
    ) {
      setError(labels.invalidOrder);
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
          name: selectedContact.name || labels.heirFallback,
          fingerprint: normalizedFingerprint,
          xpub: normalizedXpub,
        },
        "user",
        spendingConditions,
      );
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : labels.createError;
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
          <h2>{labels.title}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="step-description">{labels.description}</p>

          <div className="form-group">
            <label>{labels.accountName}</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>{labels.heirContact}</label>
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className="form-input"
            >
              <option value="">{labels.selectContactOption}</option>
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
              <div className="input-hint">{labels.noContacts}</div>
            )}
          </div>

          <div className="form-group">
            <label>{labels.bothSpendAfter}</label>
            <input
              type="number"
              min={0}
              value={multisigAfterBlocks}
              onChange={(e) => setMultisigAfterBlocks(Number(e.target.value))}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>{labels.userSpendAfter}</label>
            <input
              type="number"
              min={0}
              value={userOnlyAfterBlocks}
              onChange={(e) => setUserOnlyAfterBlocks(Number(e.target.value))}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>{labels.heirSpendAfter}</label>
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
            {isCreating ? labels.creating : labels.createShared}
          </button>
        </div>
      </div>
    </div>
  );
}
