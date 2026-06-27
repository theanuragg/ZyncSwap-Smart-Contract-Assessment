"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, parseEther, isAddress, zeroAddress } from "viem";
import {
  SwapShell, TabNav, Card, Label, BigInput, FlipBtn, ConnectBtn, ActionBtn, TokenDropdown,
  TOKENS, type Token,
} from "../components/SwapPanel";
import { useWallet } from "../wallet/WalletContext";
import { useConfig } from "../context/ConfigContext";
import { zyncAbi } from "../abi/zync";

function isZeroAddr(a: string) {
  return !isAddress(a) || a.toLowerCase() === zeroAddress;
}

const NATIVE_ETH: Token = { symbol: "ETH", name: "Ethereum", icon: "https://assets.coingecko.com/coins/images/279/thumb/ethereum.png" };
const ZYNC_TOKEN: Token = { symbol: "ZYNC", name: "Zync Token", icon: "" };

export function SwapPage() {
  const { address, walletChainId, publicClient, walletClient, chain, requestConnect } = useWallet();
  const cfg = useConfig();
  const tokenAddress = cfg.zync_token_address as `0x${string}`;
  const tokenReady = !isZeroAddr(cfg.zync_token_address);
  const wrongChain = Boolean(address) && walletChainId !== undefined && walletChainId !== cfg.chain_id;

  const [fromToken, setFromToken] = useState<Token>(NATIVE_ETH);
  const [toToken, setToToken] = useState<Token>(ZYNC_TOKEN);
  const [amt, setAmt] = useState("");
  const [txPending, setTxPending] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [txError, setTxError] = useState<string | undefined>();

  const [mintPriceWei, setMintPriceWei] = useState<bigint | undefined>();
  const [zyncSymbol, setZyncSymbol] = useState("ZYNC");
  const [zyncDecimals, setZyncDecimals] = useState(18);
  const [zyncBalance, setZyncBalance] = useState<bigint | undefined>();
  const [ethBalance, setEthBalance] = useState<bigint | undefined>();
  const [readErr, setReadErr] = useState(false);
  const [apiQuote, setApiQuote] = useState<{
    amount_out: string; amount_out_min: string; swap_kind: string; path: string[]; path_note?: string;
  } | null>(null);
  const [apiQuoteLoading, setApiQuoteLoading] = useState(false);

  const isBuy = fromToken.symbol === "ETH" && toToken.symbol === "ZYNC";
  const isSell = fromToken.symbol === "ZYNC" && toToken.symbol === "ETH";
  const isSupportedSwap = isBuy || isSell;

  const refreshReads = useCallback(async () => {
    if (!tokenReady || !publicClient) return;
    setReadErr(false);
    const reader = address ?? zeroAddress;
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
    } catch (e) { console.warn("SwapPage read:", e); setReadErr(true); }
  }, [tokenReady, tokenAddress, publicClient, address]);

  useEffect(() => { void refreshReads(); }, [refreshReads]);

  const parsedAmt = useMemo(() => {
    try { const v = parseEther(amt || "0"); return v > 0n ? v : 0n; }
    catch { return 0n; }
  }, [amt]);

  const estimatedReceive = useMemo(() => {
    if (!isSupportedSwap) return null;
    if (isBuy) {
      if (!mintPriceWei || mintPriceWei === 0n || parsedAmt === 0n) return null;
      return (parsedAmt * 10n ** BigInt(zyncDecimals)) / mintPriceWei;
    }
    return parsedAmt;
  }, [isBuy, isSupportedSwap, mintPriceWei, parsedAmt, zyncDecimals]);

  const canBuy = tokenReady && address && walletClient && !wrongChain && isBuy
    && mintPriceWei != null && mintPriceWei > 0n && parsedAmt > 0n
    && estimatedReceive != null && estimatedReceive > 0n
    && (ethBalance == null || parsedAmt <= ethBalance);

  const canSell = tokenReady && address && walletClient && !wrongChain && isSell
    && parsedAmt > 0n && zyncBalance != null && parsedAmt <= zyncBalance;

  const canSubmit = isBuy ? canBuy : (isSell ? canSell : false);

  const fetchApiQuote = useCallback(async () => {
    if (!tokenReady || parsedAmt === 0n || !isSupportedSwap) { setApiQuote(null); return; }
    setApiQuoteLoading(true);
    try {
      const params = new URLSearchParams({
        amount_in: parsedAmt.toString(),
        from: isBuy ? "native" : tokenAddress,
        to: isBuy ? tokenAddress : "native",
      });
      const res = await fetch(`/api/v1/swap/quote?${params}`);
      if (!res.ok) { setApiQuote(null); return; }
      const data = await res.json();
      if (data.amount_out && data.amount_out !== "0") {
        setApiQuote({
          amount_out: data.amount_out, amount_out_min: data.amount_out_min,
          swap_kind: data.swap_kind, path: data.path, path_note: data.path_note,
        });
      } else { setApiQuote(null); }
    } catch (e) { console.warn("SwapPage quote:", e); setApiQuote(null); }
    finally { setApiQuoteLoading(false); }
  }, [tokenReady, parsedAmt, isSupportedSwap, isBuy, tokenAddress]);

  useEffect(() => { const t = setTimeout(fetchApiQuote, 300); return () => clearTimeout(t); }, [fetchApiQuote]);

  async function onSubmit() {
    if (!address || !walletClient || !canSubmit) return;
    setTxError(undefined); setTxHash(undefined); setTxPending(true);
    try {
      if (isBuy) {
        const hash = await walletClient.writeContract({
          address: tokenAddress, abi: zyncAbi, functionName: "mintWithEth",
          value: parsedAmt, account: address, chain,
        });
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
      } else {
        const hash = await walletClient.writeContract({
          address: tokenAddress, abi: zyncAbi, functionName: "burn",
          args: [parsedAmt], account: address, chain,
        });
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refreshReads();
    } catch (e) { setTxError(e instanceof Error ? e.message : "Transaction failed"); }
    finally { setTxPending(false); }
  }

  function flipTokens() {
    const tmp = fromToken; setFromToken(toToken); setToToken(tmp);
    setAmt("");
  }

  if (!tokenReady) {
    return (
      <SwapShell>
        <TabNav />
        <Card>
          <p className="text-sm text-white/55">
            Deploy ZyncToken and set <code className="font-mono text-[#6ee7c2]">ZYNC_TOKEN_ADDRESS</code> in <code className="font-mono text-[#6ee7c2]">.env</code>.
          </p>
        </Card>
      </SwapShell>
    );
  }

  return (
    <SwapShell>
      <TabNav />

      {/* From */}
      <Card>
        <Label>You pay</Label>
        <div className="flex items-center justify-between gap-3">
          <BigInput value={amt} onChange={setAmt} placeholder="0" />
          <TokenDropdown value={fromToken} onChange={(t) => { setFromToken(t); if (t.symbol === toToken.symbol) setToToken(fromToken); }}
            exclude={toToken.symbol} />
        </div>
        {fromToken.symbol === "ETH" && ethBalance != null && (
          <p className="mt-1 text-xs text-white/40">Balance: {formatEther(ethBalance)} ETH</p>
        )}
        {fromToken.symbol === "ZYNC" && zyncBalance != null && (
          <p className="mt-1 text-xs text-white/40">Balance: {formatEther(zyncBalance)} {zyncSymbol}</p>
        )}
      </Card>

      <FlipBtn onClick={flipTokens} />

      {/* To */}
      <Card>
        <Label>You receive</Label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[2.6rem] font-light text-white/20 leading-none">
            {estimatedReceive != null ? formatEther(estimatedReceive) : "0"}
          </span>
          <TokenDropdown value={toToken} onChange={(t) => { setToToken(t); if (t.symbol === fromToken.symbol) setToToken(fromToken); }}
            exclude={fromToken.symbol} placeholder="Select token" />
        </div>
        {isBuy && mintPriceWei != null && (
          <p className="mt-1 text-xs text-white/40">Price: 1 {zyncSymbol} = {formatEther(mintPriceWei)} ETH</p>
        )}
      </Card>

      {/* API quote info */}
      {apiQuote && isBuy && (
        <Card className="mt-2">
          <div className="text-[10px] text-white/40">
            <p>Router quote: {formatEther(BigInt(apiQuote.amount_out))} {zyncSymbol}</p>
            {apiQuote.path_note && <p className="mt-1 italic">{apiQuote.path_note}</p>}
          </div>
        </Card>
      )}
      {apiQuoteLoading && <p className="mt-2 text-center text-[10px] text-white/30">Loading quote…</p>}

      {/* Unsupported pair hint */}
      {!isSupportedSwap && fromToken && toToken && (
        <div className="mt-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5 text-xs text-amber-200/80">
          Swapping {fromToken.symbol} → {toToken.symbol} requires a deployed router. Only ETH ↔ {zyncSymbol} is available on-chain.
        </div>
      )}

      {/* Action */}
      {!address
        ? <ConnectBtn onClick={requestConnect} />
        : wrongChain
          ? <ActionBtn disabled>Wrong network</ActionBtn>
          : !isSupportedSwap
            ? <ActionBtn disabled>Unsupported pair</ActionBtn>
            : <ActionBtn onClick={onSubmit} disabled={txPending || !canSubmit}>
                {txPending ? "Confirming…" : isBuy ? `Buy ${zyncSymbol}` : `Burn ${zyncSymbol}`}
              </ActionBtn>
      }

      {txError && <p className="mt-3 break-words font-mono text-xs text-red-300">{txError}</p>}
      {txHash && !txError && <p className="mt-3 font-mono text-xs text-[rgba(110,231,194,0.9)]">Confirmed · <span className="break-all">{txHash}</span></p>}
      {readErr && <p className="mt-3 text-xs text-amber-200/85">Could not read contract state.</p>}
    </SwapShell>
  );
}
