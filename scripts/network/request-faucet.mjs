import {
  AddressKeyManager,
  createClient,
  ensureDirs,
  mnemonicFromEnv,
  networkName,
} from "./lib/sdk-helpers.mjs";

ensureDirs();

const network = networkName();
if (network !== "testnet") throw new Error("Faucet helper only supports testnet.");

const sdk = await createClient(network);
const addressManager = await AddressKeyManager.create({
  sdk,
  mnemonic: mnemonicFromEnv(),
  network,
});
const address = addressManager.primaryAddress.bech32m;

const status = await fetch("https://faucet.thepasta.org/api/status").then((response) => response.json());
if (status.capEndpoint) {
  console.log("Faucet requires CAP in this session; use the bridge URL instead:");
  console.log(`https://bridge.thepasta.org/?network=testnet&address=${address}`);
  process.exit(2);
}

const response = await fetch("https://faucet.thepasta.org/api/core-faucet", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address, amount: 1 }),
});
if (!response.ok) {
  throw new Error(`Faucet request failed: ${response.status} ${await response.text()}`);
}
console.log(await response.text());
