import { MEMPOOL_API } from '../constants';
import type { UTXO, Transaction } from '../types';

export async function getAddressBalance(address: string): Promise<number> {
  try {
    const response = await fetch(`${MEMPOOL_API}/address/${address}`);
    if (!response.ok) throw new Error('Failed to fetch balance');
    
    const data = await response.json();
    const funded = data.chain_stats.funded_txo_sum || 0;
    const spent = data.chain_stats.spent_txo_sum || 0;
    return (funded - spent) / 100000000; // Convert satoshis to BTC
  } catch (error) {
    console.error('Error fetching balance:', error);
    return 0;
  }
}

export async function getAddressUTXOs(address: string): Promise<UTXO[]> {
  try {
    const response = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
    if (!response.ok) throw new Error('Failed to fetch UTXOs');
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching UTXOs:', error);
    return [];
  }
  }

export async function getTransactions(address: string): Promise<Transaction[]> {
  try {
    const response = await fetch(`${MEMPOOL_API}/address/${address}/txs`);
    if (!response.ok) throw new Error('Failed to fetch transactions');
    
    const txs = await response.json();
    
    return txs.map((tx: any) => {
      const isIncoming = tx.vout.some((output: any) => 
        output.scriptpubkey_address === address
      );
      
      let amount = 0;
      if (isIncoming) {
        amount = tx.vout
          .filter((output: any) => output.scriptpubkey_address === address)
          .reduce((sum: number, output: any) => sum + output.value, 0);
      } else {
        amount = tx.vin
          .filter((input: any) => input.prevout.scriptpubkey_address === address)
          .reduce((sum: number, input: any) => sum + input.prevout.value, 0);
      }
      
      return {
        txid: tx.txid,
        amount: amount / 100000000,
        fee: (tx.fee || 0) / 100000000,
        timestamp: tx.status.block_time || Date.now() / 1000,
        type: isIncoming ? 'incoming' : 'outgoing',
        address: address,
        confirmed: tx.status.confirmed,
        confirmations: tx.status.confirmed ? tx.status.block_height : 0,
      };
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}

export async function getFeeEstimates(): Promise<{ fastest: number; halfHour: number; hour: number }> {
  try {
    const response = await fetch(`${MEMPOOL_API}/fees/recommended`);
    if (!response.ok) throw new Error('Failed to fetch fee estimates');
    
    const data = await response.json();
    return {
      fastest: data.fastestFee,
      halfHour: data.halfHourFee,
      hour: data.hourFee,
    };
  } catch (error) {
    console.error('Error fetching fee estimates:', error);
    return { fastest: 10, halfHour: 5, hour: 1 };
  }
}

export async function broadcastTransaction(txHex: string): Promise<string> {
  try {
    const response = await fetch(`${MEMPOOL_API}/tx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: txHex,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to broadcast: ${error}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error('Error broadcasting transaction:', error);
    throw error;
  }
}