import { HDKey } from "@scure/bip32";
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";
import * as ecc from "tiny-secp256k1";
import { DEFAULT_INHERITANCE_CONDITIONS, TAPROOT_PATH } from "../constants";
import type {
  Account,
  AccountAddressAuditEntry,
  DerivedAddress,
  HeirContact,
  InheritanceAccountDetails,
  SpendingConditions,
  StandardAccountDetails,
  Transaction,
  Wallet,
} from "../types";
import {
  broadcastTransaction,
  getAddressBalance,
  getAddressFirstFundingBlockHeight,
  getAddressFundingStats,
  getAddressUTXOs,
  getCurrentBlockHeight,
  getTransactions,
} from "../utils/api";
import {
  deriveInheritanceAddressFromXpubs,
  deriveInheritanceDescriptorFromXpubs,
  deriveNostrIdentityFromMnemonic,
  deriveTaprootAddress,
  generateMnemonic,
  getActiveBitcoinNetwork,
  getMasterKeyFromMnemonic,
  normalizeExtendedPublicKey,
  validateMnemonic,
} from "../utils/bitcoin";
import { loadAccounts, saveAccounts, saveWallet } from "../utils/storage";

bitcoin.initEccLib(ecc);

const ADDRESS_AUDIT_LIMIT = 10;
const HARDCODED_SERVER_MNEMONIC =
  "criminal senior academic academic alto sled saver seafood screw beam gather stilt clock flavor pencil divorce civil loan training ranked";

let serverIdentityPromise: Promise<{
  fingerprint: string;
  xpub: string;
  derivationPath: string;
  masterKey: Awaited<ReturnType<typeof getMasterKeyFromMnemonic>>;
}> | null = null;

async function getServerIdentity(): Promise<{
  fingerprint: string;
  xpub: string;
  derivationPath: string;
  masterKey: Awaited<ReturnType<typeof getMasterKeyFromMnemonic>>;
}> {
  if (!serverIdentityPromise) {
    serverIdentityPromise = getMasterKeyFromMnemonic(HARDCODED_SERVER_MNEMONIC)
      .then((masterKey) => {
        const identity = deriveLocalIdentity(masterKey);
        return {
          fingerprint: identity.fingerprint,
          xpub: identity.xpub,
          derivationPath: identity.derivationPath,
          masterKey,
        };
      })
      .catch((error) => {
        serverIdentityPromise = null;
        throw error;
      });
  }

  return serverIdentityPromise;
}

function formatFingerprint(fingerprint: number): string {
  return (fingerprint >>> 0).toString(16).padStart(8, "0");
}

function deriveLocalIdentity(
  masterKey: Awaited<ReturnType<typeof getMasterKeyFromMnemonic>>,
): {
  fingerprint: string;
  xpub: string;
  derivationPath: string;
} {
  const derivationPath = `${TAPROOT_PATH}/0'`;
  const identityKey = masterKey.derive(derivationPath);

  if (!identityKey.publicExtendedKey) {
    throw new Error("Nepodařilo se vytvořit lokální tpub");
  }

  return {
    fingerprint: formatFingerprint(masterKey.fingerprint),
    xpub: identityKey.publicExtendedKey,
    derivationPath,
  };
}

function deterministicInheritanceId(
  fingerprintA: string,
  xpubA: string,
  fingerprintB: string,
  xpubB: string,
): string {
  const seed = [`${fingerprintA}:${xpubA}`, `${fingerprintB}:${xpubB}`]
    .sort()
    .join("|");
  return `inheritance-${hashStringToUint32(seed).toString(16).padStart(8, "0")}`;
}

function hashStringToUint32(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function deterministicBranchFromId(accountId: string): number {
  return (hashStringToUint32(accountId) % 2147483646) + 1;
}

function generateInheritanceAccountId(): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  return `inheritance-${randomPart}`;
}

function getFundingBranch(
  account: Pick<Account, "id" | "fundingBranch">,
): number {
  return account.fundingBranch ?? deterministicBranchFromId(account.id);
}

const INHERITANCE_SHARE_PREFIX = "INHERITANCE_ACCOUNT:";

type InheritanceAccountSharePayload = {
  type: "inheritance-account";
  sharedAccountId?: string;
  accountName: string;
  participants: {
    user: {
      fingerprint: string;
      xpub: string;
    };
    heir: {
      fingerprint: string;
      xpub: string;
    };
  };
  spendingConditions?: SpendingConditions;
  version?: 1 | 2;
  sharedByRole?: "user" | "heir";
  sharedBy?: {
    fingerprint: string;
    xpub: string;
  };
};

const MAINNET_BIP32 = {
  private: 0x0488ade4,
  public: 0x0488b21e,
};

function parseExtendedKeyForComparison(extendedKey: string): HDKey {
  const normalized = normalizeExtendedKey(extendedKey);
  const activeBip32 = getActiveBitcoinNetwork().bip32;

  if (normalized.startsWith("tpub") || normalized.startsWith("tprv")) {
    return HDKey.fromExtendedKey(normalized, activeBip32);
  }

  if (normalized.startsWith("xpub") || normalized.startsWith("xprv")) {
    return HDKey.fromExtendedKey(normalized, MAINNET_BIP32);
  }

  try {
    return HDKey.fromExtendedKey(normalized, activeBip32);
  } catch {
    return HDKey.fromExtendedKey(normalized, MAINNET_BIP32);
  }
}

function areSameExtendedPublicNode(a: string, b: string): boolean {
  const keyA = parseExtendedKeyForComparison(a);
  const keyB = parseExtendedKeyForComparison(b);

  if (
    !keyA.publicKey ||
    !keyB.publicKey ||
    !keyA.chainCode ||
    !keyB.chainCode
  ) {
    return false;
  }

  return (
    Buffer.from(keyA.publicKey).equals(Buffer.from(keyB.publicKey)) &&
    Buffer.from(keyA.chainCode).equals(Buffer.from(keyB.chainCode)) &&
    keyA.depth === keyB.depth &&
    keyA.index === keyB.index
  );
}

export async function getWalletFingerprint(mnemonic: string): Promise<string> {
  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  return formatFingerprint(masterKey.fingerprint);
}

export async function getNostrIdentity(mnemonic: string): Promise<{
  derivationPath: string;
  nsec: string;
  npub: string;
}> {
  return deriveNostrIdentityFromMnemonic(mnemonic);
}

export async function getLocalInheritanceIdentity(mnemonic: string): Promise<{
  fingerprint: string;
  tpub: string;
  derivationPath: string;
}> {
  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const identity = deriveLocalIdentity(masterKey);

  return {
    fingerprint: identity.fingerprint,
    tpub: identity.xpub,
    derivationPath: identity.derivationPath,
  };
}

function normalizeFingerprint(fingerprint: string): string {
  return fingerprint.trim().toLowerCase().replace(/^0x/, "").padStart(8, "0");
}

function normalizeExtendedKey(extendedKey: string): string {
  return extendedKey.replace(/\s+/g, "").trim();
}

function normalizeCounterpartyContact(counterparty: HeirContact): {
  fingerprint: string;
  xpub: string;
} {
  const normalizedFingerprint = normalizeFingerprint(counterparty.fingerprint);
  if (!/^[0-9a-f]{8}$/i.test(normalizedFingerprint)) {
    throw new Error("Fingerprint protistrany musí mít 8 hex znaků");
  }

  const normalizedXpubInput = normalizeExtendedKey(counterparty.xpub);
  if (!normalizedXpubInput) {
    throw new Error("tpub/xpub protistrany je prázdný");
  }

  try {
    return {
      fingerprint: normalizedFingerprint,
      xpub: normalizeExtendedPublicKey(normalizedXpubInput),
    };
  } catch (error) {
    const reason = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(`Neplatný xpub/tpub protistrany${reason}`);
  }
}

function resolveInheritanceParticipants(
  account: Account,
  identity: { fingerprint: string; xpub: string; derivationPath: string },
): {
  localRole: "user" | "heir";
  localXpub: string;
  counterpartyXpub: string;
  userFingerprint: string;
  userXpub: string;
  heirFingerprint: string;
  heirXpub: string;
} {
  const localRole = account.localRole || "user";
  const localFingerprint = account.localFingerprint || identity.fingerprint;
  const localXpub = account.localXpub || identity.xpub;
  const counterpartyFingerprint =
    account.counterpartyFingerprint || account.heirFingerprint || "";
  const counterpartyXpub = account.counterpartyXpub || account.heirXpub || "";

  const userFingerprint =
    localRole === "user" ? localFingerprint : counterpartyFingerprint;
  const userXpub = localRole === "user" ? localXpub : counterpartyXpub;
  const heirFingerprint =
    localRole === "heir" ? localFingerprint : counterpartyFingerprint;
  const heirXpub = localRole === "heir" ? localXpub : counterpartyXpub;

  return {
    localRole,
    localXpub,
    counterpartyXpub,
    userFingerprint,
    userXpub,
    heirFingerprint,
    heirXpub,
  };
}

function resolveInheritanceParticipantsFromInputs(
  localRole: "user" | "heir",
  localFingerprint: string,
  localXpub: string,
  counterpartyFingerprint: string,
  counterpartyXpub: string,
): {
  userFingerprint: string;
  userXpub: string;
  heirFingerprint: string;
  heirXpub: string;
} {
  return {
    userFingerprint:
      localRole === "user" ? localFingerprint : counterpartyFingerprint,
    userXpub: localRole === "user" ? localXpub : counterpartyXpub,
    heirFingerprint:
      localRole === "heir" ? localFingerprint : counterpartyFingerprint,
    heirXpub: localRole === "heir" ? localXpub : counterpartyXpub,
  };
}

function isFundingAddress(address: DerivedAddress): boolean {
  return address.role === "funding";
}

function isActiveInheritanceAddress(address: DerivedAddress): boolean {
  return address.role !== "funding";
}

export function isInheritanceAccountActivated(account: Account): boolean {
  if (account.type !== "inheritance") {
    return false;
  }

  if (account.inheritanceActivated) {
    return true;
  }

  return account.derivedAddresses.some(
    (address) =>
      (address.role === "active" || address.role === undefined) &&
      (address.used || (address.balance || 0) > 0),
  );
}

async function getAccountTransactions(
  account: Account,
): Promise<Transaction[]> {
  const accountAddressSet = new Set(
    account.derivedAddresses.map((derivedAddress) => derivedAddress.address),
  );
  const txById = new Map<string, Transaction>();
  for (const derivedAddress of account.derivedAddresses) {
    const transactions = await getTransactions(
      derivedAddress.address,
      accountAddressSet,
    );
    for (const tx of transactions) {
      if (!txById.has(tx.txid)) {
        txById.set(tx.txid, tx);
      }
    }
  }

  return Array.from(txById.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);
}

async function buildAddressAuditEntries(
  addresses: Array<{ index: number; address: string }>,
): Promise<AccountAddressAuditEntry[]> {
  const audits = await Promise.all(
    addresses.map(async ({ index, address }) => {
      const [stats, utxos] = await Promise.all([
        getAddressFundingStats(address),
        getAddressUTXOs(address),
      ]);
      const utxoBalance = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

      return {
        index,
        address,
        totalReceived: stats.funded,
        currentBalance: Math.max(stats.balance, utxoBalance, 0),
        hasUnspent: utxoBalance > 0,
      };
    }),
  );

  return audits;
}

function buildStandardAuditAddressSet(
  masterKey: Awaited<ReturnType<typeof getMasterKeyFromMnemonic>>,
  accountIndex: number,
): {
  receive: Array<{ index: number; address: string }>;
  change: Array<{ index: number; address: string }>;
} {
  return {
    receive: Array.from({ length: ADDRESS_AUDIT_LIMIT }, (_, index) => ({
      index,
      address: deriveTaprootAddress(masterKey, accountIndex, index, 0),
    })),
    change: Array.from({ length: ADDRESS_AUDIT_LIMIT }, (_, index) => ({
      index,
      address: deriveTaprootAddress(masterKey, accountIndex, index, 1),
    })),
  };
}

function buildInheritanceAuditAddressSet(
  localXpub: string,
  counterpartyXpub: string,
): {
  receive: Array<{ index: number; address: string }>;
  change: Array<{ index: number; address: string }>;
} {
  return {
    receive: Array.from({ length: ADDRESS_AUDIT_LIMIT }, (_, index) => ({
      index,
      address: deriveInheritanceAddressFromXpubs(
        localXpub,
        counterpartyXpub,
        index,
        0,
      ),
    })),
    change: Array.from({ length: ADDRESS_AUDIT_LIMIT }, (_, index) => ({
      index,
      address: deriveInheritanceAddressFromXpubs(
        localXpub,
        counterpartyXpub,
        index,
        1,
      ),
    })),
  };
}

export async function getStandardAccountDetails(
  mnemonic: string,
  account: Account,
): Promise<StandardAccountDetails | null> {
  if (account.type !== "standard") {
    return null;
  }

  const accounts = loadAccounts();
  const accountIndex = accounts.findIndex((a: Account) => a.id === account.id);
  if (accountIndex === -1) {
    throw new Error("Účet nebyl nalezen");
  }

  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const derivationPath = `${TAPROOT_PATH}/${accountIndex}'`;
  const accountKey = masterKey.derive(derivationPath);
  const auditAddressSet = buildStandardAuditAddressSet(masterKey, accountIndex);
  const [transactions, receiveAddresses, changeAddresses] = await Promise.all([
    getAccountTransactions(account),
    buildAddressAuditEntries(auditAddressSet.receive),
    buildAddressAuditEntries(auditAddressSet.change),
  ]);

  return {
    masterFingerprint: formatFingerprint(masterKey.fingerprint),
    accountXpub: accountKey.publicExtendedKey || "",
    derivationPath,
    transactions,
    receiveAddresses,
    changeAddresses,
  };
}

export async function getInheritanceAccountDetails(
  mnemonic: string,
  account: Account,
): Promise<InheritanceAccountDetails | null> {
  if (account.type !== "inheritance") {
    return null;
  }

  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const identity = deriveLocalIdentity(masterKey);
  const participants = resolveInheritanceParticipants(account, identity);

  const auditAddressSet = participants.counterpartyXpub
    ? buildInheritanceAuditAddressSet(
        participants.localXpub,
        participants.counterpartyXpub,
      )
    : { receive: [], change: [] };

  const [transactions, receiveAddresses, changeAddresses] = await Promise.all([
    getAccountTransactions(account),
    buildAddressAuditEntries(auditAddressSet.receive),
    buildAddressAuditEntries(auditAddressSet.change),
  ]);

  return {
    localRole: participants.localRole,
    userFingerprint: participants.userFingerprint,
    userXpub: participants.userXpub,
    heirFingerprint: participants.heirFingerprint,
    heirXpub: participants.heirXpub,
    derivationPath: account.identityDerivationPath || identity.derivationPath,
    spendingConditions:
      account.spendingConditions || DEFAULT_INHERITANCE_CONDITIONS,
    transactions,
    receiveAddresses,
    changeAddresses,
  };
}

export async function createNewWallet(): Promise<Wallet> {
  const mnemonic = generateMnemonic();
  const wallet: Wallet = {
    mnemonic,
    createdAt: Date.now(),
  };
  saveWallet(wallet);

  // Create default standard account
  await createStandardAccount(wallet.mnemonic, "Můj účet");

  return wallet;
}

export async function restoreWallet(mnemonic: string): Promise<Wallet | null> {
  const isValid = validateMnemonic(mnemonic);
  if (!isValid) {
    return null;
  }

  const wallet: Wallet = {
    mnemonic,
    createdAt: Date.now(),
  };
  saveWallet(wallet);

  // Try to discover accounts with balance
  await discoverAccounts(wallet.mnemonic);

  // If no accounts found, create a default one
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    await createStandardAccount(wallet.mnemonic, "Můj účet");
  }

  return wallet;
}

export async function createStandardAccount(
  mnemonic: string,
  name: string,
): Promise<Account> {
  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const accounts = loadAccounts();
  const accountIndex = accounts.length;

  // Generate first address
  const address = deriveTaprootAddress(masterKey, accountIndex, 0);

  const account: Account = {
    id: `account-${Date.now()}`,
    name,
    type: "standard",
    balance: 0,
    addressIndex: 1, // Next address to use
    derivedAddresses: [
      {
        index: 0,
        address,
        change: false,
        used: false,
      },
    ],
  };

  accounts.push(account);
  saveAccounts(accounts);

  return account;
}

export async function createInheritanceAccount(
  mnemonic: string,
  name: string,
  counterparty: HeirContact,
  localRole: "user" | "heir" = "user",
  conditions: SpendingConditions = DEFAULT_INHERITANCE_CONDITIONS,
  accountIdOverride?: string,
): Promise<Account> {
  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const accounts = loadAccounts();
  const identity = deriveLocalIdentity(masterKey);
  const serverIdentity = await getServerIdentity();

  const normalizedCounterparty = normalizeCounterpartyContact(counterparty);

  const participantSet = resolveInheritanceParticipantsFromInputs(
    localRole,
    identity.fingerprint,
    identity.xpub,
    normalizedCounterparty.fingerprint,
    normalizedCounterparty.xpub,
  );

  const accountId = accountIdOverride || generateInheritanceAccountId();
  const fundingBranch = deterministicBranchFromId(accountId);

  let fundingAddress = "";
  let activeAddress = "";
  try {
    fundingAddress = deriveInheritanceAddressFromXpubs(
      participantSet.userXpub,
      serverIdentity.xpub,
      0,
      0,
      fundingBranch,
    );
    activeAddress = deriveInheritanceAddressFromXpubs(
      participantSet.userXpub,
      participantSet.heirXpub,
      0,
      0,
    );
  } catch (error) {
    const reason = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(`Neplatný xpub/tpub protistrany${reason}`);
  }

  const existing = accounts.find(
    (storedAccount) => storedAccount.id === accountId,
  );
  if (existing) {
    return existing;
  }

  const account: Account = {
    id: accountId,
    name,
    type: "inheritance",
    balance: 0,
    addressIndex: 1,
    derivedAddresses: [
      {
        index: 0,
        address: fundingAddress,
        change: false,
        used: false,
        role: "funding",
      },
      {
        index: 0,
        address: activeAddress,
        change: false,
        used: false,
        role: "active",
      },
    ],
    localRole,
    localFingerprint: identity.fingerprint,
    localXpub: identity.xpub,
    counterpartyFingerprint: normalizedCounterparty.fingerprint,
    counterpartyXpub: normalizedCounterparty.xpub,
    identityDerivationPath: identity.derivationPath,
    fundingBranch,
    heirFingerprint: normalizedCounterparty.fingerprint,
    heirXpub: normalizedCounterparty.xpub,
    heirName: counterparty.name,
    inheritanceActivated: false,
    spendingConditions: conditions,
    inheritanceStatus: {
      blocksSinceFunding: 0,
      canUserSpend: false,
      canHeirSpend: false,
      requiresMultisig: false,
    },
  };

  accounts.push(account);
  saveAccounts(accounts);

  return account;
}

export async function exportInheritanceAccountShare(
  mnemonic: string,
  account: Account,
): Promise<string> {
  if (account.type !== "inheritance") {
    throw new Error("Sdílení je dostupné pouze pro dědický účet");
  }

  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const identity = deriveLocalIdentity(masterKey);
  const participants = resolveInheritanceParticipants(account, identity);

  const payload: InheritanceAccountSharePayload = {
    type: "inheritance-account",
    sharedAccountId: account.id,
    accountName: account.name,
    participants: {
      user: {
        fingerprint: participants.userFingerprint,
        xpub: participants.userXpub,
      },
      heir: {
        fingerprint: participants.heirFingerprint,
        xpub: participants.heirXpub,
      },
    },
    spendingConditions: account.spendingConditions,
  };

  return `${INHERITANCE_SHARE_PREFIX}${JSON.stringify(payload)}`;
}

export async function importInheritanceAccountShare(
  mnemonic: string,
  rawShare: string,
): Promise<Account> {
  const trimmed = rawShare.trim();
  if (!trimmed) {
    throw new Error("Sdílená data účtu jsou prázdná");
  }

  const jsonPayload = trimmed.startsWith(INHERITANCE_SHARE_PREFIX)
    ? trimmed.slice(INHERITANCE_SHARE_PREFIX.length)
    : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonPayload);
  } catch {
    throw new Error("Neplatný formát sdílených dat účtu");
  }

  const payload = parsed as Partial<InheritanceAccountSharePayload>;

  if (payload.type !== "inheritance-account") {
    throw new Error("Neznámý formát sdíleného účtu");
  }

  const accountName =
    typeof payload.accountName === "string" && payload.accountName.trim()
      ? payload.accountName.trim()
      : "Dědický účet";

  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const identity = deriveLocalIdentity(masterKey);
  const normalizedLocalFingerprint = normalizeFingerprint(identity.fingerprint);
  const normalizedLocalXpub = normalizeExtendedKey(identity.xpub);

  const participants = payload.participants;
  let localRole: "user" | "heir";
  let counterparty: HeirContact;
  let accountIdOverride =
    typeof payload.sharedAccountId === "string" && payload.sharedAccountId
      ? payload.sharedAccountId.trim()
      : "";

  if (participants && participants.user && participants.heir) {
    const normalizedUserFingerprint = normalizeFingerprint(
      participants.user.fingerprint,
    );
    const normalizedUserXpub = normalizeExtendedKey(participants.user.xpub);
    const normalizedHeirFingerprint = normalizeFingerprint(
      participants.heir.fingerprint,
    );
    const normalizedHeirXpub = normalizeExtendedKey(participants.heir.xpub);

    const isLocalUser =
      areSameExtendedPublicNode(normalizedLocalXpub, normalizedUserXpub) ||
      normalizedLocalFingerprint === normalizedUserFingerprint;
    const isLocalHeir =
      areSameExtendedPublicNode(normalizedLocalXpub, normalizedHeirXpub) ||
      normalizedLocalFingerprint === normalizedHeirFingerprint;

    if (!isLocalUser && !isLocalHeir) {
      throw new Error(
        "Tento sdílený účet nepatří této peněžence (neodpovídá user ani heir identita)",
      );
    }

    if (isLocalUser) {
      localRole = "user";
      counterparty = {
        id: `import-${Date.now()}`,
        name: "Dědic",
        fingerprint: participants.heir.fingerprint,
        xpub: participants.heir.xpub,
      };
    } else {
      localRole = "heir";
      counterparty = {
        id: `import-${Date.now()}`,
        name: "Uživatel",
        fingerprint: participants.user.fingerprint,
        xpub: participants.user.xpub,
      };
    }

    if (!accountIdOverride) {
      accountIdOverride = deterministicInheritanceId(
        participants.user.fingerprint,
        participants.user.xpub,
        participants.heir.fingerprint,
        participants.heir.xpub,
      );
    }
  } else {
    const sharedByRole = payload.sharedByRole;
    if (sharedByRole !== "user" && sharedByRole !== "heir") {
      throw new Error("Sdílený účet neobsahuje platnou roli");
    }

    const sharedBy = payload.sharedBy;
    if (
      !sharedBy ||
      typeof sharedBy.fingerprint !== "string" ||
      typeof sharedBy.xpub !== "string"
    ) {
      throw new Error("Sdílený účet neobsahuje platné údaje protistrany");
    }

    counterparty = {
      id: `import-${Date.now()}`,
      name: sharedByRole === "user" ? "Uživatel" : "Dědic",
      fingerprint: sharedBy.fingerprint,
      xpub: sharedBy.xpub,
    };

    localRole = sharedByRole === "user" ? "heir" : "user";

    if (!accountIdOverride) {
      accountIdOverride = deterministicInheritanceId(
        identity.fingerprint,
        identity.xpub,
        sharedBy.fingerprint,
        sharedBy.xpub,
      );
    }
  }

  const spendingConditions = payload.spendingConditions;
  return createInheritanceAccount(
    mnemonic,
    accountName,
    counterparty,
    localRole,
    spendingConditions,
    accountIdOverride || undefined,
  );
}

export function renameAccount(accountId: string, newName: string): Account {
  const normalizedName = newName.trim();
  if (!normalizedName) {
    throw new Error("Název účtu nemůže být prázdný");
  }

  const accounts = loadAccounts();
  const accountIndex = accounts.findIndex((item) => item.id === accountId);
  if (accountIndex === -1) {
    throw new Error("Účet nebyl nalezen");
  }

  const updatedAccount: Account = {
    ...accounts[accountIndex],
    name: normalizedName,
  };

  accounts[accountIndex] = updatedAccount;
  saveAccounts(accounts);

  return updatedAccount;
}

export function deleteAccount(accountId: string): void {
  const accounts = loadAccounts();
  const nextAccounts = accounts.filter((item) => item.id !== accountId);

  if (nextAccounts.length === accounts.length) {
    throw new Error("Účet nebyl nalezen");
  }

  saveAccounts(nextAccounts);
}

export async function updateAccountBalance(
  account: Account,
  mnemonic: string,
): Promise<Account> {
  const accounts = loadAccounts();
  const accountIndex = accounts.findIndex((a: Account) => a.id === account.id);
  if (accountIndex === -1) {
    return account;
  }

  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const serverIdentity = await getServerIdentity();
  const knownByAddress = new Map(
    account.derivedAddresses.map((addr) => [addr.address, addr] as const),
  );

  const candidates: DerivedAddress[] = [...account.derivedAddresses];
  let expectedFundingAddresses: Set<string> | null = null;
  const addCandidate = (candidate: DerivedAddress) => {
    if (!knownByAddress.has(candidate.address)) {
      knownByAddress.set(candidate.address, candidate);
      candidates.push(candidate);
    }
  };

  if (account.type === "standard") {
    for (let index = 0; index < ADDRESS_AUDIT_LIMIT; index++) {
      addCandidate({
        index,
        address: deriveTaprootAddress(masterKey, accountIndex, index, 0),
        change: false,
        used: false,
      });
      addCandidate({
        index,
        address: deriveTaprootAddress(masterKey, accountIndex, index, 1),
        change: true,
        used: false,
      });
    }
  } else {
    const identity = deriveLocalIdentity(masterKey);
    const participants = resolveInheritanceParticipants(account, identity);
    const fundingBranch = getFundingBranch(account);
    expectedFundingAddresses = new Set();

    if (participants.heirXpub) {
      for (let index = 0; index < ADDRESS_AUDIT_LIMIT; index++) {
        const receiveFundingAddress = deriveInheritanceAddressFromXpubs(
          participants.userXpub,
          serverIdentity.xpub,
          index,
          0,
          fundingBranch,
        );
        const changeFundingAddress = deriveInheritanceAddressFromXpubs(
          participants.userXpub,
          serverIdentity.xpub,
          index,
          1,
          fundingBranch,
        );
        expectedFundingAddresses.add(receiveFundingAddress);
        expectedFundingAddresses.add(changeFundingAddress);

        addCandidate({
          index,
          address: receiveFundingAddress,
          change: false,
          used: false,
          role: "funding",
        });
        addCandidate({
          index,
          address: changeFundingAddress,
          change: true,
          used: false,
          role: "funding",
        });
        addCandidate({
          index,
          address: deriveInheritanceAddressFromXpubs(
            participants.userXpub,
            participants.heirXpub,
            index,
            0,
          ),
          change: false,
          used: false,
          role: "active",
        });
        addCandidate({
          index,
          address: deriveInheritanceAddressFromXpubs(
            participants.userXpub,
            participants.heirXpub,
            index,
            1,
          ),
          change: true,
          used: false,
          role: "active",
        });
      }
    }
  }

  let totalBalance = 0;
  const updatedAddresses: DerivedAddress[] = [];

  for (const addr of candidates) {
    const stats = await getAddressFundingStats(addr.address);
    const balance = Math.max(stats.balance, 0);
    const hadAddress = account.derivedAddresses.some(
      (known) => known.address === addr.address,
    );
    const hasActivity = stats.funded > 0 || addr.used;

    const isUnexpectedUnusedLegacyFundingAddress =
      account.type === "inheritance" &&
      addr.role === "funding" &&
      expectedFundingAddresses !== null &&
      !expectedFundingAddresses.has(addr.address) &&
      !hasActivity;

    if (isUnexpectedUnusedLegacyFundingAddress) {
      continue;
    }

    if (!hadAddress && !hasActivity) {
      continue;
    }

    totalBalance += balance;
    updatedAddresses.push({
      ...addr,
      balance,
      used: hasActivity,
    });
  }

  updatedAddresses.sort((a, b) => {
    const changeA = a.change ? 1 : 0;
    const changeB = b.change ? 1 : 0;
    if (changeA !== changeB) return changeA - changeB;
    return a.index - b.index;
  });

  const maxReceiveIndex = updatedAddresses
    .filter((addr) => !addr.change)
    .reduce((max, addr) => Math.max(max, addr.index), -1);

  const updatedAccount = {
    ...account,
    balance: totalBalance,
    addressIndex: Math.max(account.addressIndex, maxReceiveIndex + 1),
    derivedAddresses: updatedAddresses,
  };

  if (account.type === "inheritance") {
    const hasActiveHistory = updatedAddresses.some(
      (address) =>
        (address.role === "active" || address.role === undefined) &&
        (address.used || (address.balance || 0) > 0),
    );
    updatedAccount.inheritanceActivated =
      Boolean(account.inheritanceActivated) || hasActiveHistory;
    updatedAccount.fundingBranch = getFundingBranch(account);
  }

  // Update inheritance status if needed
  if (account.type === "inheritance" && account.spendingConditions) {
    updatedAccount.inheritanceStatus = await calculateInheritanceStatus(
      account.spendingConditions,
      updatedAddresses.filter(isActiveInheritanceAddress),
    );
  }

  // Save updated account
  accounts[accountIndex] = updatedAccount;
  saveAccounts(accounts);

  return updatedAccount;
}

async function calculateInheritanceStatus(
  conditions: SpendingConditions,
  addresses: DerivedAddress[],
): Promise<Account["inheritanceStatus"]> {
  const fundedAddresses = addresses.filter((address) => address.used);

  let blocksSinceFunding = 0;
  if (fundedAddresses.length > 0) {
    const [tipHeight, fundingHeights] = await Promise.all([
      getCurrentBlockHeight(),
      Promise.all(
        fundedAddresses.map((address) =>
          getAddressFirstFundingBlockHeight(address.address),
        ),
      ),
    ]);

    const validFundingHeights = fundingHeights.filter(
      (height): height is number => height !== null,
    );
    const firstFundingHeight =
      validFundingHeights.length > 0 ? Math.min(...validFundingHeights) : null;

    if (tipHeight !== null && firstFundingHeight !== null) {
      blocksSinceFunding = Math.max(0, tipHeight - firstFundingHeight);
    }
  }

  return {
    blocksSinceFunding,
    canUserSpend: blocksSinceFunding >= conditions.userOnlyAfterBlocks,
    canHeirSpend: blocksSinceFunding >= conditions.heirOnlyAfterBlocks,
    requiresMultisig:
      blocksSinceFunding >= conditions.multisigAfterBlocks &&
      blocksSinceFunding < conditions.userOnlyAfterBlocks,
  };
}

async function discoverAccounts(mnemonic: string): Promise<void> {
  // Simple discovery - check first few accounts for balance
  const masterKey = await getMasterKeyFromMnemonic(mnemonic);

  for (let i = 0; i < 5; i++) {
    const address = deriveTaprootAddress(masterKey, i, 0);
    const balance = await getAddressBalance(address);

    if (balance > 0) {
      // Account has balance, create it
      await createStandardAccount(mnemonic, `Účet ${i + 1}`);
    }
  }
}

export function getNextUnusedAddress(account: Account): DerivedAddress | null {
  if (
    account.type === "inheritance" &&
    isInheritanceAccountActivated(account)
  ) {
    return null;
  }

  const unused =
    account.type === "inheritance"
      ? account.derivedAddresses.find(
          (address) =>
            !address.change && !address.used && isFundingAddress(address),
        )
      : account.derivedAddresses.find(
          (address) => !address.change && !address.used,
        );
  if (unused) return unused;
  return null;
}

export async function generateNewAddress(
  mnemonic: string,
  account: Account,
): Promise<DerivedAddress> {
  if (
    account.type === "inheritance" &&
    isInheritanceAccountActivated(account)
  ) {
    throw new Error(
      "Dědický účet je aktivovaný, další funding adresy už nelze generovat",
    );
  }

  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const serverIdentity = await getServerIdentity();
  const accounts = loadAccounts();
  const accountIndex = accounts.findIndex((a: Account) => a.id === account.id);

  const newIndex =
    account.type === "inheritance"
      ? account.derivedAddresses.filter(
          (address: DerivedAddress) =>
            !address.change && isFundingAddress(address),
        ).length
      : account.derivedAddresses.filter(
          (address: DerivedAddress) => !address.change,
        ).length;
  const localIdentity = deriveLocalIdentity(masterKey);
  const participants = resolveInheritanceParticipants(account, localIdentity);
  const fundingBranch = getFundingBranch(account);
  const address =
    account.type === "inheritance" && participants.heirXpub
      ? deriveInheritanceAddressFromXpubs(
          participants.userXpub,
          serverIdentity.xpub,
          newIndex,
          0,
          fundingBranch,
        )
      : deriveTaprootAddress(masterKey, accountIndex, newIndex);

  const newAddress: DerivedAddress = {
    index: newIndex,
    address,
    change: false,
    used: false,
    role: account.type === "inheritance" ? "funding" : undefined,
  };

  account.derivedAddresses.push(newAddress);
  account.addressIndex = newIndex + 1;

  accounts[accountIndex] = account;
  saveAccounts(accounts);

  return newAddress;
}

interface SpendableUtxo {
  txid: string;
  vout: number;
  value: number;
  address: string;
  addressIndex: number;
  change: 0 | 1;
}

type TaprootSigner = {
  publicKey: Buffer;
  sign: (hash: Buffer) => Buffer;
  signSchnorr: (hash: Buffer) => Buffer;
};

type EcdsaSigner = {
  publicKey: Buffer;
  sign: (hash: Buffer) => Buffer;
};

export interface InheritancePartialTransactionResult {
  psbt: string;
  fee: number;
  changeAmount: number;
  changeAddress: string;
}

function estimateTaprootFee(
  inputCount: number,
  outputCount: number,
  feeRate: number,
): number {
  const estimatedVbytes = 10 + inputCount * 58 + outputCount * 43;
  return Math.ceil(estimatedVbytes * feeRate);
}

function estimateInheritanceMultisigFee(
  inputCount: number,
  outputCount: number,
  feeRate: number,
): number {
  const estimatedVbytes = 12 + inputCount * 110 + outputCount * 43;
  return Math.ceil(estimatedVbytes * feeRate);
}

function toXOnly(pubKey: Buffer): Buffer {
  return pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);
}

function createTweakedSigner(privateKey: Buffer): TaprootSigner {
  let key = Buffer.from(privateKey);
  const originalPub = ecc.pointFromScalar(key, true);
  if (!originalPub) {
    throw new Error("Invalid private key");
  }

  if (originalPub[0] === 3) {
    const negated = ecc.privateNegate(key);
    if (!negated) {
      throw new Error("Failed to negate private key");
    }
    key = Buffer.from(negated);
  }

  const tweak = bitcoin.crypto.taggedHash(
    "TapTweak",
    toXOnly(Buffer.from(originalPub)),
  );
  const tweakedPrivateKey = ecc.privateAdd(key, tweak);
  if (!tweakedPrivateKey) {
    throw new Error("Failed to tweak private key");
  }

  const tweakedPublicKey = ecc.pointFromScalar(tweakedPrivateKey, true);
  if (!tweakedPublicKey) {
    throw new Error("Failed to derive tweaked public key");
  }

  return {
    publicKey: Buffer.from(tweakedPublicKey),
    sign: (hash: Buffer): Buffer =>
      Buffer.from(ecc.sign(hash, tweakedPrivateKey)),
    signSchnorr: (hash: Buffer): Buffer =>
      Buffer.from(ecc.signSchnorr(hash, tweakedPrivateKey)),
  };
}

function createEcdsaSigner(privateKey: Buffer): EcdsaSigner {
  const key = Buffer.from(privateKey);
  const publicKey = ecc.pointFromScalar(key, true);
  if (!publicKey) {
    throw new Error("Invalid private key");
  }

  return {
    publicKey: Buffer.from(publicKey),
    sign: (hash: Buffer): Buffer => Buffer.from(ecc.sign(hash, key)),
  };
}

function getPrimaryStandardChangeAddress(
  accounts: Account[],
  masterKey: Awaited<ReturnType<typeof getMasterKeyFromMnemonic>>,
): string {
  const primaryAccount = accounts.find((item) => item.type === "standard");
  if (!primaryAccount) {
    throw new Error("Pro change je potřeba alespoň jeden standardní účet");
  }

  const primaryIndex = accounts.findIndex(
    (item) => item.id === primaryAccount.id,
  );
  if (primaryIndex === -1) {
    throw new Error("Hlavní účet nebyl nalezen");
  }

  const usedReceiveIndexes = primaryAccount.derivedAddresses
    .filter((address) => !address.change)
    .map((address) => address.index);
  const maxReceiveIndex =
    usedReceiveIndexes.length > 0 ? Math.max(...usedReceiveIndexes) : -1;
  const nextReceiveIndex = Math.max(
    primaryAccount.addressIndex,
    maxReceiveIndex + 1,
  );

  const changeAddress = deriveTaprootAddress(
    masterKey,
    primaryIndex,
    nextReceiveIndex,
    0,
  );

  const existing = primaryAccount.derivedAddresses.find(
    (address) => address.address === changeAddress,
  );
  if (!existing) {
    primaryAccount.derivedAddresses.push({
      index: nextReceiveIndex,
      address: changeAddress,
      change: false,
      used: true,
      balance: 0,
    });
  } else {
    existing.used = true;
  }

  primaryAccount.addressIndex = Math.max(
    primaryAccount.addressIndex,
    nextReceiveIndex + 1,
  );

  return changeAddress;
}

function getInheritanceLocalBasePath(
  account: Account,
  identityDerivationPath: string,
): string {
  return account.identityDerivationPath || identityDerivationPath;
}

function collectInheritanceUtxos(
  account: Account,
  allowedRole: "funding" | "active",
  includeLegacyWithoutRole = false,
): Promise<SpendableUtxo[]> {
  return (async () => {
    const allUtxos: SpendableUtxo[] = [];

    const sourceAddresses = account.derivedAddresses.filter((address) => {
      if (allowedRole === "funding") {
        return address.role === "funding";
      }
      if (includeLegacyWithoutRole) {
        return address.role === "active" || address.role === undefined;
      }
      return address.role === "active";
    });

    for (const derivedAddress of sourceAddresses) {
      const utxos = await getAddressUTXOs(derivedAddress.address);
      const change = derivedAddress.change ? 1 : 0;
      for (const utxo of utxos) {
        allUtxos.push({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
          address: derivedAddress.address,
          addressIndex: derivedAddress.index,
          change,
        });
      }
    }

    return allUtxos;
  })();
}

function ensureInheritanceActiveAddress(
  account: Account,
  participants: ReturnType<typeof resolveInheritanceParticipants>,
): DerivedAddress {
  const usedActiveIndexes = account.derivedAddresses
    .filter((address) => address.role === "active" && !address.change)
    .map((address) => address.index);
  const nextActiveIndex =
    usedActiveIndexes.length > 0 ? Math.max(...usedActiveIndexes) + 1 : 0;

  const destinationAddress = deriveInheritanceAddressFromXpubs(
    participants.userXpub,
    participants.heirXpub,
    nextActiveIndex,
    0,
  );

  const existing = account.derivedAddresses.find(
    (address) => address.address === destinationAddress,
  );
  if (existing) {
    existing.role = "active";
    existing.used = true;
    return existing;
  }

  const created: DerivedAddress = {
    index: nextActiveIndex,
    address: destinationAddress,
    change: false,
    used: true,
    balance: 0,
    role: "active",
  };

  account.derivedAddresses.push(created);
  account.addressIndex = Math.max(account.addressIndex, nextActiveIndex + 1);
  return created;
}

function getTxInputTxid(psbt: bitcoin.Psbt, inputIndex: number): string {
  return Buffer.from(psbt.txInputs[inputIndex].hash).reverse().toString("hex");
}

function deriveTaprootPaymentForPath(
  masterKey: Awaited<ReturnType<typeof getMasterKeyFromMnemonic>>,
  derivationPath: string,
  network: bitcoin.Network,
): { address: string; internalPubkey: Buffer } {
  const child = masterKey.derive(derivationPath);
  if (!child.publicKey) {
    throw new Error("Nepodařilo se odvodit veřejný klíč pro vstup");
  }

  const internalPubkey = Buffer.from(child.publicKey).slice(1, 33);
  const payment = bitcoin.payments.p2tr({
    internalPubkey,
    network,
  });

  if (!payment.address) {
    throw new Error("Nepodařilo se odvodit Taproot adresu z cesty");
  }

  return {
    address: payment.address,
    internalPubkey,
  };
}

function resolveTaprootUtxoPath(
  masterKey: Awaited<ReturnType<typeof getMasterKeyFromMnemonic>>,
  accountIndex: number,
  knownAccountCount: number,
  account: Account,
  utxo: SpendableUtxo,
  network: bitcoin.Network,
): {
  accountIndex: number;
  addressIndex: number;
  change: 0 | 1;
  derivationPath: string;
  internalPubkey: Buffer;
} {
  const candidates: Array<{ addressIndex: number; change: 0 | 1 }> = [];

  const addCandidate = (addressIndex: number, change: 0 | 1) => {
    if (
      !candidates.some(
        (candidate) =>
          candidate.addressIndex === addressIndex &&
          candidate.change === change,
      )
    ) {
      candidates.push({ addressIndex, change });
    }
  };

  const knownAddress = account.derivedAddresses.find(
    (derivedAddress) => derivedAddress.address === utxo.address,
  );

  if (knownAddress) {
    if (knownAddress.change === undefined) {
      addCandidate(knownAddress.index, 0);
      addCandidate(knownAddress.index, 1);
    } else {
      addCandidate(knownAddress.index, knownAddress.change ? 1 : 0);
    }
  }

  addCandidate(utxo.addressIndex, utxo.change);
  addCandidate(utxo.addressIndex, utxo.change === 0 ? 1 : 0);

  const maxKnownIndex = Math.max(
    0,
    ...account.derivedAddresses.map((address) => address.index),
    account.addressIndex,
    utxo.addressIndex,
  );
  const broadIndexLimit = Math.max(maxKnownIndex + 50, 200);
  for (let addressIndex = 0; addressIndex <= broadIndexLimit; addressIndex++) {
    addCandidate(addressIndex, 0);
    addCandidate(addressIndex, 1);
  }

  const accountIndexes = [accountIndex];
  const scanLimit = Math.max(knownAccountCount + 20, accountIndex + 1);
  for (let index = 0; index < scanLimit; index++) {
    if (index !== accountIndex) {
      accountIndexes.push(index);
    }
  }

  for (const candidateAccountIndex of accountIndexes) {
    for (const candidate of candidates) {
      const pathVariants = [
        `${TAPROOT_PATH}/${candidateAccountIndex}'/${candidate.change}/${candidate.addressIndex}`,
        `${TAPROOT_PATH}/${candidateAccountIndex}/${candidate.change}/${candidate.addressIndex}`,
        `${TAPROOT_PATH}/${candidateAccountIndex}'/${candidate.addressIndex}/${candidate.change}`,
      ];

      for (const derivationPath of pathVariants) {
        try {
          const payment = deriveTaprootPaymentForPath(
            masterKey,
            derivationPath,
            network,
          );
          if (payment.address === utxo.address) {
            return {
              accountIndex: candidateAccountIndex,
              ...candidate,
              derivationPath,
              internalPubkey: payment.internalPubkey,
            };
          }
        } catch {
          continue;
        }
      }
    }
  }

  throw new Error(
    `Nelze určit odvozovací cestu pro UTXO adresu ${utxo.address}`,
  );
}

export async function createInheritancePartiallySignedTransaction(
  mnemonic: string,
  account: Account,
  recipientAddress: string,
  amountSats: number,
  feeRate: number,
): Promise<InheritancePartialTransactionResult> {
  if (account.type !== "inheritance") {
    throw new Error("Tato funkce je pouze pro dědický účet");
  }

  const network = getActiveBitcoinNetwork();
  const accounts = loadAccounts();
  const accountIndex = accounts.findIndex((item) => item.id === account.id);
  if (accountIndex === -1) {
    throw new Error("Účet nebyl nalezen");
  }

  const accountRef = accounts[accountIndex];
  if (!isInheritanceAccountActivated(accountRef)) {
    throw new Error("Účet není aktivovaný. Nejprve aktivujte prostředky.");
  }

  const status = accountRef.inheritanceStatus;
  if (!status || !status.requiresMultisig) {
    throw new Error("Společné utrácení zatím není dostupné");
  }

  if (!Number.isInteger(amountSats) || amountSats <= 0) {
    throw new Error("Neplatná částka v satech");
  }

  if (!Number.isFinite(feeRate) || feeRate <= 0) {
    throw new Error("Neplatný fee rate");
  }

  try {
    bitcoin.address.toOutputScript(recipientAddress, network);
  } catch {
    throw new Error("Neplatná adresa příjemce pro aktivní síť");
  }

  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const identity = deriveLocalIdentity(masterKey);
  const participants = resolveInheritanceParticipants(accountRef, identity);

  if (!participants.counterpartyXpub) {
    throw new Error("Chybí xpub protistrany");
  }

  const allUtxos = await collectInheritanceUtxos(accountRef, "active", true);

  if (allUtxos.length === 0) {
    throw new Error("Žádné UTXO k utracení");
  }

  allUtxos.sort((a, b) => b.value - a.value);

  const selected: SpendableUtxo[] = [];
  let selectedValue = 0;
  const dustLimit = 330;

  for (const utxo of allUtxos) {
    selected.push(utxo);
    selectedValue += utxo.value;

    const feeWithChange = estimateInheritanceMultisigFee(
      selected.length,
      2,
      feeRate,
    );
    if (selectedValue >= amountSats + feeWithChange) {
      break;
    }

    const feeNoChange = estimateInheritanceMultisigFee(
      selected.length,
      1,
      feeRate,
    );
    if (selectedValue >= amountSats + feeNoChange) {
      break;
    }
  }

  let fee = estimateInheritanceMultisigFee(selected.length, 2, feeRate);
  let change = selectedValue - amountSats - fee;
  const addChangeOutput = change >= dustLimit;

  if (!addChangeOutput) {
    fee = estimateInheritanceMultisigFee(selected.length, 1, feeRate);
    change = selectedValue - amountSats - fee;
  }

  if (change < 0) {
    throw new Error("Nedostatek prostředků včetně poplatku");
  }

  const psbt = new bitcoin.Psbt({ network });

  for (const utxo of selected) {
    const descriptor = deriveInheritanceDescriptorFromXpubs(
      participants.userXpub,
      participants.heirXpub,
      utxo.addressIndex,
      utxo.change,
    );

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: descriptor.output,
        value: BigInt(utxo.value),
      },
      witnessScript: descriptor.witnessScript,
    });
  }

  psbt.addOutput({
    address: recipientAddress,
    value: BigInt(amountSats),
  });

  let changeAddress = "";
  if (addChangeOutput && change > 0) {
    changeAddress = getPrimaryStandardChangeAddress(accounts, masterKey);
    psbt.addOutput({
      address: changeAddress,
      value: BigInt(change),
    });
  }

  const localBasePath = getInheritanceLocalBasePath(
    accountRef,
    identity.derivationPath,
  );
  for (let index = 0; index < selected.length; index++) {
    const utxo = selected[index];
    const child = masterKey.derive(
      `${localBasePath}/${utxo.change}/${utxo.addressIndex}`,
    );
    if (!child.privateKey) {
      throw new Error("Nepodařilo se odvodit privátní klíč pro podpis");
    }

    const signer = createEcdsaSigner(Buffer.from(child.privateKey));
    psbt.signInput(index, signer);
  }

  saveAccounts(accounts);

  return {
    psbt: psbt.toBase64(),
    fee,
    changeAmount: Math.max(change, 0),
    changeAddress,
  };
}

export async function completeInheritanceTransactionFromPsbt(
  mnemonic: string,
  account: Account,
  psbtBase64: string,
): Promise<string> {
  if (account.type !== "inheritance") {
    throw new Error("Tato funkce je pouze pro dědický účet");
  }

  const network = getActiveBitcoinNetwork();
  const accounts = loadAccounts();
  const accountIndex = accounts.findIndex((item) => item.id === account.id);
  if (accountIndex === -1) {
    throw new Error("Účet nebyl nalezen");
  }

  const accountRef = accounts[accountIndex];
  if (!isInheritanceAccountActivated(accountRef)) {
    throw new Error("Účet není aktivovaný. Nejprve aktivujte prostředky.");
  }

  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const identity = deriveLocalIdentity(masterKey);
  const localBasePath = getInheritanceLocalBasePath(
    accountRef,
    identity.derivationPath,
  );

  const psbt = bitcoin.Psbt.fromBase64(psbtBase64.trim(), { network });

  const utxoLookup = new Map<string, { index: number; change: 0 | 1 }>();
  for (const derivedAddress of accountRef.derivedAddresses.filter((address) =>
    isActiveInheritanceAddress(address),
  )) {
    const utxos = await getAddressUTXOs(derivedAddress.address);
    const change = derivedAddress.change ? 1 : 0;
    for (const utxo of utxos) {
      utxoLookup.set(`${utxo.txid}:${utxo.vout}`, {
        index: derivedAddress.index,
        change,
      });
    }
  }

  if (utxoLookup.size === 0) {
    throw new Error("Žádná dostupná UTXO pro dopodepsání");
  }

  for (let inputIndex = 0; inputIndex < psbt.txInputs.length; inputIndex++) {
    const txid = getTxInputTxid(psbt, inputIndex);
    const vout = psbt.txInputs[inputIndex].index;
    const source = utxoLookup.get(`${txid}:${vout}`);

    if (!source) {
      throw new Error(
        "PSBT obsahuje vstup, který nepatří tomuto dědickému účtu",
      );
    }

    const child = masterKey.derive(
      `${localBasePath}/${source.change}/${source.index}`,
    );
    if (!child.privateKey) {
      throw new Error("Nepodařilo se odvodit privátní klíč pro dopodepsání");
    }

    const signer = createEcdsaSigner(Buffer.from(child.privateKey));
    psbt.signInput(inputIndex, signer);
  }

  psbt.finalizeAllInputs();
  const txHex = psbt.extractTransaction().toHex();
  const txid = await broadcastTransaction(txHex);

  return txid;
}

export async function activateInheritanceFunds(
  mnemonic: string,
  account: Account,
  feeRate: number,
): Promise<{
  txid: string;
  movedAmount: number;
  fee: number;
  destination: string;
}> {
  if (account.type !== "inheritance") {
    throw new Error("Aktivace je dostupná pouze pro dědický účet");
  }

  if (!Number.isFinite(feeRate) || feeRate <= 0) {
    throw new Error("Neplatný fee rate");
  }

  const network = getActiveBitcoinNetwork();
  const accounts = loadAccounts();
  const accountIndex = accounts.findIndex((item) => item.id === account.id);
  if (accountIndex === -1) {
    throw new Error("Účet nebyl nalezen");
  }

  const accountRef = accounts[accountIndex];
  if (isInheritanceAccountActivated(accountRef)) {
    throw new Error("Účet je už aktivovaný");
  }

  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const localIdentity = deriveLocalIdentity(masterKey);
  const participants = resolveInheritanceParticipants(
    accountRef,
    localIdentity,
  );
  const serverIdentity = await getServerIdentity();
  const fundingBranch = getFundingBranch(accountRef);

  const fundingUtxos = await collectInheritanceUtxos(accountRef, "funding");
  if (fundingUtxos.length === 0) {
    throw new Error("Na funding adresách nejsou prostředky k aktivaci");
  }

  const totalValue = fundingUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
  const fee = estimateInheritanceMultisigFee(fundingUtxos.length, 1, feeRate);
  const movedAmount = totalValue - fee;

  if (movedAmount <= 330) {
    throw new Error("Nedostatek prostředků po odečtení poplatku");
  }

  const destination = ensureInheritanceActiveAddress(accountRef, participants);
  const psbt = new bitcoin.Psbt({ network });

  for (const utxo of fundingUtxos) {
    const descriptor = deriveInheritanceDescriptorFromXpubs(
      participants.userXpub,
      serverIdentity.xpub,
      utxo.addressIndex,
      utxo.change,
      fundingBranch,
    );

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: descriptor.output,
        value: BigInt(utxo.value),
      },
      witnessScript: descriptor.witnessScript,
    });
  }

  psbt.addOutput({
    address: destination.address,
    value: BigInt(movedAmount),
  });

  const localBasePath = getInheritanceLocalBasePath(
    accountRef,
    localIdentity.derivationPath,
  );

  for (let inputIndex = 0; inputIndex < fundingUtxos.length; inputIndex++) {
    const utxo = fundingUtxos[inputIndex];

    const localChild = masterKey.derive(
      `${localBasePath}/${fundingBranch}/${utxo.change}/${utxo.addressIndex}`,
    );
    if (!localChild.privateKey) {
      throw new Error("Nepodařilo se odvodit lokální klíč pro aktivaci");
    }
    psbt.signInput(
      inputIndex,
      createEcdsaSigner(Buffer.from(localChild.privateKey)),
    );

    const serverChild = serverIdentity.masterKey.derive(
      `${serverIdentity.derivationPath}/${fundingBranch}/${utxo.change}/${utxo.addressIndex}`,
    );
    if (!serverChild.privateKey) {
      throw new Error("Nepodařilo se odvodit server klíč pro aktivaci");
    }
    psbt.signInput(
      inputIndex,
      createEcdsaSigner(Buffer.from(serverChild.privateKey)),
    );
  }

  psbt.finalizeAllInputs();
  const txid = await broadcastTransaction(psbt.extractTransaction().toHex());

  accountRef.inheritanceActivated = true;

  saveAccounts(accounts);

  return {
    txid,
    movedAmount,
    fee,
    destination: destination.address,
  };
}

export async function sendBitcoin(
  mnemonic: string,
  account: Account,
  recipientAddress: string,
  amountSats: number,
  feeRate: number,
): Promise<string> {
  if (account.type === "inheritance") {
    throw new Error(
      "Utrácení z dědického účtu zatím není implementováno podle timelock podmínek.",
    );
  }

  const network = getActiveBitcoinNetwork();
  const accounts = loadAccounts();
  const accountIndex = accounts.findIndex((a: Account) => a.id === account.id);
  if (accountIndex === -1) {
    throw new Error("Účet nebyl nalezen");
  }

  if (!Number.isInteger(amountSats) || amountSats <= 0) {
    throw new Error("Neplatná částka v satech");
  }

  if (!Number.isFinite(feeRate) || feeRate <= 0) {
    throw new Error("Neplatný fee rate");
  }

  try {
    bitcoin.address.toOutputScript(recipientAddress, network);
  } catch {
    throw new Error("Neplatná adresa příjemce pro aktivní síť");
  }

  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const accountRef = accounts[accountIndex];

  const allUtxos: SpendableUtxo[] = [];
  for (const derivedAddress of accountRef.derivedAddresses) {
    const utxos = await getAddressUTXOs(derivedAddress.address);
    const change = derivedAddress.change ? 1 : 0;
    for (const utxo of utxos) {
      allUtxos.push({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        address: derivedAddress.address,
        addressIndex: derivedAddress.index,
        change,
      });
    }
  }

  if (allUtxos.length === 0) {
    throw new Error("Žádné UTXO k utracení");
  }

  allUtxos.sort((a, b) => b.value - a.value);

  const selected: SpendableUtxo[] = [];
  let selectedValue = 0;
  const dustLimit = 330;

  for (const utxo of allUtxos) {
    selected.push(utxo);
    selectedValue += utxo.value;

    const feeWithChange = estimateTaprootFee(selected.length, 2, feeRate);
    if (selectedValue >= amountSats + feeWithChange) {
      break;
    }

    const feeNoChange = estimateTaprootFee(selected.length, 1, feeRate);
    if (selectedValue >= amountSats + feeNoChange) {
      break;
    }
  }

  let fee = estimateTaprootFee(selected.length, 2, feeRate);
  let change = selectedValue - amountSats - fee;
  const addChangeOutput = change >= dustLimit;

  if (!addChangeOutput) {
    fee = estimateTaprootFee(selected.length, 1, feeRate);
    change = selectedValue - amountSats - fee;
  }

  if (change < 0) {
    throw new Error("Nedostatek prostředků včetně poplatku");
  }

  const psbt = new bitcoin.Psbt({ network });

  const resolvedInputs = selected.map((utxo) => {
    const resolvedPath = resolveTaprootUtxoPath(
      masterKey,
      accountIndex,
      accounts.length,
      accountRef,
      utxo,
      network,
    );

    return {
      ...utxo,
      ...resolvedPath,
    };
  });

  for (const utxo of resolvedInputs) {
    const outputScript = bitcoin.address.toOutputScript(utxo.address, network);

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: outputScript,
        value: BigInt(utxo.value),
      },
      tapInternalKey: utxo.internalPubkey,
    });
  }

  psbt.addOutput({
    address: recipientAddress,
    value: BigInt(amountSats),
  });

  const changeAddresses = accountRef.derivedAddresses
    .filter((address) => address.change)
    .sort((a, b) => a.index - b.index);

  let selectedChangeAddress = changeAddresses.find((address) => !address.used);
  if (!selectedChangeAddress) {
    const nextChangeIndex =
      changeAddresses.length > 0
        ? Math.max(...changeAddresses.map((address) => address.index)) + 1
        : 0;

    const newChangeAddress = deriveTaprootAddress(
      masterKey,
      accountIndex,
      nextChangeIndex,
      1,
    );
    selectedChangeAddress = {
      index: nextChangeIndex,
      address: newChangeAddress,
      change: true,
      used: false,
      balance: 0,
    };
    accountRef.derivedAddresses.push(selectedChangeAddress);
  }

  if (addChangeOutput && change > 0) {
    psbt.addOutput({
      address: selectedChangeAddress.address,
      value: BigInt(change),
    });

    selectedChangeAddress.used = true;
  }

  for (let index = 0; index < resolvedInputs.length; index++) {
    const utxo = resolvedInputs[index];
    const child = masterKey.derive(utxo.derivationPath);
    if (!child.privateKey) {
      throw new Error("Nepodařilo se odvodit privátní klíč pro podpis vstupu");
    }

    const privateKey = Buffer.from(child.privateKey);
    const signer = createTweakedSigner(privateKey);
    psbt.signInput(index, signer);
  }

  psbt.finalizeAllInputs();
  const rawTxHex = psbt.extractTransaction().toHex();
  const txid = await broadcastTransaction(rawTxHex);

  saveAccounts(accounts);
  return txid;
}
