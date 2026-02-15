import slip39 from 'slip39';

const mnemonic = "guard stay academic academic cylinder swing unhappy deal endless penalty class emphasis gesture away review verify thunder oasis plan triumph";

console.log("Testing slip39 library...");
console.log("Mnemonic:", mnemonic);

try {
  // Note: This will fail in Node.js because slip39 requires crypto module
  // But let's see what happens
  const isValid = slip39.validateMnemonic(mnemonic);
  console.log("Valid:", isValid);
  
  const masterSecret = slip39.recoverSecret([mnemonic], "");
  console.log("Master secret:", Buffer.from(masterSecret).toString('hex'));
} catch (error) {
  console.error("Error:", error.message);
  console.log("\nExpected - slip39 library requires Node.js crypto which doesn't work in browser.");
  console.log("We need to either:");
  console.log("1. Use our custom implementation (which is correct per spec)");
  console.log("2. Find a browser-compatible SLIP-39 library");
  console.log("3. Patch slip39 library to work in browser");
}