import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { SLIP39_WORDLIST } from './src/utils/slip39-full.ts';

const ROUND_COUNT = 4;
const ITERATION_COUNT = 10000;

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getIterationsPerRound(iterationExponent) {
  return Math.floor((ITERATION_COUNT << iterationExponent) / ROUND_COUNT);
}

function buildSalt(identifier, extendable) {
  if (extendable) {
    return new Uint8Array(0);
  } else {
    const customization = new TextEncoder().encode('shamir');
    const salt = new Uint8Array(customization.length + 2);
    salt.set(customization, 0);
    salt[customization.length] = (identifier >> 8) & 0xFF;
    salt[customization.length + 1] = identifier & 0xFF;
    return salt;
  }
}

function feistelRound(round, passphrase, iterationExponent, salt, R) {
  const iterations = getIterationsPerRound(iterationExponent);
  const passphraseBytes = new TextEncoder().encode(passphrase.normalize('NFKD'));
  
  const input = new Uint8Array(1 + passphraseBytes.length);
  input[0] = round;
  input.set(passphraseBytes, 1);
  
  const fullSalt = new Uint8Array(salt.length + R.length);
  fullSalt.set(salt, 0);
  fullSalt.set(R, salt.length);
  
  return pbkdf2(sha256, input, fullSalt, { c: iterations, dkLen: R.length });
}

function feistelCipherDecrypt(data, passphrase, iterationExponent, identifier, extendable) {
  const half = data.length / 2;
  let L = data.slice(0, half);
  let R = data.slice(half);
  const salt = buildSalt(identifier, extendable);
  
  console.log("  Decrypt - Input:", bytesToHex(data));
  console.log("  Decrypt - L:", bytesToHex(L));
  console.log("  Decrypt - R:", bytesToHex(R));
  console.log("  Decrypt - Salt:", bytesToHex(salt));
  
  for (let i = ROUND_COUNT - 1; i >= 0; i--) {
    const F = feistelRound(i, passphrase, iterationExponent, salt, R);
    console.log(`  Decrypt - Round ${i}, F:`, bytesToHex(F));
    
    const newR = new Uint8Array(half);
    for (let j = 0; j < half; j++) {
      newR[j] = L[j] ^ F[j];
    }
    console.log(`  Decrypt - Round ${i}, newR:`, bytesToHex(newR));
    
    L = R;
    R = newR;
  }
  
  const result = new Uint8Array(data.length);
  result.set(R, 0);
  result.set(L, half);
  
  console.log("  Decrypt - Output:", bytesToHex(result));
  return result;
}

// Test
const mnemonic = "duckling enlarge academic academic agency result length solution fridge kidney coal piece deal husband erode duke ajar critical decision keyboard";
const expectedMasterSecret = "bb54aac4b89dc868ba37d9cc21b2cece";

console.log("=== Debug SLIP-39 Decryption ===");
console.log("Mnemonic:", mnemonic);

// Parse mnemonic
const words = mnemonic.split(/\s+/);
const wordIndices = words.map(w => SLIP39_WORDLIST.indexOf(w.toLowerCase()));

console.log("\nWord indices:", wordIndices);

// Decode metadata
const identifier = ((wordIndices[0] << 5) | ((wordIndices[1] >> 5) & 0x1F)) & 0x7FFF;
const extendable = ((wordIndices[1] >> 4) & 1) === 1;
const iterationExponent = wordIndices[1] & 0x0F;

console.log("\nMetadata:");
console.log("  Identifier:", identifier, "(0x" + identifier.toString(16) + ")");
console.log("  Extendable:", extendable);
console.log("  Iteration exponent:", iterationExponent);

// Extract encrypted secret
const valueWords = wordIndices.slice(4, -3);
console.log("\nValue words:", valueWords);

// Convert to bytes
const totalValueBits = valueWords.length * 10;
const paddingBits = totalValueBits % 16;
const dataBits = totalValueBits - paddingBits;
const valueByteCount = dataBits / 8;

let valueInt = 0n;
for (const wordIdx of valueWords) {
  valueInt = valueInt * 1024n + BigInt(wordIdx);
}

const maxValue = (1n << BigInt(dataBits)) - 1n;
if (valueInt > maxValue) {
  console.log("Warning: Padding bits not zero!");
}

const encryptedSecret = new Uint8Array(valueByteCount);
for (let i = 0; i < valueByteCount; i++) {
  encryptedSecret[valueByteCount - 1 - i] = Number(valueInt & 0xFFn);
  valueInt >>= 8n;
}

console.log("\nEncrypted secret:", bytesToHex(encryptedSecret));
console.log("Expected encrypted: 11bc609d21747c49ba78c0701293e417 (from earlier debug)");

// Decrypt
console.log("\n=== Decrypting ===");
const masterSecret = feistelCipherDecrypt(encryptedSecret, 'TREZOR', iterationExponent, identifier, extendable);

console.log("\n=== Result ===");
console.log("Master secret:", bytesToHex(masterSecret));
console.log("Expected:     ", expectedMasterSecret);
console.log("Match:", bytesToHex(masterSecret) === expectedMasterSecret);