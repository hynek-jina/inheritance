import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";
import * as ecc from "tiny-secp256k1";
import {
  DEFAULT_INHERITANCE_CONDITIONS,
  TAPROOT_PATH,
  TESTNET_NETWORK,
} from "../constants";
import type {
  Account,
  DerivedAddress,
  HeirContact,
  SpendingConditions,
  Wallet,
} from "../types";
import {
  broadcastTransaction,
  getAddressBalance,
  getAddressUTXOs,
} from "../utils/api";
import {
  deriveTaprootAddress,
  generateMnemonic,
  getMasterKeyFromMnemonic,
  getPrivateKeyForAddress,
  validateMnemonic,
} from "../utils/bitcoin";
import { loadAccounts, saveAccounts, saveWallet } from "../utils/storage";

bitcoin.initEccLib(ecc);

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
  heir: HeirContact,
  conditions: SpendingConditions = DEFAULT_INHERITANCE_CONDITIONS,
): Promise<Account> {
  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const accounts = loadAccounts();
  const accountIndex = accounts.length;

  // Generate first address
  const address = deriveTaprootAddress(masterKey, accountIndex, 0);

  const account: Account = {
    id: `inheritance-${Date.now()}`,
    name,
    type: "inheritance",
    balance: 0,
    addressIndex: 1,
    derivedAddresses: [
      {
        index: 0,
        address,
        change: false,
        used: false,
      },
    ],
    heirPublicKey: heir.publicKey,
    heirName: heir.name,
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

export async function updateAccountBalance(account: Account): Promise<Account> {
  let totalBalance = 0;
  const updatedAddresses: DerivedAddress[] = [];

  for (const addr of account.derivedAddresses) {
    const balance = await getAddressBalance(addr.address);
    const utxos = await getAddressUTXOs(addr.address);

    totalBalance += balance;
    updatedAddresses.push({
      ...addr,
      balance,
      used: utxos.length > 0 || balance > 0,
    });
  }

  const updatedAccount = {
    ...account,
    balance: totalBalance,
    derivedAddresses: updatedAddresses,
  };

  // Update inheritance status if needed
  if (account.type === "inheritance" && account.spendingConditions) {
    updatedAccount.inheritanceStatus = calculateInheritanceStatus(
      account.spendingConditions,
      updatedAddresses,
    );
  }

  // Save updated account
  const accounts = loadAccounts();
  const index = accounts.findIndex((a: Account) => a.id === account.id);
  if (index !== -1) {
    accounts[index] = updatedAccount;
    saveAccounts(accounts);
  }

  return updatedAccount;
}

function calculateInheritanceStatus(
  conditions: SpendingConditions,
  addresses: DerivedAddress[],
): Account["inheritanceStatus"] {
  // Calculate blocks since first funding
  const fundedAddresses = addresses.filter(
    (a) => a.used && (a.balance || 0) > 0,
  );
  const blocksSinceFunding = fundedAddresses.length > 0 ? 0 : 0; // This would need to be tracked from blockchain

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
  const unused = account.derivedAddresses.find((a) => !a.change && !a.used);
  if (unused) return unused;
  return null;
}

export async function generateNewAddress(
  mnemonic: string,
  account: Account,
): Promise<DerivedAddress> {
  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const accounts = loadAccounts();
  const accountIndex = accounts.findIndex((a: Account) => a.id === account.id);

  const newIndex = account.derivedAddresses.filter(
    (a: DerivedAddress) => !a.change,
  ).length;
  const address = deriveTaprootAddress(masterKey, accountIndex, newIndex);

  const newAddress: DerivedAddress = {
    index: newIndex,
    address,
    change: false,
    used: false,
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
  addressIndex: number;
  change: 0 | 1;
}

type TaprootSigner = {
  publicKey: Buffer;
  sign: (hash: Buffer) => Buffer;
  signSchnorr: (hash: Buffer) => Buffer;
};

function estimateTaprootFee(
  inputCount: number,
  outputCount: number,
  feeRate: number,
): number {
  const estimatedVbytes = 10 + inputCount * 58 + outputCount * 43;
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

export async function sendBitcoin(
  mnemonic: string,
  account: Account,
  recipientAddress: string,
  amountSats: number,
  feeRate: number,
): Promise<string> {
  const network = TESTNET_NETWORK as bitcoin.Network;
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
    throw new Error("Neplatná testnet adresa příjemce");
  }

  const masterKey = await getMasterKeyFromMnemonic(mnemonic);

  const allUtxos: SpendableUtxo[] = [];
  for (const derivedAddress of account.derivedAddresses) {
    const utxos = await getAddressUTXOs(derivedAddress.address);
    const change = derivedAddress.change ? 1 : 0;
    for (const utxo of utxos) {
      allUtxos.push({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
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

  for (const utxo of selected) {
    const inputPath = `${TAPROOT_PATH}/${accountIndex}'/${utxo.change}/${utxo.addressIndex}`;
    const child = masterKey.derive(inputPath);
    if (!child.publicKey) {
      throw new Error("Nepodařilo se odvodit veřejný klíč pro vstup");
    }

    const internalPubkey = Buffer.from(child.publicKey).slice(1, 33);
    const payment = bitcoin.payments.p2tr({
      internalPubkey,
      network,
    });

    if (!payment.output) {
      throw new Error("Nepodařilo se vytvořit output script");
    }

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: payment.output,
        value: BigInt(utxo.value),
      },
      tapInternalKey: internalPubkey,
    });
  }

  psbt.addOutput({
    address: recipientAddress,
    value: BigInt(amountSats),
  });

  const accountRef = accounts[accountIndex];
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

  for (let index = 0; index < selected.length; index++) {
    const utxo = selected[index];
    const privateKey = getPrivateKeyForAddress(
      masterKey,
      accountIndex,
      utxo.addressIndex,
      utxo.change,
    );
    const signer = createTweakedSigner(privateKey);
    psbt.signInput(index, signer);
  }

  psbt.finalizeAllInputs();
  const rawTxHex = psbt.extractTransaction().toHex();
  const txid = await broadcastTransaction(rawTxHex);

  saveAccounts(accounts);
  return txid;
}
