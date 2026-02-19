# Bitcoin Inheritance Wallet (Signet)

This project is a React + TypeScript wallet focused on **inheritance account workflows** for Bitcoin-like test networks.

It supports two account types:

- **Standard account** (single-sig Taproot spend)
- **Inheritance account** (staged flow with funding multisig, activation, and time-gated spending)

The app runs on **Signet** through `mempool.space` APIs.

## What the App Does Today

### 1) Wallet & Network

- Creates/restores a wallet from a mnemonic (SLIP39 recovery).
- Shows total balance and account-level balances.
- Uses `signet` only.

### 2) Standard Accounts

- Derives Taproot receive/change addresses.
- Tracks UTXOs and transaction history.
- Sends BTC with fee selection.

### 3) Inheritance Accounts (Current Flow)

When a user creates an inheritance account, the app stores two participant identities:

- **User**
- **Heir**

Additionally, for testing purposes, the app includes a **hardcoded server identity** used during funding/activation.

#### Funding phase (before activation)

- Receive addresses are not direct heir spend addresses.
- The app generates **funding addresses** as `2-of-2 multisig (user + server)`.
- Multiple deposits are allowed during this phase.

#### Activation phase

- User triggers **Activate**.
- App collects all UTXOs from funding addresses and builds one transaction:
  - Inputs: funding UTXOs (`user + server` multisig)
  - Output: inheritance active address (`user + heir` multisig)
- The app signs with:
  - user key
  - hardcoded server key
- After broadcast:
  - account becomes **activated**
  - funding receive is disabled
  - activation cannot be run again
  - timelock block countdown starts from active address funding history

#### Spend phase (after activation)

- Spending from inheritance account is enabled according to current policy windows:
  - initial no-spend window
  - multisig window (`user + heir`)
  - later single-key windows
- Multisig path supports PSBT-style handoff:
  - create + partially sign
  - import + co-sign + broadcast
- Change from inheritance spend is currently routed to the main standard account (project-specific behavior).

## Important Notes

- This is a **test-environment app**. Do not use with real funds.
- A hardcoded server mnemonic is intentionally present for development/testing.
- Network calls rely on `mempool.space` APIs.

## Local Development

Install dependencies:

```bash
bun install
```

Start development server:

```bash
bun run dev
```

Lint:

```bash
bun run lint --max-warnings=0
```

Build:

```bash
bun run build
```

Preview production build:

```bash
bun run preview
```
