import { STORAGE_KEYS } from '../constants';
import type { Wallet, Account, Transaction } from '../types';

export function saveWallet(wallet: Wallet): void {
  localStorage.setItem(STORAGE_KEYS.WALLET, JSON.stringify(wallet));
}

export function loadWallet(): Wallet | null {
  const data = localStorage.getItem(STORAGE_KEYS.WALLET);
  return data ? JSON.parse(data) : null;
}

export function clearWallet(): void {
  localStorage.removeItem(STORAGE_KEYS.WALLET);
  localStorage.removeItem(STORAGE_KEYS.ACCOUNTS);
  localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
}

export function saveAccounts(accounts: Account[]): void {
  localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
}

export function loadAccounts(): Account[] {
  const data = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
  return data ? JSON.parse(data) : [];
}

export function saveTransactions(transactions: Transaction[]): void {
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
}

export function loadTransactions(): Transaction[] {
  const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
  return data ? JSON.parse(data) : [];
}