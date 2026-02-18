import type { EvoluContactSummary } from "../services/evolu-contacts";
import "./Contacts.css";

interface ContactsProps {
  npub: string;
  contacts: EvoluContactSummary[];
  ownerInfo: string | null;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
}

export function Contacts({
  npub,
  contacts,
  ownerInfo,
  isLoading,
  error,
  onBack,
}: ContactsProps) {
  const hasNpub = Boolean(npub.trim());

  // Parse ownerInfo for debug display
  let ownerDebugInfo: React.ReactNode = null;
  if (ownerInfo) {
    // Try to parse info if it contains pointer and/or fallback
    // ownerInfo is a string like "contacts-0 (fallback: contacts-1)" or "direct-linky"
    const pointerMatch = ownerInfo.match(/^(contacts-\d+)/);
    const fallbackMatch = ownerInfo.match(/fallback: (contacts-\d+)/);
    const isDirect = ownerInfo === "direct-linky";
    let derivationPath = null;
    if (pointerMatch) {
      derivationPath = `m/83696968'/39'/0'/24'/2'/${pointerMatch[1].replace("contacts-", "")}'`;
    }
    ownerDebugInfo = (
      <div className="contact-owner-info">
        <div>
          <b>Aktivní contact owner:</b> {ownerInfo}
        </div>
        {isDirect && (
          <div>
            <b>Zdroj:</b> direct-linky (linky-evolu-v1)
          </div>
        )}
        {pointerMatch && (
          <>
            <div>
              <b>Zdroj:</b> owner-lane
            </div>
            <div>
              <b>Derivation path:</b> {derivationPath}
            </div>
            <div>
              <b>Pointer:</b> {pointerMatch[1]}
            </div>
          </>
        )}
        {fallbackMatch && (
          <div>
            <b>Fallback pointer:</b> {fallbackMatch[1]}
          </div>
        )}
      </div>
    );
  }

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

        <div className="contact-card contacts-list-card">
          <div className="contact-label">Kontakty z Evolu</div>
          {ownerDebugInfo}
          {isLoading ? (
            <div className="contact-empty">Načítám kontakty...</div>
          ) : error ? (
            <div className="contact-empty">{error}</div>
          ) : contacts.length === 0 ? (
            <div className="contact-empty">Žádné kontakty nebyly nalezeny.</div>
          ) : (
            <div className="contacts-list">
              {contacts.map((contact) => (
                <div key={contact.npub} className="contact-item">
                  <div className="contact-name">{contact.name}</div>
                  <div className="contact-npub mono wrap">{contact.npub}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
