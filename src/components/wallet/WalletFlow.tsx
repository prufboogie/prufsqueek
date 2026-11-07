"use client";
/**
 * Loaded only when someone asks to connect. Signing proves control of the address and nothing else:
 * no transaction, no approval, nothing staked or locked.
 */
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getAddress } from "viem";
import { useAccount, useConnect, useDisconnect, useSignMessage, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
import { walletConfig } from "./config";
import { api, ApiError } from "@/client/api";
import { shortAddress } from "@/client/format";
import { toast } from "@/client/store";
import type { Me } from "@/client/types";
import { signInMessage } from "@/shared/auth-message";

const config = walletConfig;
const walletQueries = new QueryClient();

function Flow({ onDone, appQueries }: { onDone: () => void; appQueries: QueryClient }) {
  const { connectors, connectAsync, isPending } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [step, setStep] = useState<"pick" | "sign" | "working">("pick");
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => {
    const named = connectors.filter((c) => c.id !== "injected");
    return named.some((c) => c.type === "injected") ? named : connectors;
  }, [connectors]);

  useEffect(() => {
    if (isConnected && step === "pick") setStep("sign");
  }, [isConnected, step]);

  const pick = async (connector: (typeof connectors)[number]) => {
    setError(null);
    try {
      await connectAsync({ connector, chainId: sepolia.id }).catch(async (e) => {
        // A wallet that won't switch to Sepolia can still sign the message.
        if (/chain/i.test(String(e?.message))) return connectAsync({ connector });
        throw e;
      });
    } catch (e) {
      setError((e as Error).message?.split("\n")[0] ?? "Your wallet didn't connect.");
    }
  };

  const sign = async () => {
    if (!address) return;
    setStep("working");
    setError(null);
    try {
      const { nonce } = await api<{ nonce: string }>("/api/auth/nonce", { body: {} });
      const checksummed = getAddress(address);
      const signature = await signMessageAsync({ message: signInMessage(checksummed, nonce, window.location.host) });
      const me = await api<Me>("/api/auth/verify", { body: { address: checksummed, signature, nonce } });
      appQueries.setQueryData(["me"], me);
      await appQueries.invalidateQueries();
      toast({ kind: "ok", title: "Welcome to the district", body: shortAddress(checksummed) });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : ((e as Error).message?.split("\n")[0] ?? "That didn't work."));
      setStep("sign");
    }
  };

  if (step === "pick") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-bone-dim">Connect the wallet that holds your Squeeks. The game only reads them: nothing is ever moved, staked, burned or locked.</p>
        {list.length === 0 && <p className="text-sm text-bone-mute">No wallet found in this browser. Open the district in your wallet&apos;s browser, or install one.</p>}
        {list.map((c) => (
          <button key={c.uid} className="btn btn-steel h-12" disabled={isPending} onClick={() => pick(c)}>
            {c.name === "Injected" ? "Browser wallet" : c.name}
          </button>
        ))}
        {error && <p role="alert" className="text-sm text-rust">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-sm text-bone">{address && shortAddress(address)}</p>
      <p className="text-sm leading-relaxed text-bone-dim">Sign one message to prove this wallet is yours. It costs nothing and sends no transaction.</p>
      <button className="btn btn-hazard h-12 text-lg" disabled={step === "working"} onClick={sign}>
        {step === "working" ? "Check your wallet…" : "Sign in"}
      </button>
      <button className="link self-start text-xs" onClick={async () => { await disconnectAsync(); setStep("pick"); }}>Use a different wallet</button>
      {error && <p role="alert" className="text-sm text-rust">{error}</p>}
    </div>
  );
}

export default function WalletFlow({ onDone }: { onDone: () => void }) {
  const appQueries = useQueryClient();
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={walletQueries}>
        <Flow onDone={onDone} appQueries={appQueries} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
