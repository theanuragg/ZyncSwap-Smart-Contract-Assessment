import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
  coinbaseWallet,
  trustWallet,
} from "@rainbow-me/rainbowkit/wallets";

const zyncLocal = defineChain({
  id: 31337,
  name: "Zync Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

const projectId =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) ||
  "d5bf2f7795f9ea323346f78d38c921b4";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [
        metaMaskWallet,
        rainbowWallet,
        coinbaseWallet,
        trustWallet,
        walletConnectWallet,
      ],
    },
  ],
  { projectId, appName: "ZyncSwap" },
);

export const wagmiConfig = createConfig({
  chains: [zyncLocal],
  connectors,
  transports: { [zyncLocal.id]: http() },
});
