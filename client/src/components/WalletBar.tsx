import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletBar({ expectedChainId: _expectedChainId }: { expectedChainId: number }) {
  return (
    <ConnectButton
      accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
      chainStatus={{ smallScreen: "icon", largeScreen: "full" }}
      showBalance={{ smallScreen: false, largeScreen: true }}
    />
  );
}
