import { useCallback, useEffect, useState } from "react";
import type { AppLanguage } from "../constants";
import {
  activateInheritanceFunds,
  exportInheritanceAccountShare,
  getInheritanceAccountDetails,
  getStandardAccountDetails,
  isInheritanceAccountActivated,
} from "../services/wallet";
import type {
  Account,
  AccountAddressAuditEntry,
  InheritanceAccountDetails,
  SpendingConditions,
  StandardAccountDetails,
} from "../types";
import "./AccountDetailPage.css";

const ACTIVATION_FEE_RATE = 5;
const MEMPOOL_TX_BASE_URL = "https://mempool.space/signet/tx";

type InheritanceSpendStage =
  | "awaitingActivation"
  | "locked"
  | "multisig"
  | "localOnly"
  | "counterpartyOnly"
  | "bothSingle";

function pluralizeBlocks(blocks: number, language: AppLanguage): string {
  if (language === "en") {
    return blocks === 1 ? "block" : "blocks";
  }

  if (blocks === 1) {
    return "blok";
  }

  if (blocks >= 2 && blocks <= 4) {
    return "bloky";
  }

  return "bloků";
}

function getInheritanceSendHint(
  activated: boolean,
  role: "user" | "heir",
  blocksSinceFunding: number,
  conditions: SpendingConditions,
  language: AppLanguage,
): {
  disabled: boolean;
  reason: string;
} {
  const blocksToMultisig = Math.max(
    0,
    conditions.multisigAfterBlocks - blocksSinceFunding,
  );
  const singleKeyThreshold =
    role === "user"
      ? conditions.userOnlyAfterBlocks
      : conditions.heirOnlyAfterBlocks;
  const blocksToSingleKey = Math.max(
    0,
    singleKeyThreshold - blocksSinceFunding,
  );

  if (!activated) {
    return {
      disabled: true,
      reason:
        language === "cs"
          ? "Nejdřív aktivujte účet. Odpočet bloků začne až po aktivaci."
          : "Activate the account first. Block countdown starts only after activation.",
    };
  }

  if (blocksToSingleKey === 0) {
    return {
      disabled: false,
      reason:
        language === "cs"
          ? "Odeslání je dostupné i samostatně."
          : "Sending is available in single-signature mode.",
    };
  }

  if (blocksToMultisig > 0) {
    const cosignerLabel =
      language === "cs"
        ? role === "user"
          ? "dědicem"
          : "uživatelem"
        : role === "user"
          ? "heir"
          : "owner";
    return {
      disabled: true,
      reason:
        language === "cs"
          ? `Za ${blocksToMultisig} ${pluralizeBlocks(blocksToMultisig, language)} s ${cosignerLabel}.`
          : `In ${blocksToMultisig} ${pluralizeBlocks(blocksToMultisig, language)} with ${cosignerLabel}.`,
    };
  }

  return {
    disabled: false,
    reason:
      language === "cs"
        ? `Společné odeslání je možné hned. Za ${blocksToSingleKey} ${pluralizeBlocks(blocksToSingleKey, language)} půjde odeslat samostatně.`
        : `Shared sending is available now. In ${blocksToSingleKey} ${pluralizeBlocks(blocksToSingleKey, language)} single-signature sending becomes available.`,
  };
}

function blocksToMinutesEstimate(
  blocks: number,
  language: AppLanguage,
): string {
  const minutes = Math.max(0, blocks) * 10;
  return language === "cs" ? `za ~${minutes} min` : `in ~${minutes} min`;
}

function getInheritanceStageLabel(
  stage: InheritanceSpendStage,
  role: "user" | "heir",
  language: AppLanguage,
): string {
  if (language === "en") {
    switch (stage) {
      case "awaitingActivation":
        return "Awaiting activation";
      case "locked":
        return "Activated";
      case "multisig":
        return "Available together";
      case "localOnly":
        return "Available for you";
      case "counterpartyOnly":
        return role === "heir" ? "Available for owner" : "Available for heir";
      case "bothSingle":
        return "Available for both";
      default:
        return "Inheritance account";
    }
  }

  switch (stage) {
    case "awaitingActivation":
      return "Čeká na aktivaci";
    case "locked":
      return "Aktivováno";
    case "multisig":
      return "Dostupné společně";
    case "localOnly":
      return "Dostupné pro vás";
    case "counterpartyOnly":
      return role === "heir" ? "Dostupné pro majitele" : "Dostupné pro dědice";
    case "bothSingle":
      return "Dostupné pro oba";
    default:
      return "Dědický účet";
  }
}

function getStageEtaSuffix(
  blocks: number,
  stage: InheritanceSpendStage,
  currentStage: InheritanceSpendStage | null,
  language: AppLanguage,
): string {
  if (blocks <= 0 || stage === currentStage) {
    return "";
  }

  return ` (${blocksToMinutesEstimate(blocks, language)})`;
}

function getCurrentInheritanceSpendStage(
  activated: boolean,
  role: "user" | "heir",
  blocksSinceFunding: number,
  conditions: SpendingConditions,
): InheritanceSpendStage {
  if (!activated) {
    return "awaitingActivation";
  }

  if (blocksSinceFunding < conditions.noSpendBlocks) {
    return "locked";
  }

  const localThreshold =
    role === "user"
      ? conditions.userOnlyAfterBlocks
      : conditions.heirOnlyAfterBlocks;
  const counterpartyThreshold =
    role === "user"
      ? conditions.heirOnlyAfterBlocks
      : conditions.userOnlyAfterBlocks;

  const localAvailable = blocksSinceFunding >= localThreshold;
  const counterpartyAvailable = blocksSinceFunding >= counterpartyThreshold;

  if (localAvailable && counterpartyAvailable) {
    return "bothSingle";
  }

  if (localAvailable) {
    return "localOnly";
  }

  if (counterpartyAvailable) {
    return "counterpartyOnly";
  }

  return "multisig";
}

interface AccountDetailPageProps {
  account: Account;
  mnemonic: string;
  language: AppLanguage;
  canDelete: boolean;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onRename: (account: Account, newName: string) => Promise<void>;
  onDelete: (account: Account) => Promise<void>;
  onReceive: (account: Account) => void;
  onSend: (account: Account) => void;
}

export function AccountDetailPage({
  account,
  mnemonic,
  language,
  canDelete,
  onBack,
  onRefresh,
  onRename,
  onDelete,
  onReceive,
  onSend,
}: AccountDetailPageProps) {
  const locale = language === "cs" ? "cs-CZ" : "en-US";
  const labels =
    language === "cs"
      ? {
          accountTypeStandard: "Standardní účet",
          accountTypeInheritance: "Dědický účet",
          active: "Aktivní",
          activated: "Aktivováno",
          awaitingActivation: "Čeká na aktivaci",
          activationDone: (movedAmount: number, txid: string) =>
            `Aktivace hotová. Přesunuto ${movedAmount.toLocaleString("cs-CZ")} sats na dědický účet. TXID: ${txid.slice(0, 12)}…`,
          activationFailed: "Aktivace selhala",
          accountCopied: "Údaje dědického účtu byly zkopírovány.",
          copyAccountFailed: "Účet se nepodařilo zkopírovat",
          renamePrompt: "Nový název účtu:",
          renameFailed: "Účet se nepodařilo přejmenovat",
          deleteConfirm: (name: string) =>
            `Opravdu chcete smazat účet "${name}"?`,
          deleteFailed: "Účet se nepodařilo smazat",
          noData: "Bez dat.",
          hasBalance: "Má zůstatek",
          noBalance: "Bez zůstatku",
          totalSent: "Posláno celkem",
          remaining: "Zbývá",
          back: "Zpět",
          refresh: "Obnovit",
          receiveFunds: "Přijmout prostředky",
          send: "Odeslat",
          activating: "Aktivace...",
          activate: "🌱 Aktivovat",
          activateTitle:
            "Přesunout prostředky z uživatel+server multisigu do dědického účtu",
          sendUnavailable: "Odeslání zatím není dostupné",
          receiveClosed:
            "Příjem je po aktivaci uzavřený. Nové prostředky už nelze přidávat.",
          awaitingActivationWithBalance: (balance: number) =>
            `Čeká na aktivaci: ${balance.toLocaleString("cs-CZ")} sats`,
          whoCanSpend: "Kdo může utrácet prostředky",
          frozen: "Zmrazeno",
          waitingForActivation: "Čeká na aktivaci účtu",
          activatedState: "Aktivováno",
          noOneCanSpend: "Nikdo nemůže utrácet",
          availableTogether: "Dostupné společně",
          userAndHeirTogether: "Uživatel + dědic společně",
          availableForYou: "Dostupné pro vás",
          youCanSpendAlone: "Samostatně můžete utrácet",
          availableForOwner: "Dostupné pro majitele",
          availableForHeir: "Dostupné pro dědice",
          ownerCanSpendAlone: "Samostatně může utrácet majitel účtu",
          heirCanSpendAlone: "Samostatně může utrácet dědic",
          manageAccount: "Správa účtu",
          renaming: "Přejmenovávám...",
          renameAccount: "Přejmenovat účet",
          copying: "Kopíruji...",
          copyAccount: "Kopírovat účet",
          deleting: "Mažu...",
          deleteAccount: "Smazat účet",
          accountInfo: "Informace o účtu",
          loadingDetails: "Načítání detailů...",
          derivationPath: "Derivační cesta",
          myRole: "Moje role",
          user: "Uživatel",
          heir: "Dědic",
          userFingerprint: "Fingerprint uživatele",
          heirFingerprint: "Fingerprint dědice",
          userXpub: "tpub uživatele",
          heirXpub: "tpub dědice",
          txHistory: "Transakční historie",
          noTransactions: "Zatím bez transakcí.",
          openOnMempool: "Otevřít transakci na mempool.space",
          addressAudit: "Kontrola adres (prvních 10)",
          loadingAddresses: "Načítání adres...",
          receiveAddresses: "Receive adresy",
          changeAddresses: "Change adresy",
          incoming: "Příchozí",
          outgoing: "Odchozí",
          activation: "Aktivační",
        }
      : {
          accountTypeStandard: "Standard account",
          accountTypeInheritance: "Inheritance account",
          active: "Active",
          activated: "Activated",
          awaitingActivation: "Awaiting activation",
          activationDone: (movedAmount: number, txid: string) =>
            `Activation complete. Moved ${movedAmount.toLocaleString("en-US")} sats to inheritance account. TXID: ${txid.slice(0, 12)}…`,
          activationFailed: "Activation failed",
          accountCopied: "Inheritance account data copied.",
          copyAccountFailed: "Failed to copy account",
          renamePrompt: "New account name:",
          renameFailed: "Failed to rename account",
          deleteConfirm: (name: string) =>
            `Do you really want to delete account "${name}"?`,
          deleteFailed: "Failed to delete account",
          noData: "No data.",
          hasBalance: "Has balance",
          noBalance: "No balance",
          totalSent: "Total sent",
          remaining: "Remaining",
          back: "Back",
          refresh: "Refresh",
          receiveFunds: "Receive funds",
          send: "Send",
          activating: "Activating...",
          activate: "🌱 Activate",
          activateTitle:
            "Move funds from user+server multisig into inheritance account",
          sendUnavailable: "Sending is not available yet",
          receiveClosed:
            "Receive is closed after activation. New funds cannot be added.",
          awaitingActivationWithBalance: (balance: number) =>
            `Awaiting activation: ${balance.toLocaleString("en-US")} sats`,
          whoCanSpend: "Who can spend funds",
          frozen: "Frozen",
          waitingForActivation: "Waiting for account activation",
          activatedState: "Activated",
          noOneCanSpend: "No one can spend",
          availableTogether: "Available together",
          userAndHeirTogether: "User + heir together",
          availableForYou: "Available for you",
          youCanSpendAlone: "You can spend alone",
          availableForOwner: "Available for owner",
          availableForHeir: "Available for heir",
          ownerCanSpendAlone: "Owner can spend alone",
          heirCanSpendAlone: "Heir can spend alone",
          manageAccount: "Account management",
          renaming: "Renaming...",
          renameAccount: "Rename account",
          copying: "Copying...",
          copyAccount: "Copy account",
          deleting: "Deleting...",
          deleteAccount: "Delete account",
          accountInfo: "Account information",
          loadingDetails: "Loading details...",
          derivationPath: "Derivation path",
          myRole: "My role",
          user: "User",
          heir: "Heir",
          userFingerprint: "User fingerprint",
          heirFingerprint: "Heir fingerprint",
          userXpub: "User tpub",
          heirXpub: "Heir tpub",
          txHistory: "Transaction history",
          noTransactions: "No transactions yet.",
          openOnMempool: "Open transaction on mempool.space",
          addressAudit: "Address audit (first 10)",
          loadingAddresses: "Loading addresses...",
          receiveAddresses: "Receive addresses",
          changeAddresses: "Change addresses",
          incoming: "Incoming",
          outgoing: "Outgoing",
          activation: "Activation",
        };
  const [standardDetails, setStandardDetails] =
    useState<StandardAccountDetails | null>(null);
  const [inheritanceDetails, setInheritanceDetails] =
    useState<InheritanceAccountDetails | null>(null);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [isTxHistoryExpanded, setIsTxHistoryExpanded] = useState(false);
  const [isAddressAuditExpanded, setIsAddressAuditExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivating, setIsActivating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCopyingAccount, setIsCopyingAccount] = useState(false);
  const [copyAccountMessage, setCopyAccountMessage] = useState("");
  const [copyAccountError, setCopyAccountError] = useState("");
  const [activationMessage, setActivationMessage] = useState("");
  const [activationError, setActivationError] = useState("");
  const isStandard = account.type === "standard";
  const isInheritance = account.type === "inheritance";

  const loadDetails = useCallback(async () => {
    setIsLoading(true);

    if (isStandard) {
      const details = await getStandardAccountDetails(mnemonic, account);
      setStandardDetails(details);
      setInheritanceDetails(null);
    } else {
      const details = await getInheritanceAccountDetails(mnemonic, account);
      setInheritanceDetails(details);
      setStandardDetails(null);
    }

    setIsLoading(false);
  }, [account, isStandard, mnemonic]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadDetails();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadDetails]);

  useEffect(() => {
    setIsInfoExpanded(false);
    setIsTxHistoryExpanded(false);
    setIsAddressAuditExpanded(false);
  }, [account.id]);

  const transactions = isStandard
    ? (standardDetails?.transactions ?? [])
    : (inheritanceDetails?.transactions ?? []);

  const receiveAddresses = isStandard
    ? (standardDetails?.receiveAddresses ?? [])
    : (inheritanceDetails?.receiveAddresses ?? []);

  const changeAddresses = isStandard
    ? (standardDetails?.changeAddresses ?? [])
    : (inheritanceDetails?.changeAddresses ?? []);

  const inheritanceSendHint =
    isInheritance && inheritanceDetails
      ? getInheritanceSendHint(
          isInheritanceAccountActivated(account),
          inheritanceDetails.localRole,
          account.inheritanceStatus?.blocksSinceFunding || 0,
          inheritanceDetails.spendingConditions,
          language,
        )
      : null;

  const blocksSinceFunding = account.inheritanceStatus?.blocksSinceFunding ?? 0;

  const pendingActivationBalance = isInheritance
    ? account.derivedAddresses
        .filter((address) => address.role === "funding")
        .reduce((sum, address) => sum + (address.balance || 0), 0)
    : 0;
  const isActivatedInheritance =
    isInheritance && isInheritanceAccountActivated(account);
  const showOnlySend = isInheritance && isActivatedInheritance;
  const showActivateActionOnly =
    isInheritance && !isActivatedInheritance && pendingActivationBalance > 0;
  const hasActionButtons = isStandard || showActivateActionOnly || showOnlySend;
  const accountTypeLabel =
    account.type === "standard"
      ? labels.accountTypeStandard
      : labels.accountTypeInheritance;
  const currentInheritanceStage =
    isInheritance && inheritanceDetails
      ? getCurrentInheritanceSpendStage(
          isActivatedInheritance,
          inheritanceDetails.localRole,
          blocksSinceFunding,
          inheritanceDetails.spendingConditions,
        )
      : null;
  const counterpartyLabel =
    inheritanceDetails?.localRole === "heir"
      ? labels.availableForOwner
      : labels.availableForHeir;
  const counterpartySubtitle =
    inheritanceDetails?.localRole === "heir"
      ? labels.ownerCanSpendAlone
      : labels.heirCanSpendAlone;
  const inheritancePillLabel =
    isInheritance && inheritanceDetails && currentInheritanceStage
      ? getInheritanceStageLabel(
          currentInheritanceStage,
          inheritanceDetails.localRole,
          language,
        )
      : isInheritance
        ? isActivatedInheritance
          ? labels.activated
          : labels.awaitingActivation
        : labels.active;

  const handleActivate = async () => {
    if (!isInheritance) {
      return;
    }

    setActivationMessage("");
    setActivationError("");
    setIsActivating(true);

    try {
      const result = await activateInheritanceFunds(
        mnemonic,
        account,
        ACTIVATION_FEE_RATE,
      );
      setActivationMessage(
        labels.activationDone(result.movedAmount, result.txid),
      );
      await onRefresh();
      await loadDetails();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : labels.activationFailed;
      setActivationError(message);
    } finally {
      setIsActivating(false);
    }
  };

  const handleCopyInheritanceAccount = async () => {
    if (!isInheritance) {
      return;
    }

    setCopyAccountMessage("");
    setCopyAccountError("");
    setIsCopyingAccount(true);

    try {
      const share = await exportInheritanceAccountShare(mnemonic, account);
      await navigator.clipboard.writeText(share);
      setCopyAccountMessage(labels.accountCopied);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : labels.copyAccountFailed;
      setCopyAccountError(message);
    } finally {
      setIsCopyingAccount(false);
    }
  };

  const handleRenameAccount = async () => {
    const nextName = window.prompt(labels.renamePrompt, account.name);
    if (nextName === null) {
      return;
    }

    setCopyAccountMessage("");
    setCopyAccountError("");
    setActivationMessage("");
    setActivationError("");
    setIsRenaming(true);

    try {
      await onRename(account, nextName);
      await loadDetails();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : labels.renameFailed;
      setCopyAccountError(message);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(labels.deleteConfirm(account.name));
    if (!confirmed) {
      return;
    }

    setCopyAccountMessage("");
    setCopyAccountError("");
    setActivationMessage("");
    setActivationError("");
    setIsDeleting(true);

    try {
      await onDelete(account);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : labels.deleteFailed;
      setCopyAccountError(message);
      setIsDeleting(false);
    }
  };

  const renderAddressAuditList = (
    title: string,
    addresses: AccountAddressAuditEntry[],
  ) => (
    <div className="address-audit-block">
      <h4>{title}</h4>
      {addresses.length === 0 && (
        <div className="detail-loading">{labels.noData}</div>
      )}
      {addresses.map((item) => (
        <div key={`${title}-${item.index}`} className="address-audit-item">
          <div className="address-audit-head">
            <span>#{item.index}</span>
            <span className={`audit-badge ${item.hasUnspent ? "yes" : "no"}`}>
              {item.hasUnspent ? labels.hasBalance : labels.noBalance}
            </span>
          </div>
          <div className="mono wrap address-audit-address">{item.address}</div>
          <div className="address-audit-stats">
            <span>
              {labels.totalSent}: {item.totalReceived.toLocaleString(locale)}{" "}
              sats
            </span>
            <span>
              {labels.remaining}: {item.currentBalance.toLocaleString(locale)}{" "}
              sats
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="account-detail-page">
      <div className="account-detail-header">
        <div className="detail-header-actions">
          <button className="back-btn" onClick={onBack}>
            ← {labels.back}
          </button>
          <button
            className="detail-outline-btn"
            title={labels.refresh}
            onClick={async () => {
              await onRefresh();
              await loadDetails();
            }}
          >
            ↻ {labels.refresh}
          </button>
        </div>
      </div>

      <div
        className={`detail-balance-card ${account.type === "inheritance" ? "inheritance" : ""}`}
      >
        <div className="detail-account-top">
          <div>
            <div className="detail-account-name">{account.name}</div>
            <div className="detail-account-type">{accountTypeLabel}</div>
          </div>
          <span className="detail-pill">{inheritancePillLabel}</span>
        </div>
        <div className="detail-account-balance">
          {account.balance.toLocaleString(locale)} sats
        </div>
      </div>

      {hasActionButtons && (
        <div
          className={`detail-action-row ${isStandard || showActivateActionOnly ? "" : "single"}`}
        >
          {isStandard && (
            <button
              className="detail-action-btn receive"
              onClick={() => onReceive(account)}
            >
              {labels.receiveFunds}
            </button>
          )}

          {isStandard && (
            <button
              className="detail-action-btn send"
              onClick={() => onSend(account)}
            >
              {labels.send}
            </button>
          )}

          {showActivateActionOnly && (
            <button
              className="detail-action-btn activate"
              disabled={isActivating}
              onClick={handleActivate}
              title={labels.activateTitle}
            >
              {isActivating ? labels.activating : labels.activate}
            </button>
          )}

          {showOnlySend && (
            <button
              className="detail-action-btn send"
              onClick={() => onSend(account)}
              disabled={inheritanceSendHint?.disabled ?? true}
              title={inheritanceSendHint?.reason || labels.sendUnavailable}
            >
              {labels.send}
            </button>
          )}
        </div>
      )}

      {account.type === "inheritance" &&
        isActivatedInheritance &&
        inheritanceSendHint && (
          <div className="detail-send-hint">{inheritanceSendHint.reason}</div>
        )}

      {account.type === "inheritance" && isActivatedInheritance && (
        <div className="detail-send-hint">{labels.receiveClosed}</div>
      )}

      {account.type === "inheritance" && showActivateActionOnly && (
        <div className="detail-send-hint">
          {labels.awaitingActivationWithBalance(pendingActivationBalance)}
        </div>
      )}

      {account.type === "inheritance" && inheritanceDetails && (
        <div className="detail-info-card inheritance-visualization-card">
          <h3>{labels.whoCanSpend}</h3>
          <div className="inheritance-visualization-list">
            <div
              className={`inheritance-visualization-item ${currentInheritanceStage === "awaitingActivation" ? "active" : ""}`}
            >
              <span className="state-icon">🧊</span>
              <div className="state-main">
                <div className="state-title">{labels.frozen}</div>
                <div className="state-subtitle">
                  {labels.waitingForActivation}
                </div>
              </div>
            </div>

            <div
              className={`inheritance-visualization-item ${currentInheritanceStage === "locked" ? "active" : ""}`}
            >
              <span className="state-icon">⏳</span>
              <div className="state-main">
                <div className="state-title">{labels.activatedState}</div>
                <div className="state-subtitle">{labels.noOneCanSpend}</div>
              </div>
            </div>

            <div
              className={`inheritance-visualization-item ${currentInheritanceStage === "multisig" ? "active" : ""}`}
            >
              <span className="state-icon">🤝</span>
              <div className="state-main">
                <div className="state-title">{labels.availableTogether}</div>
                <div className="state-subtitle">
                  {labels.userAndHeirTogether}
                  {getStageEtaSuffix(
                    Math.max(
                      0,
                      inheritanceDetails.spendingConditions
                        .multisigAfterBlocks - blocksSinceFunding,
                    ),
                    "multisig",
                    currentInheritanceStage,
                    language,
                  )}
                </div>
              </div>
            </div>

            <div
              className={`inheritance-visualization-item ${currentInheritanceStage === "localOnly" || currentInheritanceStage === "bothSingle" ? "active" : ""}`}
            >
              <span className="state-icon">🧑</span>
              <div className="state-main">
                <div className="state-title">{labels.availableForYou}</div>
                <div className="state-subtitle">
                  {labels.youCanSpendAlone}
                  {getStageEtaSuffix(
                    Math.max(
                      0,
                      (inheritanceDetails.localRole === "user"
                        ? inheritanceDetails.spendingConditions
                            .userOnlyAfterBlocks
                        : inheritanceDetails.spendingConditions
                            .heirOnlyAfterBlocks) - blocksSinceFunding,
                    ),
                    "localOnly",
                    currentInheritanceStage,
                    language,
                  )}
                </div>
              </div>
            </div>

            <div
              className={`inheritance-visualization-item ${currentInheritanceStage === "counterpartyOnly" || currentInheritanceStage === "bothSingle" ? "active" : ""}`}
            >
              <span className="state-icon">👤</span>
              <div className="state-main">
                <div className="state-title">{counterpartyLabel}</div>
                <div className="state-subtitle">
                  {counterpartySubtitle}
                  {getStageEtaSuffix(
                    Math.max(
                      0,
                      (inheritanceDetails.localRole === "user"
                        ? inheritanceDetails.spendingConditions
                            .heirOnlyAfterBlocks
                        : inheritanceDetails.spendingConditions
                            .userOnlyAfterBlocks) - blocksSinceFunding,
                    ),
                    "counterpartyOnly",
                    currentInheritanceStage,
                    language,
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {copyAccountMessage && (
        <div className="detail-inline-message success">
          {copyAccountMessage}
        </div>
      )}
      {copyAccountError && (
        <div className="detail-inline-message error">{copyAccountError}</div>
      )}

      {activationMessage && (
        <div className="detail-inline-message success">{activationMessage}</div>
      )}
      {activationError && (
        <div className="detail-inline-message error">{activationError}</div>
      )}

      <div className="detail-info-card detail-manage-card">
        <h3>{labels.manageAccount}</h3>
        <div className="detail-mini-actions">
          <button
            type="button"
            className="detail-mini-btn"
            disabled={isRenaming || isDeleting}
            onClick={handleRenameAccount}
          >
            {isRenaming ? labels.renaming : labels.renameAccount}
          </button>

          {account.type === "inheritance" && (
            <button
              type="button"
              className="detail-mini-btn"
              disabled={isCopyingAccount}
              onClick={handleCopyInheritanceAccount}
            >
              {isCopyingAccount ? labels.copying : labels.copyAccount}
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              className="detail-mini-btn danger"
              disabled={isDeleting || isRenaming}
              onClick={handleDeleteAccount}
            >
              {isDeleting ? labels.deleting : labels.deleteAccount}
            </button>
          )}
        </div>
      </div>

      <div className="detail-bottom-sections">
        <div className="detail-info-card">
          <button
            type="button"
            className="detail-collapse-btn"
            onClick={() => setIsInfoExpanded((value) => !value)}
          >
            <h3>{labels.accountInfo}</h3>
            <span>{isInfoExpanded ? "−" : "+"}</span>
          </button>
          {isInfoExpanded && isLoading && (
            <div className="detail-loading">{labels.loadingDetails}</div>
          )}

          {isInfoExpanded &&
            !isLoading &&
            account.type === "standard" &&
            standardDetails && (
              <>
                <div className="detail-row">
                  <span>Fingerprint</span>
                  <span className="mono">
                    {standardDetails.masterFingerprint}
                  </span>
                </div>
                <div className="detail-row vertical">
                  <span>{labels.derivationPath}</span>
                  <span className="mono">{standardDetails.derivationPath}</span>
                </div>
                <div className="detail-row vertical">
                  <span>tpub (account extended public key)</span>
                  <span className="mono wrap">
                    {standardDetails.accountXpub}
                  </span>
                </div>
              </>
            )}

          {isInfoExpanded &&
            !isLoading &&
            account.type === "inheritance" &&
            inheritanceDetails && (
              <>
                <div className="detail-row">
                  <span>{labels.myRole}</span>
                  <span>
                    {inheritanceDetails.localRole === "user"
                      ? labels.user
                      : labels.heir}
                  </span>
                </div>
                <div className="detail-row vertical">
                  <span>{labels.derivationPath}</span>
                  <span className="mono">
                    {inheritanceDetails.derivationPath}
                  </span>
                </div>
                <div className="detail-row vertical">
                  <span>{labels.userFingerprint}</span>
                  <span className="mono">
                    {inheritanceDetails.userFingerprint}
                  </span>
                </div>
                <div className="detail-row vertical">
                  <span>{labels.heirFingerprint}</span>
                  <span className="mono">
                    {inheritanceDetails.heirFingerprint}
                  </span>
                </div>
                <div className="detail-row vertical">
                  <span>{labels.userXpub}</span>
                  <span className="mono wrap">
                    {inheritanceDetails.userXpub}
                  </span>
                </div>
                <div className="detail-row vertical">
                  <span>{labels.heirXpub}</span>
                  <span className="mono wrap">
                    {inheritanceDetails.heirXpub}
                  </span>
                </div>
              </>
            )}
        </div>

        <div className="detail-info-card">
          <button
            type="button"
            className="detail-collapse-btn"
            onClick={() => setIsTxHistoryExpanded((value) => !value)}
          >
            <h3>{labels.txHistory}</h3>
            <span>{isTxHistoryExpanded ? "−" : "+"}</span>
          </button>

          {isTxHistoryExpanded && !isLoading && transactions.length === 0 && (
            <div className="detail-loading">{labels.noTransactions}</div>
          )}

          {isTxHistoryExpanded &&
            transactions.map((tx) => (
              <div key={tx.txid} className="tx-item">
                <div className="tx-main-row">
                  <span
                    className={`tx-type ${tx.type === "incoming" ? "in" : tx.type === "activation" ? "activation" : "out"}`}
                  >
                    {tx.type === "incoming"
                      ? labels.incoming
                      : tx.type === "activation"
                        ? labels.activation
                        : labels.outgoing}
                  </span>
                  <span className="tx-amount">
                    {tx.amount.toLocaleString(locale)} sats
                  </span>
                </div>
                <div className="tx-sub-row">
                  <a
                    className="mono tx-link"
                    href={`${MEMPOOL_TX_BASE_URL}/${tx.txid}`}
                    target="_blank"
                    rel="noreferrer"
                    title={labels.openOnMempool}
                  >
                    {tx.txid}
                  </a>
                  <span>
                    {new Date(tx.timestamp * 1000).toLocaleString(locale)}
                  </span>
                </div>
              </div>
            ))}
        </div>

        <div className="detail-info-card">
          <button
            type="button"
            className="detail-collapse-btn"
            onClick={() => setIsAddressAuditExpanded((value) => !value)}
          >
            <h3>{labels.addressAudit}</h3>
            <span>{isAddressAuditExpanded ? "−" : "+"}</span>
          </button>
          {isAddressAuditExpanded && isLoading && (
            <div className="detail-loading">{labels.loadingAddresses}</div>
          )}
          {isAddressAuditExpanded && !isLoading && (
            <div className="address-audit-grid">
              {renderAddressAuditList(
                labels.receiveAddresses,
                receiveAddresses,
              )}
              {renderAddressAuditList(labels.changeAddresses, changeAddresses)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
