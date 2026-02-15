/**
 * Test script for SLIP-39 implementation
 * Tests against official test vectors from:
 * https://raw.githubusercontent.com/trezor/python-shamir-mnemonic/master/vectors.json
 */

import { generateMnemonic, validateMnemonic, recoverMasterSecret, bytesToHex, hexToBytes, SLIP39_WORDLIST } from './slip39-full.js';

// Test vectors from the official SLIP-39 specification
const TEST_VECTORS = [
  {
    name: "Valid mnemonic without sharing (128 bits)",
    mnemonic: ["duckling enlarge academic academic agency result length solution fridge kidney coal piece deal husband erode duke ajar critical decision keyboard"],
    expectedSecret: "bb54aac4b89dc868ba37d9cc21b2cece",
    valid: true
  },
  {
    name: "Valid mnemonic without sharing (256 bits)",
    mnemonic: ["theory painting academic academic armed sweater year military elder discuss acne wildlife boring employer fused large satoshi bundle carbon diagnose anatomy hamster leaves tracks paces beyond phantom capital marvel lips brave detect luck"],
    expectedSecret: "989baf9dcaad5b10ca33dfd8cc75e42477025dce88ae83e75a230086a0e00e92",
    valid: true
  }
];

console.log('SLIP-39 Implementation Tests');
console.log('============================\n');

// Test 1: Wordlist length
console.log('Test 1: Wordlist length');
console.log(`  Wordlist has ${SLIP39_WORDLIST.length} words (expected: 1024)`);
console.log(`  ✓ ${SLIP39_WORDLIST.length === 1024 ? 'PASS' : 'FAIL'}\n`);

// Test 2: Validation of test vectors
console.log('Test 2: Validation of test vectors');
let validationPassCount = 0;
for (const vector of TEST_VECTORS) {
  const mnemonic = vector.mnemonic[0];
  const isValid = validateMnemonic(mnemonic);
  const passed = isValid === vector.valid;
  console.log(`  ${vector.name}: ${passed ? 'PASS' : 'FAIL'}`);
  if (!passed) {
    console.log(`    Expected: ${vector.valid}, Got: ${isValid}`);
  }
  if (passed) validationPassCount++;
}
console.log(`  Total: ${validationPassCount}/${TEST_VECTORS.length} passed\n`);

// Test 3: Round-trip (generate -> validate -> recover)
console.log('Test 3: Round-trip test (128-bit)');
try {
  const masterSecret = hexToBytes("bb54aac4b89dc868ba37d9cc21b2cece");
  const mnemonic = generateMnemonic(masterSecret);
  console.log(`  Generated mnemonic: ${mnemonic}`);
  console.log(`  Word count: ${mnemonic.split(' ').length}`);
  
  const isValid = validateMnemonic(mnemonic);
  console.log(`  Validation: ${isValid ? '✓ PASS' : '✗ FAIL'}`);
  
  const recovered = recoverMasterSecret(mnemonic);
  const recoveredHex = bytesToHex(recovered);
  console.log(`  Recovered secret: ${recoveredHex}`);
  
  const secretMatch = recoveredHex === "bb54aac4b89dc868ba37d9cc21b2cece";
  console.log(`  Secret match: ${secretMatch ? '✓ PASS' : '✗ FAIL'}`);
  
  console.log(`  Overall: ${isValid && secretMatch ? '✓ PASS' : '✗ FAIL'}\n`);
} catch (error) {
  console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  console.log(`  Overall: ✗ FAIL\n`);
}

// Test 4: Round-trip (256-bit)
console.log('Test 4: Round-trip test (256-bit)');
try {
  const masterSecret = hexToBytes("989baf9dcaad5b10ca33dfd8cc75e42477025dce88ae83e75a230086a0e00e92");
  const mnemonic = generateMnemonic(masterSecret);
  console.log(`  Generated mnemonic: ${mnemonic}`);
  console.log(`  Word count: ${mnemonic.split(' ').length}`);
  
  const isValid = validateMnemonic(mnemonic);
  console.log(`  Validation: ${isValid ? '✓ PASS' : '✗ FAIL'}`);
  
  const recovered = recoverMasterSecret(mnemonic);
  const recoveredHex = bytesToHex(recovered);
  console.log(`  Recovered secret: ${recoveredHex}`);
  
  const secretMatch = recoveredHex === "989baf9dcaad5b10ca33dfd8cc75e42477025dce88ae83e75a230086a0e00e92";
  console.log(`  Secret match: ${secretMatch ? '✓ PASS' : '✗ FAIL'}`);
  
  console.log(`  Overall: ${isValid && secretMatch ? '✓ PASS' : '✗ FAIL'}\n`);
} catch (error) {
  console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  console.log(`  Overall: ✗ FAIL\n`);
}

// Test 5: Invalid mnemonic detection
console.log('Test 5: Invalid mnemonic detection');
const invalidMnemonics = [
  "invalid mnemonic here",
  "academic acid", // too short
  "academic acid academic acid academic acid academic acid academic acid academic acid academic acid academic acid academic acid academic acid", // invalid words
];

let invalidPassCount = 0;
for (const mnemonic of invalidMnemonics) {
  const isValid = validateMnemonic(mnemonic);
  const passed = !isValid; // Should be invalid
  console.log(`  "${mnemonic.substring(0, 40)}...": ${passed ? '✓ PASS' : '✗ FAIL'}`);
  if (passed) invalidPassCount++;
}
console.log(`  Total: ${invalidPassCount}/${invalidMnemonics.length} passed\n`);

console.log('All tests completed!');
