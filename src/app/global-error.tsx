"use client";

/**
 * Root-layout error boundary — the last resort when the shell itself fails.
 * Must render its own <html>/<body> because the root layout is bypassed.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#f8f8f8",
          color: "#242424",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontSize: "2rem", fontWeight: 600, color: "#bd660e" }}>Oops</p>
          <h1 style={{ fontSize: "1.05rem", fontWeight: 500 }}>Something went wrong</h1>
          <p style={{ fontSize: "0.85rem", color: "#7a7a7a", maxWidth: "22rem" }}>
            A critical error occurred. Try again — if it persists, contact your administrator.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "0.75rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#bd660e",
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
