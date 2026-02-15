import { HDKey } from '@scure/bip32';
import { TESTNET_NETWORK, TAPROOT_PATH } from '../constants';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { Buffer } from 'buffer';
import { generateMnemonic as slip39GenerateMnemonic, validateMnemonic, recoverMasterSecret } from './slip39-full';

bitcoin.initEccLib(ecc);

// Wrapper that generates random master secret
export function generateMnemonic(): string {
  // Generate 16 bytes (128-bit) for 20-word mnemonic
  const masterSecret = new Uint8Array(16);
  crypto.getRandomValues(masterSecret);
  return slip39GenerateMnemonic(masterSecret);
}

export { validateMnemonic };

export async function getMasterKeyFromMnemonic(mnemonic: string): Promise<HDKey> {
  const masterSecret = await recoverMasterSecret(mnemonic);
  return HDKey.fromMasterSeed(masterSecret);
}

export function deriveTaprootAddress(
  masterKey: HDKey,
  accountIndex: number,
  addressIndex: number
): string {
  const path = `${TAPROOT_PATH}/${accountIndex}/${addressIndex}`;
  const child = masterKey.derive(path);
  
  if (!child.publicKey) {
    throw new Error('Failed to derive public key');
  }

  const internalKey = Buffer.from(child.publicKey);
  
  // Create Taproot output
  const payment = bitcoin.payments.p2tr({
    internalPubkey: internalKey.slice(1, 33),
    network: TESTNET_NETWORK,
  });

  return payment.address!;
}

export function getPrivateKeyForAddress(
  masterKey: HDKey,
  accountIndex: number,
  addressIndex: number
): Buffer {
  const path = `${TAPROOT_PATH}/${accountIndex}/${addressIndex}`;
  const child = masterKey.derive(path);
  
  if (!child.privateKey) {
    throw new Error('Failed to derive private key');
  }

  return Buffer.from(child.privateKey);
}

export function derivePublicKey(
  masterKey: HDKey,
  accountIndex: number
): string {
  const path = `${TAPROOT_PATH}/${accountIndex}`;
  const child = masterKey.derive(path);
  
  if (!child.publicKey) {
    throw new Error('Failed to derive public key');
  }

  return Buffer.from(child.publicKey).toString('hex');
}