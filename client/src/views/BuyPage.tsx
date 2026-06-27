"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, parseEther } from "viem";
import {
  SwapShell, TabNav, Card, ConnectBtn, ActionBtn, Pill,
  useWallet,
} from "../components/SwapPanel";
import { useConfig } from "../context/ConfigContext";
import { zyncAbi } from "../abi/zync";

function isZeroAddr(a: string) {
  return !a || a.toLowerCase() === "0x0000000000000000000000000000000000000000";
}

export function BuyPage() {
  const { address, walletChainId, publicClient, walletClient, chain, requestConnect } = useWallet();
  const cfg = useConfig();
  const tokenAddress = cfg.zync_token_address as `0x${string}`;
  const tokenReady = !isZeroAddr(cfg.zync_token_address);
  const wrongChain = Boolean(address) && walletChainId !== undefined && walletChainId !== cfg.chain_id;

  const [amount, setAmount] = useState("");
  const [txPending, setTxPending] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [txError, setTxError] = useState<string | undefined>();
  const [mintPriceWei, setMintPriceWei] = useState<bigint | undefined>();
  const [zyncSymbol, setZyncSymbol] = useState("ZYNC");
  const [zyncDecimals, setZyncDecimals] = useState(18);
  const [zyncBalance, setZyncBalance] = useState<bigint | undefined>();
  const [ethBalance, setEthBalance] = useState<bigint | undefined>();
  const [readErr, setReadErr] = useState(false);

  const refreshReads = useCallback(async () => {
    if (!tokenReady) return;
    setReadErr(false);
    const reader = address ?? "0x0000000000000000000000000000000000000000";
    try {
      const [p, sym, dec, bal, ethBal] = await Promise.all([
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "mintPriceWei" }),
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "symbol" }),
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "decimals" }),
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "balanceOf", args: [reader] }),
        address ? publicClient.getBalance({ address }) : Promise.resolve(undefined),
      ]);
      setMintPriceWei(p); setZyncSymbol(sym); setZyncDecimals(dec);
      setZyncBalance(address ? bal : undefined); setEthBalance(ethBal);
    } catch (e) { console.warn("BuyPage read:", e); setReadErr(true); }
  }, [tokenReady, tokenAddress, publicClient, address]);

  useEffect(() => { void refreshReads(); }, [refreshReads]);

  const parsedAmt = useMemo(() => {
    try { const v = parseEther(amount || "0"); return v > 0n ? v : 0n; }
    catch { return 0n; }
  }, [amount]);

  const estimatedReceive = useMemo(() => {
    if (!mintPriceWei || mintPriceWei === 0n || parsedAmt === 0n) return null;
    return (parsedAmt * 10n ** BigInt(zyncDecimals)) / mintPriceWei;
  }, [mintPriceWei, parsedAmt, zyncDecimals]);

  const canBuy = tokenReady && address && walletClient && !wrongChain
    && mintPriceWei != null && mintPriceWei > 0n && parsedAmt > 0n
    && estimatedReceive != null && estimatedReceive > 0n
    && (ethBalance == null || parsedAmt <= ethBalance);

  async function onBuy() {
    if (!canBuy || !address) return;
    setTxError(undefined); setTxHash(undefined); setTxPending(true);
    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress, abi: zyncAbi, functionName: "mintWithEth",
        value: parsedAmt, account: address, chain,
      });
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      await refreshReads();
    } catch (e) { setTxError(e instanceof Error ? e.message : "Transaction failed"); }
    finally { setTxPending(false); }
  }

  return (
    <SwapShell>
      <TabNav />
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm font-medium text-white/60">You're buying {zyncSymbol}</p>
        </div>

        <div className="flex items-baseline justify-center gap-1 py-2 mb-5">
          <span className="text-5xl font-light text-white/40">Ξ</span>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0" inputMode="decimal"
            className="w-36 bg-transparent text-center text-5xl font-light text-white outline-none placeholder:text-white/25" />
        </div>

        <div className="flex justify-center gap-2.5">
          {[0.1, 0.5, 1].map(p => (
            <Pill key={p} label={`${p} ETH`} onClick={() => setAmount(String(p))} active={amount === String(p)} />
          ))}
        </div>

        {estimatedReceive != null && (
          <p className="mt-4 text-center text-sm text-white/40">
            ≈ {formatEther(estimatedReceive)} {zyncSymbol}
          </p>
        )}
        {mintPriceWei != null && (
          <p className="text-center text-xs text-white/35">
            1 {zyncSymbol} = {formatEther(mintPriceWei)} ETH
          </p>
        )}
      </Card>

      {!address
        ? <ConnectBtn onClick={requestConnect} />
        : wrongChain
          ? <ActionBtn disabled>Wrong network</ActionBtn>
          : <ActionBtn onClick={onBuy} disabled={txPending || !canBuy}>
              {txPending ? "Confirming…" : `Buy ${zyncSymbol}`}
            </ActionBtn>
      }

      {txError && <p className="mt-3 break-words font-mono text-xs text-red-300">{txError}</p>}
      {txHash && !txError && (
        <p className="mt-3 font-mono text-xs text-[rgba(110,231,194,0.9)]">
          Confirmed · <span className="break-all">{txHash}</span>
        </p>
      )}
      {readErr && <p className="mt-3 text-xs text-amber-200/85">Could not read contract state.</p>}
    </SwapShell>
  );
}
