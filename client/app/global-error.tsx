"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#050a0f", color: "rgba(255,255,255,0.92)", fontFamily: "DM Sans, system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, margin: "0 0 24px" }}>
            {error.digest ? `Error ${error.digest}` : "An unexpected error occurred."}
          </p>
          <button type="button" onClick={reset}
            style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #12b886, #2dd4a3)", color: "#050a0f", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
