import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';

const ROUND_COUNT = 4;
const ITERATION_COUNT = 10000;

function getIterationsPerRound(iterationExponent) {
  return Math.floor((ITERATION_COUNT << iterationExponent) / ROUND_COUNT);
}

function buildSalt(identifier, extendable) {
  const customization = new TextEncoder().encode('shamir');
  const salt = new Uint8Array(customization.length + 2);
  salt.set(customization, 0);
  salt[customization.length] = (identifier >> 8) & 0xFF;
  salt[customization.length + 1] = identifier & 0xFF;
  return salt;
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

// Test encrypt then decrypt
const originalData = new Uint8Array([0xbb, 0x54, 0xaa, 0xc4, 0xb8, 0x9d, 0xc8, 0x68, 0xba, 0x37, 0xd9, 0xcc, 0x21, 0xb2, 0xce, 0xce]);
const passphrase = 'TREZOR';
const identifier = 7945;
const iterationExponent = 0;
const extendable = false;

console.log("Original data:", Array.from(originalData).map(b => b.toString(16).padStart(2, '0')).join(''));

// Encrypt
const salt = buildSalt(identifier, extendable);
const half = originalData.length / 2;
let L = originalData.slice(0, half);
let R = originalData.slice(half);

console.log("\n=== ENCRYPT ===");
console.log("Start L:", Array.from(L).map(b => b.toString(16).padStart(2, '0')).join(''));
console.log("Start R:", Array.from(R).map(b => b.toString(16).padStart(2, '0')).join(''));

for (let i = 0; i < ROUND_COUNT; i++) {
  const F = feistelRound(i, passphrase, iterationExponent, salt, R);
  const newR = new Uint8Array(half);
  for (let j = 0; j < half; j++) {
    newR[j] = L[j] ^ F[j];
  }
  console.log(`Round ${i}: F=${Array.from(F).map(b => b.toString(16).padStart(2, '0')).join('')}, newR=${Array.from(newR).map(b => b.toString(16).padStart(2, '0')).join('')}`);
  L = R.slice();
  R = newR;
}

const encrypted = new Uint8Array(originalData.length);
encrypted.set(R, 0);
encrypted.set(L, half);
console.log("\nEncrypted:", Array.from(encrypted).map(b => b.toString(16).padStart(2, '0')).join(''));
console.log("Expected:   11bc609d21747c49ba78c0701293e417");

// Now decrypt
let Ld = encrypted.slice(0, half);
let Rd = encrypted.slice(half);

console.log("\n=== DECRYPT ===");
console.log("Start L:", Array.from(Ld).map(b => b.toString(16).padStart(2, '0')).join(''));
console.log("Start R:", Array.from(Rd).map(b => b.toString(16).padStart(2, '0')).join(''));

for (let i = ROUND_COUNT - 1; i >= 0; i--) {
  const F = feistelRound(i, passphrase, iterationExponent, salt, Rd);
  const newR = new Uint8Array(half);
  for (let j = 0; j < half; j++) {
    newR[j] = Ld[j] ^ F[j];
  }
  console.log(`Round ${i}: F=${Array.from(F).map(b => b.toString(16).padStart(2, '0')).join('')}, newR=${Array.from(newR).map(b => b.toString(16).padStart(2, '0')).join('')}`);
  Ld = Rd.slice();
  Rd = newR;
}

const decrypted = new Uint8Array(originalData.length);
decrypted.set(Rd, 0);
decrypted.set(Ld, half);
console.log("\nDecrypted:", Array.from(decrypted).map(b => b.toString(16).padStart(2, '0')).join(''));
console.log("Original:  ", Array.from(originalData).map(b => b.toString(16).padStart(2, '0')).join(''));
console.log("Match:", Array.from(decrypted).every((b, i) => b === originalData[i]));