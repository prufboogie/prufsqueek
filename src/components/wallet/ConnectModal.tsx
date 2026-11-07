"use client";
import dynamic from "next/dynamic";
import { create } from "zustand";
import { Modal } from "@/components/ui";

const WalletFlow = dynamic(() => import("./WalletFlow"), {
  ssr: false,
  loading: () => <p className="py-6 text-center font-mono text-sm text-bone-mute">Opening the gate…</p>,
});

export const useConnectModal = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export function ConnectModal() {
  const { open, hide } = useConnectModal();
  return (
    <Modal open={open} onClose={hide} title="Enter the district">
      {open && <WalletFlow onDone={hide} />}
    </Modal>
  );
}

export function ConnectButton({ className = "btn btn-hazard", label = "Connect wallet" }: { className?: string; label?: string }) {
  const show = useConnectModal((s) => s.show);
  return <button className={className} onClick={show}>{label}</button>;
}
