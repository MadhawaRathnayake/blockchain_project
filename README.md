# ZK Voting (Hardhat edition)

An anonymous, verifiable election system for Sri Lanka built on zero-knowledge proofs. Voters register a commitment on-chain and later vote from an unlinkable burner wallet by proving, with an UltraHonk (Noir) proof, that they belong to the voter set. The proof never reveals who they are.

This edition runs on a **local Hardhat chain (id 31337)**. The Election Authority and Grama Niladhari (GN) officers sign with **MetaMask**.

## Packages

| Package | What it is |
|---|---|
| `packages/hardhat` | Solidity contracts (`Voting`, `ElectionRegistry`, `NicRegistry`, `HonkVerifier`, Poseidon/LeanIMT), deploy scripts, and tests |
| `packages/nextjs` | Web app: admin console, GN portal, results, audit, block explorer, and the API the mobile app uses |
| `packages/circuits` | Noir circuit source (compiled output is already in `packages/nextjs/public/circuits.json`) |
| `packages/mobile` | Expo voter app: on-device keys, registration, proof generation, anonymous vote |

## Prerequisites

- Node.js >= 20.18.3
- Yarn 4.13.0 (`corepack enable`)
- MetaMask in your browser
- Only if you change the circuit: nargo v1.0.0-beta.3 and bb v0.82.2 (via WSL on Windows)

## First-time setup

```bash
yarn install
cp packages/nextjs/.env.example packages/nextjs/.env.local
cp packages/mobile/.env.example packages/mobile/.env   # only if you run the mobile app
```

The example files contain this prototype's working values, so the web app runs without edits. For the mobile app, replace the IP in `packages/mobile/.env` with your machine's LAN IP. `packages/hardhat/.env.example` is only needed to deploy to a public network.

## Running

Run each command from the repo root, in its own terminal, in this order:

```bash
yarn chain     # Terminal 1: local Hardhat node on http://127.0.0.1:8545 (leave running)
yarn deploy    # Terminal 2: deploy contracts + 3 sample divisions (after the chain is up)
yarn start     # Terminal 3: web app on http://localhost:3000
```

`yarn chain` starts from an empty chain every time, so run `yarn deploy` again after each restart.

### MetaMask

1. Add a network: RPC `http://127.0.0.1:8545`, chain id `31337`, currency `ETH`.
2. Import the Hardhat dev accounts you need. These keys are public and exist only for local development:

| Role | Account | Private key |
|---|---|---|
| Election Authority (owner) + GN, Kaduwela | #0 `0xf39F…2266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| GN, Colombo Central | #2 `0x3C44…93BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| GN, Gampaha | #3 `0x90F7…b906` | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |

If MetaMask reports "nonce too high" after a chain restart, go to **Settings → Advanced → Clear activity tab data**.

### Mobile app

Copy `packages/mobile/.env.example` to `packages/mobile/.env` and replace the IP with your machine's LAN IP. `localhost` does not work from a phone.

```
EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000
EXPO_PUBLIC_RPC_URL=http://<LAN-IP>:8545
EXPO_PUBLIC_CHAIN_ID=31337
```

Then run `yarn workspace sl-vote-mobile start` and open the app in Expo Go.

For an EAS build (`eas build`), set the same three variables on the EAS build profile, e.g. with `eas env:create`.

## Running an election

1. **Admin → Divisions**: the deploy creates Kaduwela, Colombo Central and Gampaha, each with a GN officer. Add more divisions or reassign officers here.
2. **Admin → Ballot**: set the question and candidates, either per division or for all divisions at once.
3. **Admin → Operations**: start Registration.
4. **GN portal (`/gn/register`)**, connected as that division's GN: scan the voter's app QR code and enrol them against their NIC.
5. **Mobile app**: the voter registers their commitment.
6. **Admin → Operations**: start Voting. The voter casts an anonymous ballot from the app.
7. **Admin → Operations**: end the election. Results appear at `/results`, and `/audit` lets anyone re-verify them.

## Tests

```bash
yarn hardhat:test                       # contracts
yarn workspace @se-2/nextjs test        # web app
yarn workspace sl-vote-mobile test      # mobile
yarn next:check-types                   # web app typecheck
```
