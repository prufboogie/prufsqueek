/**
 * Signs the start-run message with the wallet the player signed in with. Loaded only when a run
 * starts. A message signature only: no transaction, no gas, no approval.
 */
import { getAddress } from "viem";
import { connect, getAccount, reconnect, signMessage } from "wagmi/actions";
import { walletConfig } from "@/components/wallet/config";

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "another wallet");

export async function signAs(expected: string, message: string): Promise<`0x${string}`> {
  await reconnect(walletConfig).catch(() => undefined);
  let account = getAccount(walletConfig);
  if (account.status !== "connected") {
    // Prefer a wallet that announced itself (EIP-6963) over the generic injected one.
    const injected = walletConfig.connectors.filter((c) => c.type === "injected");
    const connector = injected.find((c) => c.id !== "injected") ?? injected[0];
    if (!connector) throw new Error("No wallet found in this browser. Open the district in your wallet's browser.");
    await connect(walletConfig, { connector });
    account = getAccount(walletConfig);
  }
  if (!account.address || getAddress(account.address) !== getAddress(expected)) {
    throw new Error(`Your wallet is on ${short(account.address)}. Switch it to ${short(expected)}, the wallet you signed in with.`);
  }
  return signMessage(walletConfig, { account: account.address, message });
}

/** Wallet errors are long; the first line says what happened. A rejection reads as one. */
export function walletError(e: unknown) {
  const msg = (e as Error)?.message ?? String(e);
  if (/reject|denied|cancel/i.test(msg)) return "You didn't sign, so the run didn't start.";
  return msg.split("\n")[0];
}
