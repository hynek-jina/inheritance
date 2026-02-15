/**
 * SLIP-39 (Shamir's Secret Sharing for Mnemonic Codes) Implementation
 * 
 * Compatible with SLIP-39 specification:
 * https://github.com/satoshilabs/slips/blob/master/slip-0039.md
 * 
 * Features:
 * - Single-share (1-of-1) generation and recovery
 * - 128-bit (20 words) and 256-bit (33 words) master secrets
 * - Feistel cipher encryption with PBKDF2
 * - RS1024 checksum
 * 
 * Uses browser-compatible APIs:
 * - Web Crypto API for random numbers
 * - @noble/hashes for SHA256, PBKDF2
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';

// ============================================================================
// SLIP-39 Wordlist (1024 words)
// ============================================================================

export const SLIP39_WORDLIST = [
  "academic", "acid", "acne", "acquire", "acrobat", "activity", "actress", "adapt", "adequate", "adjust",
  "admit", "adorn", "adult", "advance", "advocate", "afraid", "again", "agency", "agree", "aide",
  "aircraft", "airline", "airport", "ajar", "alarm", "album", "alcohol", "alien", "alive", "alpha",
  "already", "alto", "aluminum", "always", "amazing", "ambition", "amount", "amuse", "analysis", "anatomy",
  "ancestor", "ancient", "angel", "angry", "animal", "answer", "antenna", "anxiety", "apart", "aquatic",
  "arcade", "arena", "argue", "armed", "artist", "artwork", "aspect", "auction", "august", "aunt",
  "average", "aviation", "avoid", "award", "away", "axis", "axle", "beam", "beard", "beaver",
  "become", "bedroom", "behavior", "being", "believe", "belong", "benefit", "best", "beyond", "bike",
  "biology", "birthday", "bishop", "black", "blanket", "blessing", "blimp", "blind", "blue", "body",
  "bolt", "boring", "born", "both", "boundary", "bracelet", "branch", "brave", "breathe", "briefing",
  "broken", "brother", "browser", "bucket", "budget", "building", "bulb", "bulge", "bumpy", "bundle",
  "burden", "burning", "busy", "buyer", "cage", "calcium", "camera", "campus", "canyon", "capacity",
  "capital", "capture", "carbon", "cards", "careful", "cargo", "carpet", "carve", "category", "cause",
  "ceiling", "center", "ceramic", "champion", "change", "charity", "check", "chemical", "chest", "chew",
  "chubby", "cinema", "civil", "class", "clay", "cleanup", "client", "climate", "clinic", "clock",
  "clogs", "closet", "clothes", "club", "cluster", "coal", "coastal", "coding", "column", "company",
  "corner", "costume", "counter", "course", "cover", "cowboy", "cradle", "craft", "crazy", "credit",
  "cricket", "criminal", "crisis", "critical", "crowd", "crucial", "crunch", "crush", "crystal", "cubic",
  "cultural", "curious", "curly", "custody", "cylinder", "daisy", "damage", "dance", "darkness", "database",
  "daughter", "deadline", "deal", "debris", "debut", "decent", "decision", "declare", "decorate", "decrease",
  "deliver", "demand", "density", "deny", "depart", "depend", "depict", "deploy", "describe", "desert",
  "desire", "desktop", "destroy", "detailed", "detect", "device", "devote", "diagnose", "dictate", "diet",
  "dilemma", "diminish", "dining", "diploma", "disaster", "discuss", "disease", "dish", "dismiss", "display",
  "distance", "dive", "divorce", "document", "domain", "domestic", "dominant", "dough", "downtown", "dragon",
  "dramatic", "dream", "dress", "drift", "drink", "drove", "drug", "dryer", "duckling", "duke",
  "duration", "dwarf", "dynamic", "early", "earth", "easel", "easy", "echo", "eclipse", "ecology",
  "edge", "editor", "educate", "either", "elbow", "elder", "election", "elegant", "element", "elephant",
  "elevator", "elite", "else", "email", "emerald", "emission", "emperor", "emphasis", "employer", "empty",
  "ending", "endless", "endorse", "enemy", "energy", "enforce", "engage", "enjoy", "enlarge", "entrance",
  "envelope", "envy", "epidemic", "episode", "equation", "equip", "eraser", "erode", "escape", "estate",
  "estimate", "evaluate", "evening", "evidence", "evil", "evoke", "exact", "example", "exceed", "exchange",
  "exclude", "excuse", "execute", "exercise", "exhaust", "exotic", "expand", "expect", "explain", "express",
  "extend", "extra", "eyebrow", "facility", "fact", "failure", "faint", "fake", "false", "family",
  "famous", "fancy", "fangs", "fantasy", "fatal", "fatigue", "favorite", "fawn", "fiber", "fiction",
  "filter", "finance", "findings", "finger", "firefly", "firm", "fiscal", "fishing", "fitness", "flame",
  "flash", "flavor", "flea", "flexible", "flip", "float", "floral", "fluff", "focus", "forbid",
  "force", "forecast", "forget", "formal", "fortune", "forward", "founder", "fraction", "fragment", "frequent",
  "freshman", "friar", "fridge", "friendly", "frost", "froth", "frozen", "fumes", "funding", "furl",
  "fused", "galaxy", "game", "garbage", "garden", "garlic", "gasoline", "gather", "general", "genius",
  "genre", "genuine", "geology", "gesture", "glad", "glance", "glasses", "glen", "glimpse", "goat",
  "golden", "graduate", "grant", "grasp", "gravity", "gray", "greatest", "grief", "grill", "grin",
  "grocery", "gross", "group", "grownup", "grumpy", "guard", "guest", "guilt", "guitar", "gums",
  "hairy", "hamster", "hand", "hanger", "harvest", "have", "havoc", "hawk", "hazard", "headset",
  "health", "hearing", "heat", "helpful", "herald", "herd", "hesitate", "hobo", "holiday", "holy",
  "home", "hormone", "hospital", "hour", "huge", "human", "humidity", "hunting", "husband", "hush",
  "husky", "hybrid", "idea", "identify", "idle", "image", "impact", "imply", "improve", "impulse",
  "include", "income", "increase", "index", "indicate", "industry", "infant", "inform", "inherit", "injury",
  "inmate", "insect", "inside", "install", "intend", "intimate", "invasion", "involve", "iris", "island",
  "isolate", "item", "ivory", "jacket", "jerky", "jewelry", "join", "judicial", "juice", "jump",
  "junction", "junior", "junk", "jury", "justice", "kernel", "keyboard", "kidney", "kind", "kitchen",
  "knife", "knit", "laden", "ladle", "ladybug", "lair", "lamp", "language", "large", "laser",
  "laundry", "lawsuit", "leader", "leaf", "learn", "leaves", "lecture", "legal", "legend", "legs",
  "lend", "length", "level", "liberty", "library", "license", "lift", "likely", "lilac", "lily",
  "lips", "liquid", "listen", "literary", "living", "lizard", "loan", "lobe", "location", "losing",
  "loud", "loyalty", "luck", "lunar", "lunch", "lungs", "luxury", "lying", "lyrics", "machine",
  "magazine", "maiden", "mailman", "main", "makeup", "making", "mama", "manager", "mandate", "mansion",
  "manual", "marathon", "march", "market", "marvel", "mason", "material", "math", "maximum", "mayor",
  "meaning", "medal", "medical", "member", "memory", "mental", "merchant", "merit", "method", "metric",
  "midst", "mild", "military", "mineral", "minister", "miracle", "mixed", "mixture", "mobile", "modern",
  "modify", "moisture", "moment", "morning", "mortgage", "mother", "mountain", "mouse", "move", "much",
  "mule", "multiple", "muscle", "museum", "music", "mustang", "nail", "national", "necklace", "negative",
  "nervous", "network", "news", "nuclear", "numb", "numerous", "nylon", "oasis", "obesity", "object",
  "observe", "obtain", "ocean", "often", "olympic", "omit", "oral", "orange", "orbit", "order",
  "ordinary", "organize", "ounce", "oven", "overall", "owner", "paces", "pacific", "package", "paid",
  "painting", "pajamas", "pancake", "pants", "papa", "paper", "parcel", "parking", "party", "patent",
  "patrol", "payment", "payroll", "peaceful", "peanut", "peasant", "pecan", "penalty", "pencil", "percent",
  "perfect", "permit", "petition", "phantom", "pharmacy", "photo", "phrase", "physics", "pickup", "picture",
  "piece", "pile", "pink", "pipeline", "pistol", "pitch", "plains", "plan", "plastic", "platform",
  "playoff", "pleasure", "plot", "plunge", "practice", "prayer", "preach", "predator", "pregnant", "premium",
  "prepare", "presence", "prevent", "priest", "primary", "priority", "prisoner", "privacy", "prize", "problem",
  "process", "profile", "program", "promise", "prospect", "provide", "prune", "public", "pulse", "pumps",
  "punish", "puny", "pupal", "purchase", "purple", "python", "quantity", "quarter", "quick", "quiet",
  "race", "racism", "radar", "railroad", "rainbow", "raisin", "random", "ranked", "rapids", "raspy",
  "reaction", "realize", "rebound", "rebuild", "recall", "receiver", "recover", "regret", "regular", "reject",
  "relate", "remember", "remind", "remove", "render", "repair", "repeat", "replace", "require", "rescue",
  "research", "resident", "response", "result", "retailer", "retreat", "reunion", "revenue", "review", "reward",
  "rhyme", "rhythm", "rich", "rival", "river", "robin", "rocky", "romantic", "romp", "roster",
  "round", "royal", "ruin", "ruler", "rumor", "sack", "safari", "salary", "salon", "salt",
  "satisfy", "satoshi", "saver", "says", "scandal", "scared", "scatter", "scene", "scholar", "science",
  "scout", "scramble", "screw", "script", "scroll", "seafood", "season", "secret", "security", "segment",
  "senior", "shadow", "shaft", "shame", "shaped", "sharp", "shelter", "sheriff", "short", "should",
  "shrimp", "sidewalk", "silent", "silver", "similar", "simple", "single", "sister", "skin", "skunk",
  "slap", "slavery", "sled", "slice", "slim", "slow", "slush", "smart", "smear", "smell",
  "smirk", "smith", "smoking", "smug", "snake", "snapshot", "sniff", "society", "software", "soldier",
  "solution", "soul", "source", "space", "spark", "speak", "species", "spelling", "spend", "spew",
  "spider", "spill", "spine", "spirit", "spit", "spray", "sprinkle", "square", "squeeze", "stadium",
  "staff", "standard", "starting", "station", "stay", "steady", "step", "stick", "stilt", "story",
  "strategy", "strike", "style", "subject", "submit", "sugar", "suitable", "sunlight", "superior", "surface",
  "surprise", "survive", "sweater", "swimming", "swing", "switch", "symbolic", "sympathy", "syndrome", "system",
  "tackle", "tactics", "tadpole", "talent", "task", "taste", "taught", "taxi", "teacher", "teammate",
  "teaspoon", "temple", "tenant", "tendency", "tension", "terminal", "testify", "texture", "thank", "that",
  "theater", "theory", "therapy", "thorn", "threaten", "thumb", "thunder", "ticket", "tidy", "timber",
  "timely", "ting", "tofu", "together", "tolerate", "total", "toxic", "tracks", "traffic", "training",
  "transfer", "trash", "traveler", "treat", "trend", "trial", "tricycle", "trip", "triumph", "trouble",
  "true", "trust", "twice", "twin", "type", "typical", "ugly", "ultimate", "umbrella", "uncover",
  "undergo", "unfair", "unfold", "unhappy", "union", "universe", "unkind", "unknown", "unusual", "unwrap",
  "upgrade", "upstairs", "username", "usher", "usual", "valid", "valuable", "vampire", "vanish", "various",
  "vegan", "velvet", "venture", "verdict", "verify", "very", "veteran", "vexed", "victim", "video",
  "view", "vintage", "violence", "viral", "visitor", "visual", "vitamins", "vocal", "voice", "volume",
  "voter", "voting", "walnut", "warmth", "warn", "watch", "wavy", "wealthy", "weapon", "webcam",
  "welcome", "welfare", "western", "width", "wildlife", "window", "wine", "wireless", "wisdom", "withdraw",
  "wits", "wolf", "woman", "work", "worthy", "wrap", "wrist", "writing", "wrote", "year",
  "yelp", "yield", "yoga", "zero"
];

// Word to index map for fast lookup
const WORD_TO_INDEX = new Map<string, number>();
SLIP39_WORDLIST.forEach((word, index) => {
  WORD_TO_INDEX.set(word, index);
});

// ============================================================================
// Constants
// ============================================================================

// RS1024 checksum generator constants
const RS1024_GEN = [
  0xE0E040, 0x1C1C080, 0x3838100, 0x7070200, 0xE0E0009,
  0x1C0C2412, 0x38086C24, 0x3090FC48, 0x21B1F890, 0x3F3F120
];

// Iteration count for PBKDF2
const ITERATION_COUNT = 10000;

// Round count for Feistel cipher
const ROUND_COUNT = 4;

// ============================================================================
// RS1024 Checksum Functions
// ============================================================================

function rs1024Polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const b = chk >> 20;
    chk = ((chk & 0xFFFFF) << 10) ^ v;
    for (let i = 0; i < 10; i++) {
      chk ^= ((b >> i) & 1) ? RS1024_GEN[i] : 0;
    }
  }
  return chk;
}

function rs1024CreateChecksum(customization: string, data: number[]): number[] {
  const values = customization.split('').map(c => c.charCodeAt(0)).concat(data).concat([0, 0, 0]);
  const polymod = rs1024Polymod(values) ^ 1;
  return [
    (polymod >> 20) & 0x3FF,
    (polymod >> 10) & 0x3FF,
    polymod & 0x3FF
  ];
}

function rs1024VerifyChecksum(customization: string, data: number[]): boolean {
  const values = customization.split('').map(c => c.charCodeAt(0)).concat(data);
  return rs1024Polymod(values) === 1;
}

// ============================================================================
// Bit Manipulation Functions (kept for potential future use)
// ============================================================================

// These functions are available but not currently used:
// - bytesToBits: Convert bytes to bit array
// - bitsToBytes: Convert bit array to bytes  
// - bitsToWords: Convert bits to 10-bit words with padding
// - wordsToBits: Convert 10-bit words to bits

// ============================================================================
// Random Generation
// ============================================================================

function randomBytes(length: number): Uint8Array {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

function generateIdentifier(): number {
  const array = new Uint8Array(2);
  crypto.getRandomValues(array);
  return ((array[0] << 8) | array[1]) & 0x7FFF;
}

// ============================================================================
// PBKDF2 and Encryption Functions
// ============================================================================

// Per SLIP-39 spec: iterations per round = (BASE_ITERATION_COUNT << iteration_exponent) / ROUND_COUNT
function getIterationsPerRound(iterationExponent: number): number {
  return Math.floor((ITERATION_COUNT << iterationExponent) / ROUND_COUNT);
}

// Build salt per spec
function buildSalt(identifier: number, extendable: boolean): Uint8Array {
  if (extendable) {
    // For extendable, salt is empty
    return new Uint8Array(0);
  } else {
    // Non-extendable: customization string "shamir" + identifier as 2 bytes
    const customization = new TextEncoder().encode('shamir');
    const salt = new Uint8Array(customization.length + 2);
    salt.set(customization, 0);
    salt[customization.length] = (identifier >> 8) & 0xFF;
    salt[customization.length + 1] = identifier & 0xFF;
    return salt;
  }
}

// Round function uses PBKDF2 per SLIP-39 spec
function feistelRound(
  round: number, 
  passphrase: string, 
  iterationExponent: number, 
  salt: Uint8Array, 
  R: Uint8Array
): Uint8Array {
  const iterations = getIterationsPerRound(iterationExponent);
  const passphraseBytes = new TextEncoder().encode(passphrase.normalize('NFKD'));
  
  // Input: bytes([round]) + passphrase
  const input = new Uint8Array(1 + passphraseBytes.length);
  input[0] = round;
  input.set(passphraseBytes, 1);
  
  // Salt: salt + R
  const fullSalt = new Uint8Array(salt.length + R.length);
  fullSalt.set(salt, 0);
  fullSalt.set(R, salt.length);
  
  // PBKDF2 with output length = len(R)
  return pbkdf2(sha256, input, fullSalt, { c: iterations, dkLen: R.length });
}

function feistelCipherEncrypt(
  data: Uint8Array, 
  passphrase: string, 
  iterationExponent: number, 
  identifier: number, 
  extendable: boolean
): Uint8Array {
  if (data.length % 2 !== 0) {
    throw new Error('Data length must be even');
  }
  
  const half = data.length / 2;
  let L = data.slice(0, half);
  let R = data.slice(half);
  const salt = buildSalt(identifier, extendable);
  
  for (let i = 0; i < ROUND_COUNT; i++) {
    const F = feistelRound(i, passphrase, iterationExponent, salt, R);
    const newR = new Uint8Array(half);
    for (let j = 0; j < half; j++) {
      newR[j] = L[j] ^ F[j];
    }
    L = R;
    R = newR;
  }
  
  // Return R + L (swapped)
  const result = new Uint8Array(data.length);
  result.set(R, 0);
  result.set(L, half);
  return result;
}

function feistelCipherDecrypt(
  data: Uint8Array, 
  passphrase: string, 
  iterationExponent: number, 
  identifier: number, 
  extendable: boolean
): Uint8Array {
  if (data.length % 2 !== 0) {
    throw new Error('Data length must be even');
  }
  
  const half = data.length / 2;
  // Data is in format R + L (swapped from encrypt)
  // So we start with: L_current = R_final, R_current = L_final
  let L = data.slice(0, half);  // This is actually R from the end of encryption
  let R = data.slice(half);      // This is actually L from the end of encryption
  const salt = buildSalt(identifier, extendable);
  
  // Decrypt: reverse rounds
  for (let i = ROUND_COUNT - 1; i >= 0; i--) {
    const F = feistelRound(i, passphrase, iterationExponent, salt, R);
    const newR = new Uint8Array(half);
    for (let j = 0; j < half; j++) {
      newR[j] = L[j] ^ F[j];
    }
    L = R;
    R = newR;
  }
  
  // At the end, L contains original R, R contains original L
  // Return L + R (original order)
  const result = new Uint8Array(data.length);
  result.set(R, 0);  // R now contains original L
  result.set(L, half);  // L now contains original R
  return result;
}

// ============================================================================
// Share Encoding/Decoding
// ============================================================================

interface ShareMetadata {
  identifier: number;
  extendable: boolean;
  iterationExponent: number;
  groupIndex: number;
  groupThreshold: number;
  groupCount: number;
  memberIndex: number;
  memberThreshold: number;
}

function encodeMetadata(metadata: ShareMetadata): number[] {
  const { identifier, extendable, iterationExponent, groupIndex, groupThreshold, groupCount, memberIndex, memberThreshold } = metadata;
  const words: number[] = [];
  
  // Word 0: identifier bits 5-14
  words.push((identifier >> 5) & 0x3FF);
  
  // Word 1: identifier bits 0-4 + extendable + iterationExponent
  words.push(
    ((identifier & 0x1F) << 5) |
    ((extendable ? 1 : 0) << 4) |
    (iterationExponent & 0x0F)
  );
  
  // Word 2: groupThreshold-1 (4 bits) + groupCount-1 (4 bits) + groupIndex (4 bits) upper 4 bits
  // Actually per spec: GI (4) + Gt (4) + g upper 2 bits
  words.push(
    ((groupIndex & 0x0F) << 6) |
    (((groupThreshold - 1) & 0x0F) << 2) |
    (((groupCount - 1) & 0x0C) >> 2)
  );
  
  // Word 3: g lower 2 bits + I (4) + t (4)
  words.push(
    (((groupCount - 1) & 0x03) << 8) |
    ((memberIndex & 0x0F) << 4) |
    ((memberThreshold - 1) & 0x0F)
  );
  
  return words;
}

function decodeMetadata(wordIndices: number[]): ShareMetadata {
  const identifier = ((wordIndices[0] << 5) | ((wordIndices[1] >> 5) & 0x1F)) & 0x7FFF;
  const extendable = ((wordIndices[1] >> 4) & 1) === 1;
  const iterationExponent = wordIndices[1] & 0x0F;
  
  const groupIndex = (wordIndices[2] >> 6) & 0x0F;
  const groupThreshold = ((wordIndices[2] >> 2) & 0x0F) + 1;
  const groupCount = (((wordIndices[2] & 0x03) << 2) | ((wordIndices[3] >> 8) & 0x03)) + 1;
  const memberIndex = (wordIndices[3] >> 4) & 0x0F;
  const memberThreshold = (wordIndices[3] & 0x0F) + 1;
  
  return {
    identifier,
    extendable,
    iterationExponent,
    groupIndex,
    groupThreshold,
    groupCount,
    memberIndex,
    memberThreshold
  };
}

function encodeShare(metadata: ShareMetadata, encryptedSecret: Uint8Array): string[] {
  const words = encodeMetadata(metadata);
  
  // Convert encrypted secret to words using big integer approach (like Python)
  // Calculate how many words we need
  const totalBits = encryptedSecret.length * 8;
  const totalWords = Math.ceil(totalBits / 10);
  
  // Convert bytes to big integer
  let valueInt = 0n;
  for (const byte of encryptedSecret) {
    valueInt = (valueInt << 8n) + BigInt(byte);
  }
  
  // Convert big integer to word indices
  const secretWords: number[] = [];
  for (let i = 0; i < totalWords; i++) {
    secretWords.unshift(Number(valueInt % 1024n));
    valueInt /= 1024n;
  }
  words.push(...secretWords);
  
  // Add checksum (3 words)
  const customization = metadata.extendable ? 'shamir_extendable' : 'shamir';
  const checksum = rs1024CreateChecksum(customization, words);
  words.push(...checksum);
  
  return words.map(idx => SLIP39_WORDLIST[idx]);
}

function decodeShare(words: string[]): { metadata: ShareMetadata; encryptedSecret: Uint8Array } {
  const wordIndices = words.map(w => {
    const idx = WORD_TO_INDEX.get(w.toLowerCase());
    if (idx === undefined) {
      throw new Error(`Invalid word: ${w}`);
    }
    return idx;
  });
  
  if (wordIndices.length !== 20 && wordIndices.length !== 33) {
    throw new Error(`Invalid mnemonic length: ${wordIndices.length} words. Expected 20 or 33.`);
  }
  
  const metadata = decodeMetadata(wordIndices);
  
  // Extract value words (skip metadata 4 words and checksum 3 words)
  const valueWords = wordIndices.slice(4, -3);
  
  // Calculate padding - must be multiple of 16 bits
  const totalValueBits = valueWords.length * 10;
  const paddingBits = totalValueBits % 16;
  const dataBits = totalValueBits - paddingBits;
  const valueByteCount = dataBits / 8;
  
  // Convert word indices to a single big integer (like Python's int.from_bytes with big endian)
  let valueInt = 0n;
  for (const wordIdx of valueWords) {
    valueInt = valueInt * 1024n + BigInt(wordIdx);
  }
  
  // Convert to bytes
  try {
    // Check that padding bits are zero
    const maxValue = (1n << BigInt(dataBits)) - 1n;
    if (valueInt > maxValue) {
      throw new Error('Invalid mnemonic padding');
    }
    
    const encryptedSecret = new Uint8Array(valueByteCount);
    for (let i = 0; i < valueByteCount; i++) {
      encryptedSecret[valueByteCount - 1 - i] = Number(valueInt & 0xFFn);
      valueInt >>= 8n;
    }
    
    return { metadata, encryptedSecret };
  } catch (e) {
    throw new Error('Invalid mnemonic padding');
  }
}

// ============================================================================
// Main API Functions
// ============================================================================

/**
 * Generate a SLIP-39 mnemonic for a master secret (no passphrase)
 * 
 * @param masterSecret - The master secret (16 bytes for 128-bit, 32 bytes for 256-bit)
 * @returns The SLIP-39 mnemonic string
 */
export function generateMnemonic(masterSecret: Uint8Array): string {
  if (masterSecret.length !== 16 && masterSecret.length !== 32) {
    throw new Error('Master secret must be 16 bytes (128-bit) or 32 bytes (256-bit)');
  }
  
  const identifier = generateIdentifier();
  const iterationExponent = 0;
  const extendable = false;
  const passphrase = ''; // No passphrase
  
  // Build salt: identifier as 2 bytes
  const salt = new Uint8Array(2);
  salt[0] = (identifier >> 8) & 0xFF;
  salt[1] = identifier & 0xFF;
  
  // Always encrypt master secret (with empty passphrase)
  const encryptedSecret = feistelCipherEncrypt(masterSecret, passphrase, iterationExponent, identifier, extendable);
  
  // Create metadata for single share (1-of-1)
  const metadata: ShareMetadata = {
    identifier,
    extendable,
    iterationExponent,
    groupIndex: 0,
    groupThreshold: 1,
    groupCount: 1,
    memberIndex: 0,
    memberThreshold: 1
  };
  
  const words = encodeShare(metadata, encryptedSecret);
  return words.join(' ');
}

/**
 * Validate a SLIP-39 mnemonic
 * 
 * @param mnemonic - The mnemonic string to validate
 * @returns true if valid, false otherwise
 */
export function validateMnemonic(mnemonic: string): boolean {
  try {
    const words = mnemonic.trim().split(/\s+/);
    
    if (words.length !== 20 && words.length !== 33) {
      return false;
    }
    
    for (const word of words) {
      if (!WORD_TO_INDEX.has(word.toLowerCase())) {
        return false;
      }
    }
    
    const wordIndices = words.map(w => WORD_TO_INDEX.get(w.toLowerCase())!);
    const extendable = ((wordIndices[1] >> 4) & 1) === 1;
    const customization = extendable ? 'shamir_extendable' : 'shamir';
    
    return rs1024VerifyChecksum(customization, wordIndices);
  } catch {
    return false;
  }
}

/**
 * Recover master secret from SLIP-39 mnemonic (no passphrase)
 * 
 * @param mnemonic - The mnemonic string
 * @returns The recovered master secret
 */
export function recoverMasterSecret(mnemonic: string): Uint8Array {
  const words = mnemonic.trim().split(/\s+/);
  
  if (words.length !== 20 && words.length !== 33) {
    throw new Error(`Invalid mnemonic length: ${words.length} words`);
  }
  
  const { metadata, encryptedSecret } = decodeShare(words);
  const { identifier, iterationExponent } = metadata;
  const passphrase = ''; // No passphrase
  
  // Always decrypt - SLIP-39 master secret is always encrypted
  const masterSecret = feistelCipherDecrypt(encryptedSecret, passphrase, iterationExponent, identifier, metadata.extendable);
  
  return masterSecret;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function generateRandomMasterSecret(bits: 128 | 256 = 128): Uint8Array {
  return randomBytes(bits / 8);
}

export default {
  generateMnemonic,
  validateMnemonic,
  recoverMasterSecret,
  generateRandomMasterSecret,
  bytesToHex,
  hexToBytes,
  SLIP39_WORDLIST
};
