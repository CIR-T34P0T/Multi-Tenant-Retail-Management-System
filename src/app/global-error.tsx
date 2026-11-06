"use client";

/**
 * Last-resort error page when the root layout itself fails.
 * It renders its own document, so it uses plain inline styles.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          padding: 16,
          textAlign: "center",
        }}
      >
        <title>Something went wrong</title>
        <div>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: "#555" }}>The application could not load. Please try again.</p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: 12,
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #ccc",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
