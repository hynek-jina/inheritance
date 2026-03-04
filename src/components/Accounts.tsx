import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { AppLanguage, AppNetwork } from "../constants";
import { NETWORK_CONFIG } from "../constants";
import {
  deleteAccount,
  getWalletFingerprint,
  importInheritanceAccountShare,
  isInheritanceAccountActivated,
  renameAccount,
  updateAccountBalance,
} from "../services/wallet";
import type { Account } from "../types";
import { loadAccounts } from "../utils/storage";
import { AccountDetailPage } from "./AccountDetailPage";
import "./Accounts.css";
import { Contacts } from "./Contacts";
import { InheritanceModal } from "./InheritanceModal";
import { MenuBar } from "./MenuBar";
import { ReceiveModal } from "./ReceiveModal";
import { SendModal } from "./SendModal";

interface AccountsProps {
  mnemonic: string;
  network: AppNetwork;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  onLogout: () => void;
  initialView?: "accounts" | "contacts" | "accountDetail";
}

export function Accounts({
  mnemonic,
  network,
  language,
  onLanguageChange,
  onLogout,
  initialView = "accounts",
}: AccountsProps) {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<"accounts" | "contacts">(() =>
    initialView === "contacts" ? "contacts" : "accounts",
  );
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  const [modalAccount, setModalAccount] = useState<Account | null>(null);
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showInheritance, setShowInheritance] = useState(false);
  const [walletFingerprint, setWalletFingerprint] = useState("");
  const [isLoading, setIsLoading] = useState(accounts.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasInitialAccountsRef = useRef(accounts.length > 0);
  const loadInProgressRef = useRef<Promise<void> | null>(null);

  const loadAccountsData = useCallback(
    async (blocking = false) => {
      if (loadInProgressRef.current) {
        await loadInProgressRef.current;
        return;
      }

      const run = async () => {
        if (blocking) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        try {
          const loadedAccounts = loadAccounts();

          // Update balances for all accounts
          const updatedAccounts: Account[] = [];
          for (const account of loadedAccounts) {
            try {
              updatedAccounts.push(
                await updateAccountBalance(account, mnemonic),
              );
            } catch (error) {
              console.error(`Chyba při aktualizaci účtu ${account.id}:`, error);
              updatedAccounts.push(account);
            }
          }
          const fingerprint = await getWalletFingerprint(mnemonic);

          setAccounts(updatedAccounts);
          setWalletFingerprint(fingerprint);
          setDetailAccount((prev) => {
            if (!prev) return prev;
            return updatedAccounts.find((a) => a.id === prev.id) || prev;
          });
        } catch (error) {
          console.error("Chyba při načítání účtů:", error);
        } finally {
          if (blocking) {
            setIsLoading(false);
          }
          setIsRefreshing(false);
        }
      };

      const request = run();
      loadInProgressRef.current = request;
      try {
        await request;
      } finally {
        loadInProgressRef.current = null;
      }
    },
    [mnemonic],
  );

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadAccountsData(!hasInitialAccountsRef.current);
      hasInitialAccountsRef.current = true;
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [network, loadAccountsData]);

  // Handle URL changes for detail and contacts
  useEffect(() => {
    if (params.accountId && accounts.length > 0) {
      const found = accounts.find((a) => a.id === params.accountId);
      setDetailAccount(found || null);
      setView(found ? "accounts" : "accounts");
    } else if (location.pathname === "/contacts") {
      setView("contacts");
      setDetailAccount(null);
    } else {
      setView("accounts");
      setDetailAccount(null);
    }
  }, [params.accountId, location.pathname, accounts]);

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const locale = language === "cs" ? "cs-CZ" : "en-US";
  const ui =
    language === "cs"
      ? {
          loadingAccounts: "Načítání účtů...",
          totalBalance: "Celková balance",
          refresh: "Obnovit",
          accounts: "Účty",
          inheritanceAccount: "Dědický účet",
          standardAccount: "Standardní účet",
          addInheritance: "Přidat dědický účet",
          pastePrompt: "Vložte sdílená data dědického účtu:",
          pasteError: "Účet se nepodařilo vložit",
          inheritanceAvailableForBoth: "Dostupné pro oba",
          inheritanceAvailableForYou: "Dostupné pro vás",
          inheritanceAvailableForOwner: "Dostupné pro majitele",
          inheritanceAvailableForHeir: "Dostupné pro dědice",
          inheritanceShared: "Dostupné společně",
          inheritanceActivated: "Aktivováno",
          inheritanceAwaitingActivation: "Čeká na aktivaci",
        }
      : {
          loadingAccounts: "Loading accounts...",
          totalBalance: "Total balance",
          refresh: "Refresh",
          accounts: "Accounts",
          inheritanceAccount: "Inheritance account",
          standardAccount: "Standard account",
          addInheritance: "Add inheritance account",
          pastePrompt: "Paste shared inheritance account data:",
          pasteError: "Failed to paste account",
          inheritanceAvailableForBoth: "Available for both",
          inheritanceAvailableForYou: "Available for you",
          inheritanceAvailableForOwner: "Available for owner",
          inheritanceAvailableForHeir: "Available for heir",
          inheritanceShared: "Available together",
          inheritanceActivated: "Activated",
          inheritanceAwaitingActivation: "Awaiting activation",
        };
  const primaryStandardAccountId = accounts.find(
    (item) => item.type === "standard",
  )?.id;

  const handleRefresh = async () => {
    await loadAccountsData(false);
  };

  const handlePasteAccount = async () => {
    const pasted = window.prompt(ui.pastePrompt);
    if (!pasted) {
      return;
    }

    try {
      const imported = await importInheritanceAccountShare(mnemonic, pasted);
      await loadAccountsData(false);
      navigate(`/account/${imported.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : ui.pasteError;
      window.alert(message);
    }
  };

  const handleRenameAccount = async (
    account: Account,
    newName: string,
  ): Promise<void> => {
    renameAccount(account.id, newName);
    await loadAccountsData(false);
  };

  const handleDeleteAccount = async (account: Account): Promise<void> => {
    deleteAccount(account.id);

    if (detailAccount?.id === account.id) {
      navigate("/");
    }

    await loadAccountsData(false);
  };

  const getInheritanceVisualState = (
    account: Account,
  ): {
    cardClass: "frozen" | "active" | "spendable";
    progress: 0 | 1 | 2 | 3 | 4;
    statusText: string;
  } => {
    if (account.type !== "inheritance") {
      return {
        cardClass: "frozen",
        progress: 0,
        statusText: "",
      };
    }

    const role = account.localRole || "user";
    const canLocalSpend =
      role === "heir"
        ? Boolean(account.inheritanceStatus?.canHeirSpend)
        : Boolean(account.inheritanceStatus?.canUserSpend);
    const canCounterpartySpend =
      role === "heir"
        ? Boolean(account.inheritanceStatus?.canUserSpend)
        : Boolean(account.inheritanceStatus?.canHeirSpend);
    const isActivated = isInheritanceAccountActivated(account);
    const canOwnerSpend = Boolean(account.inheritanceStatus?.canUserSpend);
    const canHeirSpend = Boolean(account.inheritanceStatus?.canHeirSpend);
    const requiresMultisig = Boolean(
      account.inheritanceStatus?.requiresMultisig,
    );

    if (canLocalSpend) {
      if (canCounterpartySpend) {
        return {
          cardClass: "spendable",
          progress: 4,
          statusText: ui.inheritanceAvailableForBoth,
        };
      }

      return {
        cardClass: "spendable",
        progress: canOwnerSpend || canHeirSpend ? 3 : 2,
        statusText: ui.inheritanceAvailableForYou,
      };
    }

    if (canCounterpartySpend) {
      return {
        cardClass: role === "user" ? "active" : "spendable",
        progress: role === "user" ? 2 : 3,
        statusText:
          role === "heir"
            ? ui.inheritanceAvailableForOwner
            : ui.inheritanceAvailableForHeir,
      };
    }

    if (isActivated) {
      return {
        cardClass: "active",
        progress: requiresMultisig ? 2 : 1,
        statusText: account.inheritanceStatus?.requiresMultisig
          ? ui.inheritanceShared
          : ui.inheritanceActivated,
      };
    }

    return {
      cardClass: "frozen",
      progress: 0,
      statusText: ui.inheritanceAwaitingActivation,
    };
  };

  if (isLoading) {
    return (
      <div className="accounts-container">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>{ui.loadingAccounts}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="accounts-container">
      <MenuBar
        mnemonic={mnemonic}
        network={network}
        language={language}
        onLanguageChange={onLanguageChange}
        onPasteAccount={handlePasteAccount}
        onOpenContacts={() => {
          navigate("/contacts");
        }}
        onLogout={onLogout}
      />

      {view === "contacts" ? (
        <Contacts language={language} onBack={() => navigate("/")} />
      ) : detailAccount ? (
        <AccountDetailPage
          account={detailAccount}
          mnemonic={mnemonic}
          canDelete={detailAccount.id !== primaryStandardAccountId}
          onBack={() => navigate("/")}
          onRefresh={handleRefresh}
          onRename={handleRenameAccount}
          onDelete={handleDeleteAccount}
          onReceive={(account) => {
            setModalAccount(account);
            setShowReceive(true);
          }}
          onSend={(account) => {
            setModalAccount(account);
            setShowSend(true);
          }}
          language={language}
        />
      ) : (
        <div className="accounts-content">
          {/* Total Balance Card */}
          <div className="balance-card">
            <div className="balance-header">
              <span className="balance-label">{ui.totalBalance}</span>
              <button
                onClick={handleRefresh}
                className="refresh-btn"
                title={ui.refresh}
                disabled={isRefreshing}
              >
                ↻
              </button>
            </div>
            <div className="balance-amount">
              {totalBalance.toLocaleString(locale)}{" "}
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
            <h2>{ui.accounts}</h2>
            {accounts.map((account) => {
              const inheritanceState = getInheritanceVisualState(account);

              return (
                <div
                  key={account.id}
                  className={`account-item ${account.type} ${account.type === "inheritance" ? `inheritance-${inheritanceState.cardClass}` : ""}`}
                  onClick={() => navigate(`/account/${account.id}`)}
                >
                  <div className="account-info">
                    <div className="account-name">
                      {account.type === "inheritance" && (
                        <span
                          className="inheritance-icon"
                          style={{
                            ["--inheritance-progress" as string]:
                              inheritanceState.progress,
                          }}
                          aria-hidden="true"
                        />
                      )}
                      {account.name}
                    </div>
                    <div className="account-type">
                      {account.type === "inheritance"
                        ? ui.inheritanceAccount
                        : ui.standardAccount}
                    </div>
                    {account.type === "inheritance" && (
                      <div
                        className={`inheritance-status inheritance-status-${inheritanceState.cardClass}`}
                      >
                        {inheritanceState.statusText}
                      </div>
                    )}
                  </div>
                  <div className="account-balance">
                    {account.balance.toLocaleString(locale)} sats
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Inheritance Account Button */}
          <button
            onClick={() => setShowInheritance(true)}
            className="add-inheritance-btn"
          >
            <span className="plus-icon">+</span>
            {ui.addInheritance}
          </button>
        </div>
      )}

      {/* Modals */}
      {showReceive && modalAccount && (
        <ReceiveModal
          account={modalAccount}
          mnemonic={mnemonic}
          language={language}
          onClose={() => setShowReceive(false)}
        />
      )}

      {showSend && modalAccount && (
        <SendModal
          account={modalAccount}
          accounts={accounts}
          mnemonic={mnemonic}
          language={language}
          onClose={() => setShowSend(false)}
          onSent={handleRefresh}
        />
      )}

      {showInheritance && (
        <InheritanceModal
          mnemonic={mnemonic}
          language={language}
          onClose={() => {
            setShowInheritance(false);
            setAccounts(loadAccounts());
            void handleRefresh();
          }}
        />
      )}
    </div>
  );
}
