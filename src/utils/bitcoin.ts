import { HDKey } from "@scure/bip32";
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { getPublicKey, nip19 } from "nostr-tools";
import * as ecc from "tiny-secp256k1";
import { NETWORK_CONFIG, TAPROOT_PATH } from "../constants";
import type { SpendingConditions } from "../types";
import {
  recoverMasterSecret,
  generateMnemonic as slip39GenerateMnemonic,
  validateMnemonic,
} from "./slip39-full";
import { loadActiveNetwork } from "./storage";

bitcoin.initEccLib(ecc);

const MAINNET_BIP32 = {
  private: 0x0488ade4,
  public: 0x0488b21e,
};

export function getActiveBitcoinNetwork(): bitcoin.Network {
  const network = loadActiveNetwork();
  return NETWORK_CONFIG[network].bitcoinNetwork as bitcoin.Network;
}

function getActiveBip32Versions(): { private: number; public: number } {
  const network = getActiveBitcoinNetwork();
  return {
    private: network.bip32.private,
    public: network.bip32.public,
  };
}

function parseExtendedKey(extendedKey: string): HDKey {
  const activeBip32 = getActiveBip32Versions();

  if (extendedKey.startsWith("tpub") || extendedKey.startsWith("tprv")) {
    return HDKey.fromExtendedKey(extendedKey, activeBip32);
  }

  if (extendedKey.startsWith("xpub") || extendedKey.startsWith("xprv")) {
    return HDKey.fromExtendedKey(extendedKey, MAINNET_BIP32);
  }

  try {
    return HDKey.fromExtendedKey(extendedKey, activeBip32);
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

const NOSTR_DERIVATION_PATH = "m/44'/1237'/0'/0/0";

export interface NostrIdentity {
  derivationPath: string;
  nsec: string;
  npub: string;
}

export async function getMasterKeyFromMnemonic(
  mnemonic: string,
): Promise<HDKey> {
  const masterSecret = await recoverMasterSecret(mnemonic);
  return HDKey.fromMasterSeed(masterSecret, getActiveBip32Versions());
}

export async function deriveNostrIdentityFromMnemonic(
  mnemonic: string,
): Promise<NostrIdentity> {
  const masterSecret = await recoverMasterSecret(mnemonic);
  const nostrMasterKey = HDKey.fromMasterSeed(masterSecret);
  const child = nostrMasterKey.derive(NOSTR_DERIVATION_PATH);

  if (!child.privateKey) {
    throw new Error("Nepodařilo se odvodit Nostr privátní klíč");
  }

  const privateKey = new Uint8Array(child.privateKey);
  const publicKeyHex = getPublicKey(privateKey);

  return {
    derivationPath: NOSTR_DERIVATION_PATH,
    nsec: nip19.nsecEncode(privateKey),
    npub: nip19.npubEncode(publicKeyHex),
  };
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
    network: getActiveBitcoinNetwork(),
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
  branch = 0,
): string {
  const descriptor = deriveInheritanceDescriptorFromXpubs(
    userAccountXpub,
    heirAccountXpub,
    addressIndex,
    change,
    branch,
  );

  return descriptor.address;
}

export function deriveInheritanceDescriptorFromXpubs(
  userAccountXpub: string,
  heirAccountXpub: string,
  addressIndex: number,
  change: 0 | 1 = 0,
  branch = 0,
): {
  address: string;
  output: Buffer;
  witnessScript: Buffer;
  userPublicKey: Buffer;
  heirPublicKey: Buffer;
  multisigPubkeys: [Buffer, Buffer];
} {
  const userAccountKey = parseExtendedKey(userAccountXpub);
  const heirAccountKey = parseExtendedKey(heirAccountXpub);

  const userChild = userAccountKey
    .deriveChild(branch)
    .deriveChild(change)
    .deriveChild(addressIndex);
  const heirChild = heirAccountKey
    .deriveChild(branch)
    .deriveChild(change)
    .deriveChild(addressIndex);

  if (!userChild.publicKey || !heirChild.publicKey) {
    throw new Error("Failed to derive multisig child keys");
  }

  const userPublicKey = Buffer.from(userChild.publicKey);
  const heirPublicKey = Buffer.from(heirChild.publicKey);
  const multisigPubkeys = [
    Buffer.from(userPublicKey),
    Buffer.from(heirPublicKey),
  ].sort(Buffer.compare) as [Buffer, Buffer];

  const multisig = bitcoin.payments.p2ms({
    m: 2,
    pubkeys: multisigPubkeys,
    network: getActiveBitcoinNetwork(),
  });

  const payment = bitcoin.payments.p2wsh({
    redeem: multisig,
    network: getActiveBitcoinNetwork(),
  });

  if (!payment.address) {
    throw new Error("Failed to derive inheritance address");
  }

  if (!payment.output || !multisig.output) {
    throw new Error("Failed to derive inheritance script");
  }

  return {
    address: payment.address,
    output: Buffer.from(payment.output),
    witnessScript: Buffer.from(multisig.output),
    userPublicKey,
    heirPublicKey,
    multisigPubkeys,
  };
}

export function deriveInheritanceTimelockedAddressFromXpubs(
  userAccountXpub: string,
  heirAccountXpub: string,
  addressIndex: number,
  conditions: SpendingConditions,
  change: 0 | 1 = 0,
): string {
  const descriptor = deriveInheritanceTimelockedDescriptorFromXpubs(
    userAccountXpub,
    heirAccountXpub,
    addressIndex,
    conditions,
    change,
  );

  return descriptor.address;
}

export function deriveInheritanceTimelockedDescriptorFromXpubs(
  userAccountXpub: string,
  heirAccountXpub: string,
  addressIndex: number,
  conditions: SpendingConditions,
  change: 0 | 1 = 0,
): {
  address: string;
  output: Buffer;
  witnessScript: Buffer;
  userPublicKey: Buffer;
  heirPublicKey: Buffer;
  multisigPubkeys: [Buffer, Buffer];
} {
  const userAccountKey = parseExtendedKey(userAccountXpub);
  const heirAccountKey = parseExtendedKey(heirAccountXpub);

  const userChild = userAccountKey
    .deriveChild(0)
    .deriveChild(change)
    .deriveChild(addressIndex);
  const heirChild = heirAccountKey
    .deriveChild(0)
    .deriveChild(change)
    .deriveChild(addressIndex);

  if (!userChild.publicKey || !heirChild.publicKey) {
    throw new Error("Failed to derive timelocked inheritance child keys");
  }

  const userPublicKey = Buffer.from(userChild.publicKey);
  const heirPublicKey = Buffer.from(heirChild.publicKey);
  const multisigPubkeys = [
    Buffer.from(userPublicKey),
    Buffer.from(heirPublicKey),
  ].sort(Buffer.compare) as [Buffer, Buffer];

  const witnessScript = bitcoin.script.compile([
    bitcoin.opcodes.OP_IF,
    bitcoin.script.number.encode(Math.max(0, conditions.multisigAfterBlocks)),
    bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
    bitcoin.opcodes.OP_DROP,
    bitcoin.opcodes.OP_2,
    multisigPubkeys[0],
    multisigPubkeys[1],
    bitcoin.opcodes.OP_2,
    bitcoin.opcodes.OP_CHECKMULTISIG,
    bitcoin.opcodes.OP_ELSE,
    bitcoin.opcodes.OP_IF,
    bitcoin.script.number.encode(Math.max(0, conditions.userOnlyAfterBlocks)),
    bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
    bitcoin.opcodes.OP_DROP,
    userPublicKey,
    bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_ELSE,
    bitcoin.script.number.encode(Math.max(0, conditions.heirOnlyAfterBlocks)),
    bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
    bitcoin.opcodes.OP_DROP,
    heirPublicKey,
    bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_ENDIF,
    bitcoin.opcodes.OP_ENDIF,
  ]);

  const payment = bitcoin.payments.p2wsh({
    redeem: { output: witnessScript },
    network: getActiveBitcoinNetwork(),
  });

  if (!payment.address || !payment.output) {
    throw new Error("Failed to derive timelocked inheritance address");
  }

  return {
    address: payment.address,
    output: Buffer.from(payment.output),
    witnessScript: Buffer.from(witnessScript),
    userPublicKey,
    heirPublicKey,
    multisigPubkeys,
  };
}

export function normalizeExtendedPublicKey(extendedKey: string): string {
  const key = parseExtendedKey(extendedKey);

  if (!key.publicExtendedKey) {
    throw new Error("Klíč neobsahuje veřejnou extended část");
  }

  return key.publicExtendedKey;
}
