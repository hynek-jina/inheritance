import { useCallback, useEffect, useState } from "react";
import {
  getInheritanceAccountDetails,
  getStandardAccountDetails,
} from "../services/wallet";
import type {
  Account,
  AccountAddressAuditEntry,
  InheritanceAccountDetails,
  StandardAccountDetails,
} from "../types";
import "./AccountDetailPage.css";

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
  const [isLoading, setIsLoading] = useState(true);

  const loadDetails = useCallback(async () => {
    setIsLoading(true);

    if (account.type === "standard") {
      const details = await getStandardAccountDetails(mnemonic, account);
      setStandardDetails(details);
      setInheritanceDetails(null);
    } else {
      const details = await getInheritanceAccountDetails(mnemonic, account);
      setInheritanceDetails(details);
      setStandardDetails(null);
    }

    setIsLoading(false);
  }, [account, mnemonic]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadDetails();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadDetails]);

  const transactions =
    account.type === "standard"
      ? (standardDetails?.transactions ?? [])
      : (inheritanceDetails?.transactions ?? []);

  const receiveAddresses =
    account.type === "standard"
      ? (standardDetails?.receiveAddresses ?? [])
      : (inheritanceDetails?.receiveAddresses ?? []);

  const changeAddresses =
    account.type === "standard"
      ? (standardDetails?.changeAddresses ?? [])
      : (inheritanceDetails?.changeAddresses ?? []);

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

      <div className="detail-action-row">
        <button
          className="detail-action-btn receive"
          onClick={() => onReceive(account)}
        >
          Přijmout prostředky
        </button>
        {account.type === "standard" && (
          <button
            className="detail-action-btn send"
            onClick={() => onSend(account)}
          >
            Odeslat
          </button>
        )}
      </div>

      <div className="detail-info-card">
        <h3>Informace o účtu</h3>
        {isLoading && <div className="detail-loading">Načítání detailů...</div>}

        {!isLoading && account.type === "standard" && standardDetails && (
          <>
            <div className="detail-row">
              <span>Fingerprint</span>
              <span className="mono">{standardDetails.masterFingerprint}</span>
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

        {!isLoading && account.type === "inheritance" && inheritanceDetails && (
          <>
            <div className="detail-row">
              <span>Moje role</span>
              <span>
                {inheritanceDetails.localRole === "user" ? "Uživatel" : "Dědic"}
              </span>
            </div>
            <div className="detail-row vertical">
              <span>Derivační cesta</span>
              <span className="mono">{inheritanceDetails.derivationPath}</span>
            </div>
            <div className="detail-row vertical">
              <span>Fingerprint uživatele</span>
              <span className="mono">{inheritanceDetails.userFingerprint}</span>
            </div>
            <div className="detail-row vertical">
              <span>Fingerprint dědice</span>
              <span className="mono">{inheritanceDetails.heirFingerprint}</span>
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
        <h3>Kontrola adres (prvních 10)</h3>
        {isLoading && <div className="detail-loading">Načítání adres...</div>}
        {!isLoading && (
          <div className="address-audit-grid">
            {renderAddressAuditList("Receive adresy", receiveAddresses)}
            {renderAddressAuditList("Change adresy", changeAddresses)}
          </div>
        )}
      </div>
    </div>
  );
}
