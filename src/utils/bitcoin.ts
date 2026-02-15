import { HDKey } from "@scure/bip32";
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";
import * as ecc from "tiny-secp256k1";
import { TAPROOT_PATH, TESTNET_NETWORK } from "../constants";
import {
  recoverMasterSecret,
  generateMnemonic as slip39GenerateMnemonic,
  validateMnemonic,
} from "./slip39-full";

bitcoin.initEccLib(ecc);

const MAINNET_BIP32 = {
  private: 0x0488ade4,
  public: 0x0488b21e,
};

function parseExtendedKey(extendedKey: string): HDKey {
  if (extendedKey.startsWith("tpub") || extendedKey.startsWith("tprv")) {
    return HDKey.fromExtendedKey(extendedKey, {
      private: TESTNET_NETWORK.bip32.private,
      public: TESTNET_NETWORK.bip32.public,
    });
  }

  if (extendedKey.startsWith("xpub") || extendedKey.startsWith("xprv")) {
    return HDKey.fromExtendedKey(extendedKey, MAINNET_BIP32);
  }

  try {
    return HDKey.fromExtendedKey(extendedKey, {
      private: TESTNET_NETWORK.bip32.private,
      public: TESTNET_NETWORK.bip32.public,
    });
  } catch {
    return HDKey.fromExtendedKey(extendedKey, MAINNET_BIP32);
  }
}

// Wrapper that generates random master secret
export function generateMnemonic(): string {
  // Generate 16 bytes (128-bit) for 20-word mnemonic
  const masterSecret = new Uint8Array(16);
  crypto.getRandomValues(masterSecret);
  return slip39GenerateMnemonic(masterSecret);
}

export { validateMnemonic };

export async function getMasterKeyFromMnemonic(
  mnemonic: string,
): Promise<HDKey> {
  const masterSecret = await recoverMasterSecret(mnemonic);
  return HDKey.fromMasterSeed(masterSecret, {
    private: TESTNET_NETWORK.bip32.private,
    public: TESTNET_NETWORK.bip32.public,
  });
}

export function deriveTaprootAddress(
  masterKey: HDKey,
  accountIndex: number,
  addressIndex: number,
  change: 0 | 1 = 0,
): string {
  const path = `${TAPROOT_PATH}/${accountIndex}'/${change}/${addressIndex}`;
  const child = masterKey.derive(path);

  if (!child.publicKey) {
    throw new Error("Failed to derive public key");
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
  addressIndex: number,
  change: 0 | 1 = 0,
): Buffer {
  const path = `${TAPROOT_PATH}/${accountIndex}'/${change}/${addressIndex}`;
  const child = masterKey.derive(path);

  if (!child.privateKey) {
    throw new Error("Failed to derive private key");
  }

  return Buffer.from(child.privateKey);
}

export function derivePublicKey(
  masterKey: HDKey,
  accountIndex: number,
): string {
  const path = `${TAPROOT_PATH}/${accountIndex}'`;
  const child = masterKey.derive(path);

  if (!child.publicKey) {
    throw new Error("Failed to derive public key");
  }

  return Buffer.from(child.publicKey).toString("hex");
}

export function deriveInheritanceAddressFromXpubs(
  userAccountXpub: string,
  heirAccountXpub: string,
  addressIndex: number,
  change: 0 | 1 = 0,
): string {
  const userAccountKey = parseExtendedKey(userAccountXpub);
  const heirAccountKey = parseExtendedKey(heirAccountXpub);

  const userChild = userAccountKey
    .deriveChild(change)
    .deriveChild(addressIndex);
  const heirChild = heirAccountKey
    .deriveChild(change)
    .deriveChild(addressIndex);

  if (!userChild.publicKey || !heirChild.publicKey) {
    throw new Error("Failed to derive multisig child keys");
  }

  const multisig = bitcoin.payments.p2ms({
    m: 2,
    pubkeys: [
      Buffer.from(userChild.publicKey),
      Buffer.from(heirChild.publicKey),
    ].sort(Buffer.compare),
    network: TESTNET_NETWORK,
  });

  const payment = bitcoin.payments.p2wsh({
    redeem: multisig,
    network: TESTNET_NETWORK,
  });

  if (!payment.address) {
    throw new Error("Failed to derive inheritance address");
  }

  return payment.address;
}

export function normalizeExtendedPublicKey(extendedKey: string): string {
  const key = parseExtendedKey(extendedKey);

  if (!key.publicExtendedKey) {
    throw new Error("Klíč neobsahuje veřejnou extended část");
  }

  return key.publicExtendedKey;
}
