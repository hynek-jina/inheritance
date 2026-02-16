import { NETWORK_CONFIG } from "../constants";
import type { Transaction, UTXO } from "../types";
import { loadActiveNetwork } from "./storage";

interface AddressStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
}

interface AddressResponse {
  chain_stats?: AddressStats;
  mempool_stats?: AddressStats;
}

export interface AddressFundingStats {
  funded: number;
  spent: number;
  balance: number;
}

interface AddressOutput {
  scriptpubkey_address?: string;
  value: number;
}

interface AddressInput {
  prevout?: {
    scriptpubkey_address?: string;
    value: number;
  };
}

interface AddressTx {
  txid: string;
  fee?: number;
  vin: AddressInput[];
  vout: AddressOutput[];
  status: {
    confirmed: boolean;
    block_time?: number;
    block_height?: number;
  };
}

function getMempoolApiBase(): string {
  const network = loadActiveNetwork();
  return NETWORK_CONFIG[network].mempoolApi;
}

export async function getCurrentBlockHeight(): Promise<number | null> {
  try {
    const response = await fetch(`${getMempoolApiBase()}/blocks/tip/height`);
    if (!response.ok) throw new Error("Failed to fetch tip height");

    const text = await response.text();
    const tipHeight = Number.parseInt(text, 10);
    return Number.isFinite(tipHeight) ? tipHeight : null;
  } catch (error) {
    console.error("Error fetching tip height:", error);
    return null;
  }
}

export async function getAddressFirstFundingBlockHeight(
  address: string,
): Promise<number | null> {
  try {
    const response = await fetch(
      `${getMempoolApiBase()}/address/${address}/txs`,
    );
    if (!response.ok) throw new Error("Failed to fetch address txs");

    const txs = (await response.json()) as AddressTx[];
    let firstFundingHeight: number | null = null;

    for (const tx of txs) {
      const blockHeight = tx.status.block_height;
      if (!tx.status.confirmed || !blockHeight) {
        continue;
      }

      const fundedThisAddress = tx.vout.some(
        (output) => output.scriptpubkey_address === address && output.value > 0,
      );
      if (!fundedThisAddress) {
        continue;
      }

      if (firstFundingHeight === null || blockHeight < firstFundingHeight) {
        firstFundingHeight = blockHeight;
      }
    }

    return firstFundingHeight;
  } catch (error) {
    console.error("Error fetching first funding block:", error);
    return null;
  }
}

export async function getAddressBalance(address: string): Promise<number> {
  const stats = await getAddressFundingStats(address);
  return stats.balance;
}

export async function getAddressFundingStats(
  address: string,
): Promise<AddressFundingStats> {
  try {
    const response = await fetch(`${getMempoolApiBase()}/address/${address}`);
    if (!response.ok) throw new Error("Failed to fetch balance");

    const data = (await response.json()) as AddressResponse;
    const chainFunded = data.chain_stats?.funded_txo_sum || 0;
    const chainSpent = data.chain_stats?.spent_txo_sum || 0;
    const mempoolFunded = data.mempool_stats?.funded_txo_sum || 0;
    const mempoolSpent = data.mempool_stats?.spent_txo_sum || 0;

    const funded = chainFunded + mempoolFunded;
    const spent = chainSpent + mempoolSpent;

    return {
      funded,
      spent,
      balance: funded - spent,
    };
  } catch (error) {
    console.error("Error fetching balance:", error);
    return {
      funded: 0,
      spent: 0,
      balance: 0,
    };
  }
}

export async function getAddressUTXOs(address: string): Promise<UTXO[]> {
  try {
    const response = await fetch(
      `${getMempoolApiBase()}/address/${address}/utxo`,
    );
    if (!response.ok) throw new Error("Failed to fetch UTXOs");

    return await response.json();
  } catch (error) {
    console.error("Error fetching UTXOs:", error);
    return [];
  }
}

export async function getTransactions(
  address: string,
  accountAddresses?: Set<string>,
): Promise<Transaction[]> {
  try {
    const response = await fetch(
      `${getMempoolApiBase()}/address/${address}/txs`,
    );
    if (!response.ok) throw new Error("Failed to fetch transactions");

    const txs = (await response.json()) as AddressTx[];

    const ownAddresses = accountAddresses ?? new Set([address]);

    return txs
      .map((tx) => {
        const sentFromOwn = tx.vin.reduce((sum, input) => {
          const prevoutAddress = input.prevout?.scriptpubkey_address;
          if (!prevoutAddress || !ownAddresses.has(prevoutAddress)) {
            return sum;
          }
          return sum + (input.prevout?.value || 0);
        }, 0);

        const receivedToOwn = tx.vout.reduce((sum, output) => {
          const outputAddress = output.scriptpubkey_address;
          if (!outputAddress || !ownAddresses.has(outputAddress)) {
            return sum;
          }
          return sum + output.value;
        }, 0);

        const netFlow = receivedToOwn - sentFromOwn;
        if (netFlow === 0) {
          return null;
        }

        return {
          txid: tx.txid,
          amount: Math.abs(netFlow),
          fee: tx.fee || 0,
          timestamp: tx.status.block_time || Date.now() / 1000,
          type: netFlow > 0 ? ("incoming" as const) : ("outgoing" as const),
          address: address,
          confirmed: tx.status.confirmed,
          confirmations: tx.status.confirmed ? tx.status.block_height || 0 : 0,
        };
      })
      .filter((tx): tx is Transaction => tx !== null);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return [];
  }
}

export async function getFeeEstimates(): Promise<{
  fastest: number;
  halfHour: number;
  hour: number;
}> {
  try {
    const response = await fetch(`${getMempoolApiBase()}/fees/recommended`);
    if (!response.ok) throw new Error("Failed to fetch fee estimates");

    const data = await response.json();
    return {
      fastest: data.fastestFee,
      halfHour: data.halfHourFee,
      hour: data.hourFee,
    };
  } catch (error) {
    console.error("Error fetching fee estimates:", error);
    return { fastest: 10, halfHour: 5, hour: 1 };
  }
}

export async function broadcastTransaction(txHex: string): Promise<string> {
  try {
    const response = await fetch(`${getMempoolApiBase()}/tx`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: txHex,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to broadcast: ${error}`);
    }

    return await response.text();
  } catch (error) {
    console.error("Error broadcasting transaction:", error);
    throw error;
  }
}
