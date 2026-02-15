const { HDKey } = require('@scure/bip32');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const { recoverMasterSecret, bytesToHex } = require('./src/utils/slip39-full.ts');
const { Buffer } = require('buffer');

bitcoin.initEccLib(ecc);

const TESTNET_NETWORK = {
  messagePrefix: '\u0018Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

const TAPROOT_PATH = "m/86'/1'/0'/0";

const mnemonic = "duckling enlarge academic academic agency result length solution fridge kidney coal piece deal husband erode duke ajar critical decision keyboard";
const expectedAddress = "tb1peqvzlxs9etc4pxfe74r0nyf5vsrqwy73zf8cc7aga3pd9rpxxv8q9fe9r2";

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
  console.log("   Fingerprint:", Buffer.from(masterKey.fingerprint).toString('hex'));
  
  // Step 3: Derive path m/86'/1'/0'/0/0/0
  const path = `${TAPROOT_PATH}/0/0`;
  console.log("\n3. Deriving path:", path);
  
  const child = masterKey.derive(path);
  console.log("   Public key:", Buffer.from(child.publicKey).toString('hex'));
  
  // Step 4: Generate Taproot address
  const internalKey = Buffer.from(child.publicKey);
  const payment = bitcoin.payments.p2tr({
    internalPubkey: internalKey.slice(1, 33),
    network: TESTNET_NETWORK,
  });
  
  console.log("\n4. Generated address:", payment.address);
  console.log("   Expected address: ", expectedAddress);
  console.log("   Match:", payment.address === expectedAddress);
  
} catch (error) {
  console.error("Error:", error);
  process.exit(1);
}