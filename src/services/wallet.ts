import { generateMnemonic, validateMnemonic, getMasterKeyFromMnemonic } from '../utils/bitcoin';
import { deriveTaprootAddress } from '../utils/bitcoin';
import { saveWallet, saveAccounts, loadAccounts } from '../utils/storage';
import { getAddressBalance, getAddressUTXOs } from '../utils/api';
import type { Wallet, Account, DerivedAddress, HeirContact, SpendingConditions } from '../types';
import { DEFAULT_INHERITANCE_CONDITIONS } from '../constants';

export async function createNewWallet(): Promise<Wallet> {
  const mnemonic = generateMnemonic();
  const wallet: Wallet = {
    mnemonic,
    createdAt: Date.now(),
  };
  saveWallet(wallet);
  
  // Create default standard account
  await createStandardAccount(wallet.mnemonic, 'Můj účet');
  
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
    await createStandardAccount(wallet.mnemonic, 'Můj účet');
  }
  
  return wallet;
}

export async function createStandardAccount(mnemonic: string, name: string): Promise<Account> {
  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const accounts = loadAccounts();
  const accountIndex = accounts.length;
  
  // Generate first address
  const address = deriveTaprootAddress(masterKey, accountIndex, 0);
  
  const account: Account = {
    id: `account-${Date.now()}`,
    name,
    type: 'standard',
    balance: 0,
    addressIndex: 1, // Next address to use
    derivedAddresses: [{
      index: 0,
      address,
      used: false,
    }],
  };
  
  accounts.push(account);
  saveAccounts(accounts);
  
  return account;
}

export async function createInheritanceAccount(
  mnemonic: string,
  name: string,
  heir: HeirContact,
  conditions: SpendingConditions = DEFAULT_INHERITANCE_CONDITIONS
): Promise<Account> {
  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const accounts = loadAccounts();
  const accountIndex = accounts.length;
  
  // Generate first address
  const address = deriveTaprootAddress(masterKey, accountIndex, 0);
  
  const account: Account = {
    id: `inheritance-${Date.now()}`,
    name,
    type: 'inheritance',
    balance: 0,
    addressIndex: 1,
    derivedAddresses: [{
      index: 0,
      address,
      used: false,
    }],
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
  if (account.type === 'inheritance' && account.spendingConditions) {
    updatedAccount.inheritanceStatus = calculateInheritanceStatus(
      account.spendingConditions,
      updatedAddresses
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
  addresses: DerivedAddress[]
): Account['inheritanceStatus'] {
  // Calculate blocks since first funding
  const fundedAddresses = addresses.filter(a => a.used && (a.balance || 0) > 0);
  const blocksSinceFunding = fundedAddresses.length > 0 ? 0 : 0; // This would need to be tracked from blockchain
  
  return {
    blocksSinceFunding,
    canUserSpend: blocksSinceFunding >= conditions.userOnlyAfterBlocks,
    canHeirSpend: blocksSinceFunding >= conditions.heirOnlyAfterBlocks,
    requiresMultisig: blocksSinceFunding >= conditions.multisigAfterBlocks && 
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
  const unused = account.derivedAddresses.find(a => !a.used);
  if (unused) return unused;
  return null;
}

export async function generateNewAddress(
  mnemonic: string,
  account: Account
): Promise<DerivedAddress> {
  const masterKey = await getMasterKeyFromMnemonic(mnemonic);
  const accounts = loadAccounts();
  const accountIndex = accounts.findIndex((a: Account) => a.id === account.id);
  
  const newIndex = account.derivedAddresses.length;
  const address = deriveTaprootAddress(masterKey, accountIndex, newIndex);
  
  const newAddress: DerivedAddress = {
    index: newIndex,
    address,
    used: false,
  };
  
  account.derivedAddresses.push(newAddress);
  account.addressIndex = newIndex + 1;
  
  accounts[accountIndex] = account;
  saveAccounts(accounts);
  
  return newAddress;
}