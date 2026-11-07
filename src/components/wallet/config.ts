import { createConfig, http, injected } from "wagmi";
import { sepolia } from "wagmi/chains";
// Not the wagmi/connectors barrel: it drags in every vendor SDK. See next.config.mjs.
import { walletConnect } from "wagmi-walletconnect";

const wcId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

/** One wagmi config for sign-in and for signing runs, so a connected wallet is remembered across both. */
export const walletConfig = createConfig({
  chains: [sepolia],
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), ...(wcId ? [walletConnect({ projectId: wcId, showQrModal: true })] : [])],
  transports: { [sepolia.id]: http() },
  ssr: false,
});
