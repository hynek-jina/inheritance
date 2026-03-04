import { type FormEvent, useState } from "react";
import type { AppLanguage } from "../constants";
import type { Contact } from "../types";
import { loadContacts, saveContacts } from "../utils/storage";
import "./Contacts.css";

interface ContactsProps {
  language: AppLanguage;
  onBack: () => void;
}

function shortenTechnicalValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 14) {
    return trimmed;
  }

  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function Contacts({ language, onBack }: ContactsProps) {
  const labels =
    language === "cs"
      ? {
          confirmDelete: (name: string) =>
            `Opravdu chcete smazat kontakt ${name}?`,
          back: "Zpět",
          title: "Kontakty",
          editContact: "Upravit kontakt",
          addContact: "Přidat kontakt",
          name: "Jméno",
          saveChanges: "Uložit změny",
          cancel: "Zrušit",
          savedContacts: "Uložené kontakty",
          empty: "Zatím nemáte uložené žádné kontakty.",
          edit: "Upravit",
          delete: "Smazat",
        }
      : {
          confirmDelete: (name: string) =>
            `Do you really want to delete contact ${name}?`,
          back: "Back",
          title: "Contacts",
          editContact: "Edit contact",
          addContact: "Add contact",
          name: "Name",
          saveChanges: "Save changes",
          cancel: "Cancel",
          savedContacts: "Saved contacts",
          empty: "You don't have any saved contacts yet.",
          edit: "Edit",
          delete: "Delete",
        };
  const [contacts, setContacts] = useState<Contact[]>(() => loadContacts());
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [xpub, setXpub] = useState("");
  const [fingerprint, setFingerprint] = useState("");

  const resetForm = () => {
    setEditingContactId(null);
    setName("");
    setXpub("");
    setFingerprint("");
  };

  const handleSubmitContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedContact = {
      name: name.trim(),
      npub: "",
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
    setXpub(contact.xpub);
    setFingerprint(contact.fingerprint);
  };

  const handleDeleteContact = (contact: Contact) => {
    const isConfirmed = window.confirm(labels.confirmDelete(contact.name));

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
          ← {labels.back}
        </button>
      </div>

      <div className="contacts-content">
        <h2>{labels.title}</h2>

        <form className="contact-form" onSubmit={handleSubmitContact}>
          <h3>{editingContactId ? labels.editContact : labels.addContact}</h3>

          <label className="contact-input-label" htmlFor="contact-name">
            {labels.name}
          </label>
          <input
            id="contact-name"
            className="contact-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
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
              {editingContactId ? labels.saveChanges : labels.addContact}
            </button>
            {editingContactId && (
              <button
                type="button"
                className="secondary-contact-btn"
                onClick={resetForm}
              >
                {labels.cancel}
              </button>
            )}
          </div>
        </form>

        <div className="saved-contacts">
          <h3>{labels.savedContacts}</h3>
          {contacts.length === 0 ? (
            <div className="contact-empty">{labels.empty}</div>
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
                      {labels.edit}
                    </button>
                    <button
                      type="button"
                      className="contact-action-btn danger"
                      onClick={() => handleDeleteContact(contact)}
                    >
                      {labels.delete}
                    </button>
                  </div>
                </div>
                <div className="contact-tech-row mono">
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
