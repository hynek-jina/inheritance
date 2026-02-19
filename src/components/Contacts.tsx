import { type FormEvent, useState } from "react";
import type { Contact } from "../types";
import { loadContacts, saveContacts } from "../utils/storage";
import "./Contacts.css";

interface ContactsProps {
  npub: string;
  onBack: () => void;
}

function shortenTechnicalValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 14) {
    return trimmed;
  }

  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function Contacts({ npub, onBack }: ContactsProps) {
  const [contacts, setContacts] = useState<Contact[]>(() => loadContacts());
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [contactNpub, setContactNpub] = useState("");
  const [xpub, setXpub] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const hasNpub = Boolean(npub.trim());

  const resetForm = () => {
    setEditingContactId(null);
    setName("");
    setContactNpub("");
    setXpub("");
    setFingerprint("");
  };

  const handleSubmitContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedContact = {
      name: name.trim(),
      npub: contactNpub.trim(),
      xpub: xpub.trim(),
      fingerprint: fingerprint.trim(),
    };

    if (editingContactId) {
      const nextContacts = contacts.map((contact) =>
        contact.id === editingContactId
          ? { ...contact, ...normalizedContact }
          : contact,
      );
      setContacts(nextContacts);
      saveContacts(nextContacts);
      resetForm();
      return;
    }

    const nextContact: Contact = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...normalizedContact,
    };

    const nextContacts = [nextContact, ...contacts];
    setContacts(nextContacts);
    saveContacts(nextContacts);
    resetForm();
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setName(contact.name);
    setContactNpub(contact.npub);
    setXpub(contact.xpub);
    setFingerprint(contact.fingerprint);
  };

  const handleDeleteContact = (contact: Contact) => {
    const isConfirmed = window.confirm(
      `Opravdu chcete smazat kontakt ${contact.name}?`,
    );

    if (!isConfirmed) {
      return;
    }

    const nextContacts = contacts.filter(
      (currentContact) => currentContact.id !== contact.id,
    );
    setContacts(nextContacts);
    saveContacts(nextContacts);

    if (editingContactId === contact.id) {
      resetForm();
    }
  };

  return (
    <div className="contacts-page">
      <div className="contacts-header">
        <button className="back-btn" onClick={onBack}>
          ← Zpět
        </button>
      </div>

      <div className="contacts-content">
        <h2>Kontakty</h2>

        <div className="contact-card">
          <div className="contact-label">Můj kontakt (npub)</div>
          {hasNpub ? (
            <div className="contact-npub mono wrap">{npub}</div>
          ) : (
            <div className="contact-empty">
              Nostr kontakt se nepodařilo načíst.
            </div>
          )}
        </div>

        <form className="contact-form" onSubmit={handleSubmitContact}>
          <h3>{editingContactId ? "Upravit kontakt" : "Přidat kontakt"}</h3>

          <label className="contact-input-label" htmlFor="contact-name">
            Jméno
          </label>
          <input
            id="contact-name"
            className="contact-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />

          <label className="contact-input-label" htmlFor="contact-npub">
            npub
          </label>
          <input
            id="contact-npub"
            className="contact-input mono"
            value={contactNpub}
            onChange={(event) => setContactNpub(event.target.value)}
            required
          />

          <label className="contact-input-label" htmlFor="contact-xpub">
            xpub
          </label>
          <input
            id="contact-xpub"
            className="contact-input mono"
            value={xpub}
            onChange={(event) => setXpub(event.target.value)}
            required
          />

          <label className="contact-input-label" htmlFor="contact-fingerprint">
            fingerprint
          </label>
          <input
            id="contact-fingerprint"
            className="contact-input mono"
            value={fingerprint}
            onChange={(event) => setFingerprint(event.target.value)}
            required
          />

          <div className="contact-form-actions">
            <button type="submit" className="add-contact-btn">
              {editingContactId ? "Uložit změny" : "Přidat kontakt"}
            </button>
            {editingContactId && (
              <button
                type="button"
                className="secondary-contact-btn"
                onClick={resetForm}
              >
                Zrušit
              </button>
            )}
          </div>
        </form>

        <div className="saved-contacts">
          <h3>Uložené kontakty</h3>
          {contacts.length === 0 ? (
            <div className="contact-empty">
              Zatím nemáte uložené žádné kontakty.
            </div>
          ) : (
            contacts.map((contact) => (
              <div className="contact-card" key={contact.id}>
                <div className="contact-row-header">
                  <div className="contact-name">{contact.name}</div>
                  <div className="contact-actions">
                    <button
                      type="button"
                      className="contact-action-btn"
                      onClick={() => handleEditContact(contact)}
                    >
                      Upravit
                    </button>
                    <button
                      type="button"
                      className="contact-action-btn danger"
                      onClick={() => handleDeleteContact(contact)}
                    >
                      Smazat
                    </button>
                  </div>
                </div>
                <div className="contact-tech-row mono">
                  <span className="contact-tech-item">
                    npub: {shortenTechnicalValue(contact.npub)}
                  </span>
                  <span className="contact-tech-item">
                    xpub: {shortenTechnicalValue(contact.xpub)}
                  </span>
                  <span className="contact-tech-item">
                    fp: {shortenTechnicalValue(contact.fingerprint)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
