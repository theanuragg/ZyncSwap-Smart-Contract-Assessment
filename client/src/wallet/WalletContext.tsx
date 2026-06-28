"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAccount, useWalletClient, useDisconnect, type Chain } from "wagmi";
import { createPublicClient, http, type PublicClient } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "./wagmiConfig";

type WalletCtx = {
  address: `0x${string}` | undefined;
  walletChainId: number | undefined;
  eip1193Provider: unknown | undefined;
  connectorLabel: string | null;
  connectModalOpen: boolean;
  openConnectModal: () => void;
  closeConnectModal: () => void;
  requestConnect: () => void;
  connectWalletId: (id: string) => Promise<void>;
  connectEip6963Provider: (entry: unknown) => Promise<void>;
  connectWalletConnect: () => Promise<void>;
  eip6963Announced: unknown[];
  connectError: string | undefined;
  connectingId: string | null;
  disconnect: () => void;
  publicClient: PublicClient;
  walletClient: ReturnType<typeof useWalletClient>["data"];
  chain: Chain | undefined;
  error: string | undefined;
};

const Ctx = createContext<WalletCtx | null>(null);

const localClient = createPublicClient({
  chain: wagmiConfig.chains[0],
  transport: http(wagmiConfig.chains[0].rpcUrls.default.http[0]),
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address, chain, connector } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { disconnect } = useDisconnect();
  const { openConnectModal, closeConnectModal } = useConnectModal();

  const value = useMemo<WalletCtx>(
    () => ({
      address,
      walletChainId: chain?.id,
      eip1193Provider: undefined,
      connectorLabel: connector?.name ?? null,
      connectModalOpen: false,
      openConnectModal: () => openConnectModal?.(),
      closeConnectModal: () => closeConnectModal?.(),
      requestConnect: () => openConnectModal?.(),
      connectWalletId: async () => {},
      connectEip6963Provider: async () => {},
      connectWalletConnect: async () => {},
      eip6963Announced: [],
      connectError: undefined,
      connectingId: null,
      disconnect: () => disconnect(),
      publicClient: localClient,
      walletClient,
      chain,
      error: undefined,
    }),
    [address, chain, connector?.name, openConnectModal, closeConnectModal, disconnect, walletClient],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("WalletProvider missing");
  return v;
}
