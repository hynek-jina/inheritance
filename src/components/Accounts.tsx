import { useCallback, useEffect, useState } from "react";
import type { AppNetwork } from "../constants";
import { NETWORK_CONFIG } from "../constants";
import { getWalletFingerprint, updateAccountBalance } from "../services/wallet";
import type { Account } from "../types";
import { loadAccounts } from "../utils/storage";
import { AccountDetailPage } from "./AccountDetailPage";
import "./Accounts.css";
import { InheritanceModal } from "./InheritanceModal";
import { MenuBar } from "./MenuBar";
import { ReceiveModal } from "./ReceiveModal";
import { SendModal } from "./SendModal";

interface AccountsProps {
  mnemonic: string;
  network: AppNetwork;
  onNetworkChange: (network: AppNetwork) => void;
  onLogout: () => void;
}

export function Accounts({
  mnemonic,
  network,
  onNetworkChange,
  onLogout,
}: AccountsProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  const [modalAccount, setModalAccount] = useState<Account | null>(null);
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showInheritance, setShowInheritance] = useState(false);
  const [walletFingerprint, setWalletFingerprint] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadAccountsData = useCallback(async () => {
    setIsLoading(true);
    const loadedAccounts = loadAccounts();

    // Update balances for all accounts
    const updatedAccounts = await Promise.all(
      loadedAccounts.map((account) => updateAccountBalance(account, mnemonic)),
    );
    const fingerprint = await getWalletFingerprint(mnemonic);

    setAccounts(updatedAccounts);
    setWalletFingerprint(fingerprint);
    setDetailAccount((prev) => {
      if (!prev) return prev;
      return updatedAccounts.find((a) => a.id === prev.id) || prev;
    });
    setIsLoading(false);
  }, [mnemonic]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadAccountsData();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [network, loadAccountsData]);

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
      <MenuBar
        mnemonic={mnemonic}
        network={network}
        onNetworkChange={onNetworkChange}
        onLogout={onLogout}
      />

      {detailAccount ? (
        <AccountDetailPage
          account={detailAccount}
          mnemonic={mnemonic}
          onBack={() => setDetailAccount(null)}
          onRefresh={handleRefresh}
          onReceive={(account) => {
            setModalAccount(account);
            setShowReceive(true);
          }}
          onSend={(account) => {
            setModalAccount(account);
            setShowSend(true);
          }}
        />
      ) : (
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
            <div className="balance-testnet">
              {NETWORK_CONFIG[network].label}
            </div>
            {walletFingerprint && (
              <div className="wallet-fingerprint">
                Master fingerprint: {walletFingerprint}
              </div>
            )}
          </div>

          {/* Accounts List */}
          <div className="accounts-list">
            <h2>Účty</h2>
            {accounts.map((account) => (
              <div
                key={account.id}
                className={`account-item ${account.type}`}
                onClick={() => setDetailAccount(account)}
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
      )}

      {/* Modals */}
      {showReceive && modalAccount && (
        <ReceiveModal
          account={modalAccount}
          mnemonic={mnemonic}
          onClose={() => setShowReceive(false)}
        />
      )}

      {showSend && modalAccount && (
        <SendModal
          account={modalAccount}
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
