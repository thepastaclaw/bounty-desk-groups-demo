import fs from "node:fs";

import { wallet } from "@dashevo/evo-sdk";

import {
  AddressKeyManager,
  SECRET_ENV_PATH,
  createClient,
  ensureDirs,
  networkName,
} from "./lib/sdk-helpers.mjs";

ensureDirs();

const network = networkName();
const mnemonic = await wallet.generateMnemonic();
const sdk = await createClient(network);
const addressManager = await AddressKeyManager.create({ sdk, mnemonic, network });
const address = addressManager.primaryAddress.bech32m;

fs.writeFileSync(
  SECRET_ENV_PATH,
  `NETWORK=${network}\nPLATFORM_MNEMONIC="${mnemonic}"\n`,
  { mode: 0o600 },
);

console.log("Created local testnet wallet secret.");
console.log(`Secret env: ${SECRET_ENV_PATH}`);
console.log(`Funding address: ${address}`);
console.log(`Bridge URL: https://bridge.thepasta.org/?network=${network}&address=${address}`);
console.log("No mnemonic was printed. Run `source .secrets/testnet.env` after funding.");
