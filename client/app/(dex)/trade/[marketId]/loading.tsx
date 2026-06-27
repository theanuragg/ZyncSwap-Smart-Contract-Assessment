export default function TradeLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-3 text-white/40">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#3dffa0]" />
        <span className="text-sm">Loading market…</span>
      </div>
    </div>
  );
}
