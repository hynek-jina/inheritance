import { NETWORK_CONFIG } from "../constants";
import type { Transaction, UTXO } from "../types";
import { loadActiveNetwork } from "./storage";

const inFlightRequests = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, { expiresAt: number; data: unknown }>();
const loggedErrors = new Set<string>();
let rateLimitUntil = 0;

class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("Rate limit reached");
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function logApiErrorOnce(key: string, message: string, error: unknown): void {
  if (loggedErrors.has(key)) {
    return;
  }
  loggedErrors.add(key);
  console.warn(message, error);
}

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
  if (import.meta.env.DEV) {
    return "/mempool-api";
  }
  return NETWORK_CONFIG[network].mempoolApi;
}

async function fetchWithRetry(
  path: string,
  init?: RequestInit,
  retries = 2,
): Promise<Response> {
  const waitMs = rateLimitUntil - Date.now();
  if (waitMs > 0) {
    throw new RateLimitError(waitMs);
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${getMempoolApiBase()}${path}`, init);
      if (response.status === 429) {
        rateLimitUntil = Date.now() + 15_000;
        throw new RateLimitError(15_000);
      }
      return response;
    } catch (error) {
      if (isRateLimitError(error)) {
        throw error;
      }
      lastError = error;
      if (attempt < retries) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error("Request failed");
}

async function fetchJsonCached<T>(
  path: string,
  options?: {
    cacheMs?: number;
    retries?: number;
  },
): Promise<T> {
  const cacheMs = options?.cacheMs ?? 0;
  const retries = options?.retries ?? 2;
  const requestKey = `json:${path}`;

  if (cacheMs > 0) {
    const cached = responseCache.get(requestKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }
  }

  const inFlight = inFlightRequests.get(requestKey);
  if (inFlight) {
    return (await inFlight) as T;
  }

  const requestPromise = (async () => {
    const response = await fetchWithRetry(path, undefined, retries);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as T;
    if (cacheMs > 0) {
      responseCache.set(requestKey, {
        expiresAt: Date.now() + cacheMs,
        data,
      });
    }

    return data;
  })();

  inFlightRequests.set(requestKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightRequests.delete(requestKey);
  }
}

async function fetchTextCached(
  path: string,
  options?: {
    cacheMs?: number;
    retries?: number;
  },
): Promise<string> {
  const cacheMs = options?.cacheMs ?? 0;
  const retries = options?.retries ?? 2;
  const requestKey = `text:${path}`;

  if (cacheMs > 0) {
    const cached = responseCache.get(requestKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as string;
    }
  }

  const inFlight = inFlightRequests.get(requestKey);
  if (inFlight) {
    return (await inFlight) as string;
  }

  const requestPromise = (async () => {
    const response = await fetchWithRetry(path, undefined, retries);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.text();
    if (cacheMs > 0) {
      responseCache.set(requestKey, {
        expiresAt: Date.now() + cacheMs,
        data,
      });
    }

    return data;
  })();

  inFlightRequests.set(requestKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightRequests.delete(requestKey);
  }
}

export async function getCurrentBlockHeight(): Promise<number | null> {
  try {
    const text = await fetchTextCached("/blocks/tip/height", {
      cacheMs: 3_000,
      retries: 2,
    });
    const tipHeight = Number.parseInt(text, 10);
    return Number.isFinite(tipHeight) ? tipHeight : null;
  } catch (error) {
    if (isRateLimitError(error)) {
      return null;
    }
    logApiErrorOnce("tip-height", "Error fetching tip height:", error);
    return null;
  }
}

export async function getAddressFirstFundingBlockHeight(
  address: string,
): Promise<number | null> {
  try {
    const txs = await fetchJsonCached<AddressTx[]>(`/address/${address}/txs`, {
      cacheMs: 10_000,
      retries: 2,
    });
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
    if (isRateLimitError(error)) {
      return null;
    }
    logApiErrorOnce(
      `first-funding:${address}`,
      "Error fetching first funding block:",
      error,
    );
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
    const data = await fetchJsonCached<AddressResponse>(`/address/${address}`, {
      cacheMs: 5_000,
      retries: 2,
    });
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
    if (isRateLimitError(error)) {
      return {
        funded: 0,
        spent: 0,
        balance: 0,
      };
    }
    logApiErrorOnce(`balance:${address}`, "Error fetching balance:", error);
    return {
      funded: 0,
      spent: 0,
      balance: 0,
    };
  }
}

export async function getAddressUTXOs(address: string): Promise<UTXO[]> {
  try {
    return await fetchJsonCached<UTXO[]>(`/address/${address}/utxo`, {
      cacheMs: 5_000,
      retries: 2,
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      return [];
    }
    logApiErrorOnce(`utxo:${address}`, "Error fetching UTXOs:", error);
    return [];
  }
}

export async function getTransactions(
  address: string,
  accountAddresses?: Set<string>,
): Promise<Transaction[]> {
  try {
    const txs = await fetchJsonCached<AddressTx[]>(`/address/${address}/txs`, {
      cacheMs: 5_000,
      retries: 2,
    });

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
    if (isRateLimitError(error)) {
      return [];
    }
    logApiErrorOnce(`txs:${address}`, "Error fetching transactions:", error);
    return [];
  }
}

export async function getFeeEstimates(): Promise<{
  fastest: number;
  halfHour: number;
  hour: number;
}> {
  try {
    const data = await fetchJsonCached<{
      fastestFee: number;
      halfHourFee: number;
      hourFee: number;
    }>("/fees/recommended", {
      cacheMs: 10_000,
      retries: 2,
    });
    return {
      fastest: data.fastestFee,
      halfHour: data.halfHourFee,
      hour: data.hourFee,
    };
  } catch (error) {
    if (isRateLimitError(error)) {
      return { fastest: 10, halfHour: 5, hour: 1 };
    }
    logApiErrorOnce("fees", "Error fetching fee estimates:", error);
    return { fastest: 10, halfHour: 5, hour: 1 };
  }
}

export async function broadcastTransaction(txHex: string): Promise<string> {
  try {
    const response = await fetchWithRetry(
      "/tx",
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        body: txHex,
      },
      1,
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to broadcast: ${error}`);
    }

    return await response.text();
  } catch (error) {
    if (isRateLimitError(error)) {
      throw error;
    }
    logApiErrorOnce("broadcast", "Error broadcasting transaction:", error);
    throw error;
  }
}
