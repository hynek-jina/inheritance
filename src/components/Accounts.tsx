import { useEffect, useState } from "react";
import { updateAccountBalance } from "../services/wallet";
import type { Account } from "../types";
import { loadAccounts } from "../utils/storage";
import "./Accounts.css";
import { InheritanceModal } from "./InheritanceModal";
import { MenuBar } from "./MenuBar";
import { ReceiveModal } from "./ReceiveModal";
import { SendModal } from "./SendModal";

interface AccountsProps {
  mnemonic: string;
  onLogout: () => void;
}

export function Accounts({ mnemonic, onLogout }: AccountsProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showInheritance, setShowInheritance] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  async function loadAccountsData() {
    setIsLoading(true);
    const loadedAccounts = loadAccounts();

    // Update balances for all accounts
    const updatedAccounts = await Promise.all(
      loadedAccounts.map((account) => updateAccountBalance(account)),
    );

    setAccounts(updatedAccounts);
    if (updatedAccounts.length > 0) {
      setSelectedAccount(updatedAccounts[0]);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadAccountsData();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  const handleRefresh = async () => {
    await loadAccountsData();
  };

  if (isLoading) {
    return (
      <div className="accounts-container">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Načítání účtů...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="accounts-container">
      <MenuBar mnemonic={mnemonic} onLogout={onLogout} />

      <div className="accounts-content">
        {/* Total Balance Card */}
        <div className="balance-card">
          <div className="balance-header">
            <span className="balance-label">Celková balance</span>
            <button
              onClick={handleRefresh}
              className="refresh-btn"
              title="Obnovit"
            >
              ↻
            </button>
          </div>
          <div className="balance-amount">
            {totalBalance.toLocaleString("cs-CZ")}{" "}
            <span className="btc-label">sats</span>
          </div>
          <div className="balance-testnet">Testnet</div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button
            onClick={() => selectedAccount && setShowReceive(true)}
            className="action-btn receive"
            disabled={!selectedAccount}
          >
            <span className="action-icon">↓</span>
            Přijmout
          </button>
          <button
            onClick={() => selectedAccount && setShowSend(true)}
            className="action-btn send"
            disabled={!selectedAccount || selectedAccount.balance === 0}
          >
            <span className="action-icon">↑</span>
            Odeslat
          </button>
        </div>

        {/* Accounts List */}
        <div className="accounts-list">
          <h2>Účty</h2>
          {accounts.map((account) => (
            <div
              key={account.id}
              className={`account-item ${selectedAccount?.id === account.id ? "selected" : ""} ${account.type}`}
              onClick={() => setSelectedAccount(account)}
            >
              <div className="account-info">
                <div className="account-name">
                  {account.type === "inheritance" && (
                    <span className="inheritance-icon">🛡️</span>
                  )}
                  {account.name}
                </div>
                <div className="account-type">
                  {account.type === "inheritance"
                    ? "Dědický účet"
                    : "Standardní účet"}
                </div>
                {account.type === "inheritance" &&
                  account.inheritanceStatus && (
                    <div className="inheritance-status">
                      {account.inheritanceStatus.canUserSpend &&
                        "✓ Můžete utrácet"}
                      {account.inheritanceStatus.requiresMultisig &&
                        "🔒 Multisig vyžadován"}
                      {!account.inheritanceStatus.canUserSpend &&
                        !account.inheritanceStatus.requiresMultisig &&
                        account.balance > 0 &&
                        "⏳ Čekání na timelock"}
                    </div>
                  )}
              </div>
              <div className="account-balance">
                {account.balance.toLocaleString("cs-CZ")} sats
              </div>
            </div>
          ))}
        </div>

        {/* Add Inheritance Account Button */}
        <button
          onClick={() => setShowInheritance(true)}
          className="add-inheritance-btn"
        >
          <span className="plus-icon">+</span>
          Přidat dědický účet
        </button>
      </div>

      {/* Modals */}
      {showReceive && selectedAccount && (
        <ReceiveModal
          account={selectedAccount}
          mnemonic={mnemonic}
          onClose={() => setShowReceive(false)}
        />
      )}

      {showSend && selectedAccount && (
        <SendModal
          account={selectedAccount}
          mnemonic={mnemonic}
          onClose={() => setShowSend(false)}
          onSent={handleRefresh}
        />
      )}

      {showInheritance && (
        <InheritanceModal
          mnemonic={mnemonic}
          onClose={() => {
            setShowInheritance(false);
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
