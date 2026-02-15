import { HDKey } from "@scure/bip32";
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";
import * as ecc from "tiny-secp256k1";
import { bytesToHex, recoverMasterSecret } from "./src/utils/slip39-full.ts";

bitcoin.initEccLib(ecc);

const TESTNET_NETWORK = {
  messagePrefix: "\u0018Bitcoin Signed Message:\n",
  bech32: "tb",
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

const DERIVATION_PATH = "m/86'/1'/0'/0/0";

const mnemonic =
  "slow walnut academic academic deliver toxic velvet verify civil income evoke sugar capital bulge closet craft typical dramatic float type";
const expectedAddress =
  "tb1plwvsa98ect9g3f66wzdvl2mcjyh7a25ddzk7y5qnzkxh76k7cusq06l8as";

console.log("=== Test Address Generation ===");
console.log("Mnemonic:", mnemonic);
console.log("Expected address:", expectedAddress);

try {
  // Step 1: Recover master secret
  const masterSecret = recoverMasterSecret(mnemonic);
  const masterSecretHex = bytesToHex(masterSecret);
  console.log("\n1. Master secret:", masterSecretHex);
  console.log("   Length:", masterSecret.length, "bytes");

  // Step 2: Create HDKey
  const masterKey = HDKey.fromMasterSeed(masterSecret);
  console.log("\n2. HDKey created");
  console.log(
    "   Fingerprint:",
    masterKey.fingerprint.toString(16).padStart(8, "0"),
  );

  // Step 3: Derive path m/86'/1'/0'/0/0 (BIP-86 testnet first receive address)
  const path = DERIVATION_PATH;
  console.log("\n3. Deriving path:", path);

  const child = masterKey.derive(path);
  console.log("   Public key:", Buffer.from(child.publicKey).toString("hex"));

  // Step 4: Generate Taproot address
  const internalKey = Buffer.from(child.publicKey);
  const payment = bitcoin.payments.p2tr({
    internalPubkey: internalKey.slice(1, 33),
    network: TESTNET_NETWORK,
  });

  console.log("\n4. Generated address:", payment.address);
  console.log("   Expected address: ", expectedAddress);
  console.log("   Match:", payment.address === expectedAddress);

  if (payment.address !== expectedAddress) {
    process.exit(1);
  }
} catch (error) {
  console.error("Error:", error);
  process.exit(1);
}
