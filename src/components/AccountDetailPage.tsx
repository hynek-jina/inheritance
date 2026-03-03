import { useCallback, useEffect, useState } from "react";
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

function pluralizeBlocks(blocks: number): string {
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
      reason: "Nejdřív aktivujte účet. Odpočet bloků začne až po aktivaci.",
    };
  }

  if (blocksToSingleKey === 0) {
    return {
      disabled: false,
      reason: "Odeslání je dostupné i samostatně.",
    };
  }

  if (blocksToMultisig > 0) {
    const cosignerLabel = role === "user" ? "dědicem" : "uživatelem";
    return {
      disabled: true,
      reason: `Za ${blocksToMultisig} ${pluralizeBlocks(blocksToMultisig)} s ${cosignerLabel}.`,
    };
  }

  return {
    disabled: false,
    reason: `Společné odeslání je možné hned. Za ${blocksToSingleKey} ${pluralizeBlocks(blocksToSingleKey)} půjde odeslat samostatně.`,
  };
}

function blocksToMinutesEstimate(blocks: number): string {
  const minutes = Math.max(0, blocks) * 10;
  return `za ~${minutes} min`;
}

function getInheritanceStageLabel(
  stage: InheritanceSpendStage,
  role: "user" | "heir",
): string {
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
): string {
  if (blocks <= 0 || stage === currentStage) {
    return "";
  }

  return ` (${blocksToMinutesEstimate(blocks)})`;
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
  canDelete,
  onBack,
  onRefresh,
  onRename,
  onDelete,
  onReceive,
  onSend,
}: AccountDetailPageProps) {
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
    account.type === "standard" ? "Standardní účet" : "Dědický účet";
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
      ? "Dostupné pro majitele"
      : "Dostupné pro dědice";
  const counterpartySubtitle =
    inheritanceDetails?.localRole === "heir"
      ? "Samostatně může utrácet majitel účtu"
      : "Samostatně může utrácet dědic";
  const inheritancePillLabel =
    isInheritance && inheritanceDetails && currentInheritanceStage
      ? getInheritanceStageLabel(
          currentInheritanceStage,
          inheritanceDetails.localRole,
        )
      : isInheritance
        ? isActivatedInheritance
          ? "Aktivováno"
          : "Čeká na aktivaci"
        : "Aktivní";

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
        `Aktivace hotová. Přesunuto ${result.movedAmount.toLocaleString("cs-CZ")} sats na dědický účet. TXID: ${result.txid.slice(0, 12)}…`,
      );
      await onRefresh();
      await loadDetails();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Aktivace selhala";
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
      setCopyAccountMessage("Údaje dědického účtu byly zkopírovány.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Účet se nepodařilo zkopírovat";
      setCopyAccountError(message);
    } finally {
      setIsCopyingAccount(false);
    }
  };

  const handleRenameAccount = async () => {
    const nextName = window.prompt("Nový název účtu:", account.name);
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
        error instanceof Error
          ? error.message
          : "Účet se nepodařilo přejmenovat";
      setCopyAccountError(message);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      `Opravdu chcete smazat účet "${account.name}"?`,
    );
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
        error instanceof Error ? error.message : "Účet se nepodařilo smazat";
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
      {addresses.length === 0 && <div className="detail-loading">Bez dat.</div>}
      {addresses.map((item) => (
        <div key={`${title}-${item.index}`} className="address-audit-item">
          <div className="address-audit-head">
            <span>#{item.index}</span>
            <span className={`audit-badge ${item.hasUnspent ? "yes" : "no"}`}>
              {item.hasUnspent ? "Má zůstatek" : "Bez zůstatku"}
            </span>
          </div>
          <div className="mono wrap address-audit-address">{item.address}</div>
          <div className="address-audit-stats">
            <span>
              Posláno celkem: {item.totalReceived.toLocaleString("cs-CZ")} sats
            </span>
            <span>
              Zbývá: {item.currentBalance.toLocaleString("cs-CZ")} sats
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
            ← Zpět
          </button>
          <button
            className="detail-outline-btn"
            title="Obnovit"
            onClick={async () => {
              await onRefresh();
              await loadDetails();
            }}
          >
            ↻ Obnovit
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
          {account.balance.toLocaleString("cs-CZ")} sats
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
              Přijmout prostředky
            </button>
          )}

          {isStandard && (
            <button
              className="detail-action-btn send"
              onClick={() => onSend(account)}
            >
              Odeslat
            </button>
          )}

          {showActivateActionOnly && (
            <button
              className="detail-action-btn activate"
              disabled={isActivating}
              onClick={handleActivate}
              title="Přesunout prostředky z uživatel+server multisigu do dědického účtu"
            >
              {isActivating ? "Aktivace..." : "🌱 Aktivovat"}
            </button>
          )}

          {showOnlySend && (
            <button
              className="detail-action-btn send"
              onClick={() => onSend(account)}
              disabled={inheritanceSendHint?.disabled ?? true}
              title={
                inheritanceSendHint?.reason || "Odeslání zatím není dostupné"
              }
            >
              Odeslat
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
        <div className="detail-send-hint">
          Receive je po aktivaci uzavřený. Nové prostředky už nelze přidávat.
        </div>
      )}

      {account.type === "inheritance" && showActivateActionOnly && (
        <div className="detail-send-hint">
          {`Čeká na aktivaci: ${pendingActivationBalance.toLocaleString("cs-CZ")} sats`}
        </div>
      )}

      {account.type === "inheritance" && inheritanceDetails && (
        <div className="detail-info-card inheritance-visualization-card">
          <h3>Kdo může utrácet prostředky</h3>
          <div className="inheritance-visualization-list">
            <div
              className={`inheritance-visualization-item ${currentInheritanceStage === "awaitingActivation" ? "active" : ""}`}
            >
              <span className="state-icon">🧊</span>
              <div className="state-main">
                <div className="state-title">Zmrazeno</div>
                <div className="state-subtitle">Čeká na aktivaci účtu</div>
              </div>
            </div>

            <div
              className={`inheritance-visualization-item ${currentInheritanceStage === "locked" ? "active" : ""}`}
            >
              <span className="state-icon">⏳</span>
              <div className="state-main">
                <div className="state-title">Aktivováno</div>
                <div className="state-subtitle">Nikdo nemůže utrácet</div>
              </div>
            </div>

            <div
              className={`inheritance-visualization-item ${currentInheritanceStage === "multisig" ? "active" : ""}`}
            >
              <span className="state-icon">🤝</span>
              <div className="state-main">
                <div className="state-title">Dostupné společně</div>
                <div className="state-subtitle">
                  Uživatel + dědic společně
                  {getStageEtaSuffix(
                    Math.max(
                      0,
                      inheritanceDetails.spendingConditions
                        .multisigAfterBlocks - blocksSinceFunding,
                    ),
                    "multisig",
                    currentInheritanceStage,
                  )}
                </div>
              </div>
            </div>

            <div
              className={`inheritance-visualization-item ${currentInheritanceStage === "localOnly" || currentInheritanceStage === "bothSingle" ? "active" : ""}`}
            >
              <span className="state-icon">🧑</span>
              <div className="state-main">
                <div className="state-title">Dostupné pro vás</div>
                <div className="state-subtitle">
                  Samostatně můžete utrácet
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
        <h3>Správa účtu</h3>
        <div className="detail-mini-actions">
          <button
            type="button"
            className="detail-mini-btn"
            disabled={isRenaming || isDeleting}
            onClick={handleRenameAccount}
          >
            {isRenaming ? "Přejmenovávám..." : "Přejmenovat účet"}
          </button>

          {account.type === "inheritance" && (
            <button
              type="button"
              className="detail-mini-btn"
              disabled={isCopyingAccount}
              onClick={handleCopyInheritanceAccount}
            >
              {isCopyingAccount ? "Kopíruji..." : "Kopírovat účet"}
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              className="detail-mini-btn danger"
              disabled={isDeleting || isRenaming}
              onClick={handleDeleteAccount}
            >
              {isDeleting ? "Mažu..." : "Smazat účet"}
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
            <h3>Informace o účtu</h3>
            <span>{isInfoExpanded ? "−" : "+"}</span>
          </button>
          {isInfoExpanded && isLoading && (
            <div className="detail-loading">Načítání detailů...</div>
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
                  <span>Derivační cesta</span>
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
                  <span>Moje role</span>
                  <span>
                    {inheritanceDetails.localRole === "user"
                      ? "Uživatel"
                      : "Dědic"}
                  </span>
                </div>
                <div className="detail-row vertical">
                  <span>Derivační cesta</span>
                  <span className="mono">
                    {inheritanceDetails.derivationPath}
                  </span>
                </div>
                <div className="detail-row vertical">
                  <span>Fingerprint uživatele</span>
                  <span className="mono">
                    {inheritanceDetails.userFingerprint}
                  </span>
                </div>
                <div className="detail-row vertical">
                  <span>Fingerprint dědice</span>
                  <span className="mono">
                    {inheritanceDetails.heirFingerprint}
                  </span>
                </div>
                <div className="detail-row vertical">
                  <span>tpub uživatele</span>
                  <span className="mono wrap">
                    {inheritanceDetails.userXpub}
                  </span>
                </div>
                <div className="detail-row vertical">
                  <span>tpub dědice</span>
                  <span className="mono wrap">
                    {inheritanceDetails.heirXpub}
                  </span>
                </div>

                <div className="timelock-box">
                  <div>
                    0–{inheritanceDetails.spendingConditions.noSpendBlocks - 1}{" "}
                    bloků: nikdo
                  </div>
                  <div>
                    od{" "}
                    {inheritanceDetails.spendingConditions.multisigAfterBlocks}{" "}
                    bloků: uživatel + dědic
                  </div>
                  <div>
                    od{" "}
                    {inheritanceDetails.spendingConditions.userOnlyAfterBlocks}{" "}
                    bloků: uživatel
                  </div>
                  <div>
                    od{" "}
                    {inheritanceDetails.spendingConditions.heirOnlyAfterBlocks}{" "}
                    bloků: dědic
                  </div>
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
            <h3>Transakční historie</h3>
            <span>{isTxHistoryExpanded ? "−" : "+"}</span>
          </button>

          {isTxHistoryExpanded && !isLoading && transactions.length === 0 && (
            <div className="detail-loading">Zatím bez transakcí.</div>
          )}

          {isTxHistoryExpanded &&
            transactions.map((tx) => (
              <div key={tx.txid} className="tx-item">
                <div className="tx-main-row">
                  <span
                    className={`tx-type ${tx.type === "incoming" ? "in" : "out"}`}
                  >
                    {tx.type === "incoming" ? "Příchozí" : "Odchozí"}
                  </span>
                  <span className="tx-amount">
                    {tx.amount.toLocaleString("cs-CZ")} sats
                  </span>
                </div>
                <div className="tx-sub-row">
                  <a
                    className="mono tx-link"
                    href={`${MEMPOOL_TX_BASE_URL}/${tx.txid}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Otevřít transakci na mempool.space"
                  >
                    {tx.txid}
                  </a>
                  <span>
                    {new Date(tx.timestamp * 1000).toLocaleString("cs-CZ")}
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
            <h3>Kontrola adres (prvních 10)</h3>
            <span>{isAddressAuditExpanded ? "−" : "+"}</span>
          </button>
          {isAddressAuditExpanded && isLoading && (
            <div className="detail-loading">Načítání adres...</div>
          )}
          {isAddressAuditExpanded && !isLoading && (
            <div className="address-audit-grid">
              {renderAddressAuditList("Receive adresy", receiveAddresses)}
              {renderAddressAuditList("Change adresy", changeAddresses)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
