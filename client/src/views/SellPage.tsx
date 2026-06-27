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

export function SellPage() {
  const { address, walletChainId, publicClient, walletClient, chain, requestConnect } = useWallet();
  const cfg = useConfig();
  const tokenAddress = cfg.zync_token_address as `0x${string}`;
  const tokenReady = !isZeroAddr(cfg.zync_token_address);
  const wrongChain = Boolean(address) && walletChainId !== undefined && walletChainId !== cfg.chain_id;

  const [amount, setAmount] = useState("");
  const [txPending, setTxPending] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [txError, setTxError] = useState<string | undefined>();
  const [zyncSymbol, setZyncSymbol] = useState("ZYNC");
  const [zyncDecimals, setZyncDecimals] = useState(18);
  const [zyncBalance, setZyncBalance] = useState<bigint | undefined>();
  const [readErr, setReadErr] = useState(false);

  const refreshReads = useCallback(async () => {
    if (!tokenReady) return;
    setReadErr(false);
    const reader = address ?? "0x0000000000000000000000000000000000000000";
    try {
      const [sym, dec, bal] = await Promise.all([
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "symbol" }),
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "decimals" }),
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "balanceOf", args: [reader] }),
      ]);
      setZyncSymbol(sym); setZyncDecimals(dec);
      setZyncBalance(address ? bal : undefined);
    } catch (e) { console.warn("SellPage read:", e); setReadErr(true); }
  }, [tokenReady, tokenAddress, publicClient, address]);

  useEffect(() => { void refreshReads(); }, [refreshReads]);

  const parsedAmt = useMemo(() => {
    try { const v = parseEther(amount || "0"); return v > 0n ? v : 0n; }
    catch { return 0n; }
  }, [amount]);

  const canSell = tokenReady && address && walletClient && !wrongChain
    && parsedAmt > 0n && zyncBalance != null && parsedAmt <= zyncBalance;

  async function onSell() {
    if (!canSell || !address) return;
    setTxError(undefined); setTxHash(undefined); setTxPending(true);
    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress, abi: zyncAbi, functionName: "burn",
        args: [parsedAmt], account: address, chain,
      });
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      await refreshReads();
    } catch (e) { setTxError(e instanceof Error ? e.message : "Transaction failed"); }
    finally { setTxPending(false); }
  }

  const pctOfBalance = useMemo(() => {
    if (!zyncBalance || zyncBalance === 0n) return 0;
    return Number((parsedAmt * 100n) / zyncBalance);
  }, [parsedAmt, zyncBalance]);

  return (
    <SwapShell>
      <TabNav />
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm font-medium text-white/60">You're selling {zyncSymbol}</p>
          {zyncBalance != null && (
            <span className="text-xs text-white/40">Balance: {formatEther(zyncBalance)}</span>
          )}
        </div>

        <div className="flex items-baseline justify-center gap-1 py-2 mb-5">
          <span className="text-5xl font-light text-white/40">{zyncSymbol}</span>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0" inputMode="decimal"
            className="w-36 bg-transparent text-center text-5xl font-light text-white outline-none placeholder:text-white/25" />
        </div>

        <div className="flex justify-center gap-2.5">
          {[25, 50, 75, 100].map(p => (
            <Pill key={p} label={`${p}%`}
              onClick={() => {
                if (zyncBalance) setAmount(formatEther((zyncBalance * BigInt(p)) / 100n));
              }}
              active={pctOfBalance === p} />
          ))}
        </div>

        {parsedAmt > 0n && (
          <p className="mt-4 text-center text-xs text-white/40">
            Burning {formatEther(parsedAmt)} {zyncSymbol}
          </p>
        )}
      </Card>

      {!address
        ? <ConnectBtn onClick={requestConnect} />
        : wrongChain
          ? <ActionBtn disabled>Wrong network</ActionBtn>
          : <ActionBtn onClick={onSell} disabled={txPending || !canSell}>
              {txPending ? "Confirming…" : `Burn ${zyncSymbol}`}
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
