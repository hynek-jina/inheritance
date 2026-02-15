export interface Wallet {
  mnemonic: string;
  createdAt: number;
}

export interface Account {
  id: string;
  name: string;
  type: "standard" | "inheritance";
  balance: number; // satoshis
  addressIndex: number;
  derivedAddresses: DerivedAddress[];
  // Inheritance specific
  heirPublicKey?: string;
  heirName?: string;
  spendingConditions?: SpendingConditions;
  inheritanceStatus?: InheritanceStatus;
}

export interface DerivedAddress {
  index: number;
  address: string;
  change?: boolean;
  used: boolean;
  balance?: number; // satoshis
}

export interface SpendingConditions {
  noSpendBlocks: number;
  multisigAfterBlocks: number;
  userOnlyAfterBlocks: number;
  heirOnlyAfterBlocks: number;
}

export interface InheritanceStatus {
  blocksSinceFunding: number;
  canUserSpend: boolean;
  canHeirSpend: boolean;
  requiresMultisig: boolean;
}

export interface Transaction {
  txid: string;
  amount: number; // satoshis
  fee: number; // satoshis
  timestamp: number;
  type: "incoming" | "outgoing";
  address: string;
  confirmed: boolean;
  confirmations: number;
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

export interface HeirContact {
  id: string;
  name: string;
  publicKey: string;
}
