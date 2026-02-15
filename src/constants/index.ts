// Testnet constants
export const TESTNET_NETWORK = {
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

// API endpoints
export const MEMPOOL_API = "https://mempool.space/testnet4/api";

// Default derivation path root for Taproot (BIP-86 testnet)
export const TAPROOT_PATH = "m/86'/1'";

// Default spending conditions for inheritance accounts
export const DEFAULT_INHERITANCE_CONDITIONS = {
  noSpendBlocks: 5,
  multisigAfterBlocks: 6,
  userOnlyAfterBlocks: 10,
  heirOnlyAfterBlocks: 20,
};

// Predefined heir contact (hardcoded for v1)
export const DEFAULT_HEIR: { id: string; name: string; publicKey: string } = {
  id: "heir-1",
  name: "Rodinný dědic",
  publicKey:
    "03a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
};

// LocalStorage keys
export const STORAGE_KEYS = {
  WALLET: "btc_wallet",
  ACCOUNTS: "btc_accounts",
  TRANSACTIONS: "btc_transactions",
};
