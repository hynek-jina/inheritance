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
  multisigAfterBlocks: 5,
  userOnlyAfterBlocks: 10,
  heirOnlyAfterBlocks: 20,
};

// LocalStorage keys
export const STORAGE_KEYS = {
  WALLET: "btc_wallet",
  ACCOUNTS: "btc_accounts",
  TRANSACTIONS: "btc_transactions",
};
