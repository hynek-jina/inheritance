import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';

const ROUND_COUNT = 4;
const ITERATION_COUNT = 10000;

const SLIP39_WORDLIST = [
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

function feistelCipherDecrypt(data, passphrase, iterationExponent, identifier, extendable) {
  const half = data.length / 2;
  let L = data.slice(0, half);
  let R = data.slice(half);
  const salt = buildSalt(identifier, extendable);
  
  for (let i = ROUND_COUNT - 1; i >= 0; i--) {
    const F = feistelRound(i, passphrase, iterationExponent, salt, R);
    const newR = new Uint8Array(half);
    for (let j = 0; j < half; j++) {
      newR[j] = L[j] ^ F[j];
    }
    L = R.slice();
    R = newR;
  }
  
  const result = new Uint8Array(data.length);
  result.set(R, 0);
  result.set(L, half);
  return result;
}

function recoverMasterSecret(mnemonic, passphrase = '') {
  const words = mnemonic.trim().split(/\s+/);
  const wordIndices = words.map(w => SLIP39_WORDLIST.indexOf(w.toLowerCase()));
  
  const identifier = ((wordIndices[0] << 5) | ((wordIndices[1] >> 5) & 0x1F)) & 0x7FFF;
  const extendable = ((wordIndices[1] >> 4) & 1) === 1;
  const iterationExponent = wordIndices[1] & 0x0F;
  
  const valueWords = wordIndices.slice(4, -3);
  const totalValueBits = valueWords.length * 10;
  const paddingBits = totalValueBits % 16;
  const dataBits = totalValueBits - paddingBits;
  const valueByteCount = dataBits / 8;
  
  let valueInt = 0n;
  for (const wordIdx of valueWords) {
    valueInt = valueInt * 1024n + BigInt(wordIdx);
  }
  
  const encryptedSecret = new Uint8Array(valueByteCount);
  for (let i = 0; i < valueByteCount; i++) {
    encryptedSecret[valueByteCount - 1 - i] = Number(valueInt & 0xFFn);
    valueInt >>= 8n;
  }
  
  return feistelCipherDecrypt(encryptedSecret, passphrase, iterationExponent, identifier, extendable);
}

// Debug metadata
const mnemonic = "guard stay academic academic cylinder swing unhappy deal endless penalty class emphasis gesture away review verify thunder oasis plan triumph";
const words = mnemonic.trim().split(/\s+/);
const wordIndices = words.map(w => {
  const idx = SLIP39_WORDLIST.indexOf(w.toLowerCase());
  if (idx === -1) {
    console.error(`Word "${w}" not found in wordlist!`);
  }
  return idx;
});

console.log("=== Debug SLIP-39 Metadata ===");
console.log("Mnemonic:", mnemonic);
console.log("\nWord indices:");
words.forEach((w, i) => {
  console.log(`  ${i}: "${w}" -> ${wordIndices[i]}`);
});

// Decode metadata
const identifier = ((wordIndices[0] << 5) | ((wordIndices[1] >> 5) & 0x1F)) & 0x7FFF;
const extendable = ((wordIndices[1] >> 4) & 1) === 1;
const iterationExponent = wordIndices[1] & 0x0F;
const groupIndex = (wordIndices[2] >> 6) & 0x0F;
const groupThreshold = ((wordIndices[2] >> 2) & 0x0F) + 1;
const groupCount = (((wordIndices[2] & 0x03) << 2) | ((wordIndices[3] >> 8) & 0x03)) + 1;
const memberIndex = (wordIndices[3] >> 4) & 0x0F;
const memberThreshold = (wordIndices[3] & 0x0F) + 1;

console.log("\n=== Decoded Metadata ===");
console.log("Identifier:       ", identifier, `(0x${identifier.toString(16)})`);
console.log("Extendable:       ", extendable);
console.log("Iteration exp:    ", iterationExponent);
console.log("Group index:      ", groupIndex);
console.log("Group threshold:  ", groupThreshold);
console.log("Group count:      ", groupCount);
console.log("Member index:     ", memberIndex);
console.log("Member threshold: ", memberThreshold);

// Value words
const valueWords = wordIndices.slice(4, -3);
console.log("\n=== Value Words ===");
console.log("Count:", valueWords.length);
console.log("Words:", valueWords.join(', '));

// Calculate expected padding
const totalValueBits = valueWords.length * 10;
const paddingBits = totalValueBits % 16;
const dataBits = totalValueBits - paddingBits;
console.log("\n=== Bit Calculation ===");
console.log("Total value bits:", totalValueBits);
console.log("Padding bits:    ", paddingBits);
console.log("Data bits:       ", dataBits);
console.log("Expected bytes:  ", dataBits / 8);

// Recover master secret
const masterSecret = recoverMasterSecret(mnemonic, '');
console.log("\n=== Master Secret ===");
console.log("Hex:", Array.from(masterSecret).map(b => b.toString(16).padStart(2, '0')).join(''));
console.log("Length:", masterSecret.length, "bytes");