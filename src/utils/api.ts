import { MEMPOOL_API } from "../constants";
import type { Transaction, UTXO } from "../types";

interface AddressStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
}

interface AddressResponse {
  chain_stats?: AddressStats;
  mempool_stats?: AddressStats;
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

export async function getAddressBalance(address: string): Promise<number> {
  try {
    const response = await fetch(`${MEMPOOL_API}/address/${address}`);
    if (!response.ok) throw new Error("Failed to fetch balance");

    const data = (await response.json()) as AddressResponse;
    const chainFunded = data.chain_stats?.funded_txo_sum || 0;
    const chainSpent = data.chain_stats?.spent_txo_sum || 0;
    const mempoolFunded = data.mempool_stats?.funded_txo_sum || 0;
    const mempoolSpent = data.mempool_stats?.spent_txo_sum || 0;

    const funded = chainFunded + mempoolFunded;
    const spent = chainSpent + mempoolSpent;
    return funded - spent;
  } catch (error) {
    console.error("Error fetching balance:", error);
    return 0;
  }
}

export async function getAddressUTXOs(address: string): Promise<UTXO[]> {
  try {
    const response = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
    if (!response.ok) throw new Error("Failed to fetch UTXOs");

    return await response.json();
  } catch (error) {
    console.error("Error fetching UTXOs:", error);
    return [];
  }
}

export async function getTransactions(address: string): Promise<Transaction[]> {
  try {
    const response = await fetch(`${MEMPOOL_API}/address/${address}/txs`);
    if (!response.ok) throw new Error("Failed to fetch transactions");

    const txs = (await response.json()) as AddressTx[];

    return txs.map((tx) => {
      const isIncoming = tx.vout.some(
        (output) => output.scriptpubkey_address === address,
      );

      let amount = 0;
      if (isIncoming) {
        amount = tx.vout
          .filter((output) => output.scriptpubkey_address === address)
          .reduce((sum, output) => sum + output.value, 0);
      } else {
        amount = tx.vin
          .filter((input) => input.prevout?.scriptpubkey_address === address)
          .reduce((sum, input) => sum + (input.prevout?.value || 0), 0);
      }

      return {
        txid: tx.txid,
        amount,
        fee: tx.fee || 0,
        timestamp: tx.status.block_time || Date.now() / 1000,
        type: isIncoming ? "incoming" : "outgoing",
        address: address,
        confirmed: tx.status.confirmed,
        confirmations: tx.status.confirmed ? tx.status.block_height || 0 : 0,
      };
    });
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
    const response = await fetch(`${MEMPOOL_API}/fees/recommended`);
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
    const response = await fetch(`${MEMPOOL_API}/tx`, {
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
