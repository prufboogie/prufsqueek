declare module "wagmi-walletconnect" {
  import type { CreateConnectorFn } from "wagmi";
  export function walletConnect(options: { projectId: string; showQrModal?: boolean }): CreateConnectorFn;
}
