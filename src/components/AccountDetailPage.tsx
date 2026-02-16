import { useCallback, useEffect, useState } from "react";
import {
  activateInheritanceFunds,
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

interface AccountDetailPageProps {
  account: Account;
  mnemonic: string;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onReceive: (account: Account) => void;
  onSend: (account: Account) => void;
}

export function AccountDetailPage({
  account,
  mnemonic,
  onBack,
  onRefresh,
  onReceive,
  onSend,
}: AccountDetailPageProps) {
  const [standardDetails, setStandardDetails] =
    useState<StandardAccountDetails | null>(null);
  const [inheritanceDetails, setInheritanceDetails] =
    useState<InheritanceAccountDetails | null>(null);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [isAddressAuditExpanded, setIsAddressAuditExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivating, setIsActivating] = useState(false);
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

  const pendingActivationBalance = isInheritance
    ? account.derivedAddresses
        .filter((address) => address.role === "funding")
        .reduce((sum, address) => sum + (address.balance || 0), 0)
    : 0;
  const isActivatedInheritance =
    isInheritance && isInheritanceAccountActivated(account);
  const showOnlySend = isInheritance && isActivatedInheritance;
  const showActivateAndReceive =
    isInheritance && !isActivatedInheritance && pendingActivationBalance > 0;
  const showOnlyReceive =
    isInheritance && !isActivatedInheritance && pendingActivationBalance <= 0;

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
        <button className="back-btn" onClick={onBack}>
          ← Zpět
        </button>
        <button
          className="refresh-btn"
          title="Obnovit"
          onClick={async () => {
            await onRefresh();
            await loadDetails();
          }}
        >
          ↻
        </button>
      </div>

      <div className="detail-balance-card">
        <div className="detail-account-name">{account.name}</div>
        <div className="detail-account-type">
          {account.type === "standard" ? "Standardní účet" : "Dědický účet"}
        </div>
        <div className="detail-account-balance">
          {account.balance.toLocaleString("cs-CZ")} sats
        </div>
      </div>

      <div
        className={`detail-action-row ${isStandard || showActivateAndReceive ? "" : "single"}`}
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

        {showOnlyReceive && (
          <button
            className="detail-action-btn receive"
            onClick={() => onReceive(account)}
          >
            Přijmout
          </button>
        )}

        {showActivateAndReceive && (
          <>
            <button
              className="detail-action-btn activate"
              disabled={isActivating}
              onClick={handleActivate}
              title="Přesunout prostředky z uživatel+server multisigu do dědického účtu"
            >
              {isActivating ? "Aktivace..." : "Aktivovat"}
            </button>
            <button
              className="detail-action-btn receive secondary"
              onClick={() => onReceive(account)}
            >
              Přijmout další prostředky
            </button>
          </>
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

      {account.type === "inheritance" && showActivateAndReceive && (
        <>
          <div className="detail-send-hint">
            {`Čeká na aktivaci: ${pendingActivationBalance.toLocaleString("cs-CZ")} sats`}
          </div>
        </>
      )}

      {activationMessage && (
        <div className="detail-inline-message success">{activationMessage}</div>
      )}
      {activationError && (
        <div className="detail-inline-message error">{activationError}</div>
      )}

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
                <span className="mono wrap">{standardDetails.accountXpub}</span>
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
                <span className="mono wrap">{inheritanceDetails.userXpub}</span>
              </div>
              <div className="detail-row vertical">
                <span>tpub dědice</span>
                <span className="mono wrap">{inheritanceDetails.heirXpub}</span>
              </div>

              <div className="timelock-box">
                <div>
                  0–{inheritanceDetails.spendingConditions.noSpendBlocks - 1}{" "}
                  bloků: nikdo
                </div>
                <div>
                  od {inheritanceDetails.spendingConditions.multisigAfterBlocks}{" "}
                  bloků: uživatel + dědic
                </div>
                <div>
                  od {inheritanceDetails.spendingConditions.userOnlyAfterBlocks}{" "}
                  bloků: uživatel
                </div>
                <div>
                  od {inheritanceDetails.spendingConditions.heirOnlyAfterBlocks}{" "}
                  bloků: dědic
                </div>
              </div>
            </>
          )}
      </div>

      <div className="detail-info-card">
        <h3>Transakční historie</h3>
        {!isLoading && transactions.length === 0 && (
          <div className="detail-loading">Zatím bez transakcí.</div>
        )}

        {transactions.map((tx) => (
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
              <span className="mono">{tx.txid.slice(0, 10)}…</span>
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
  );
}
