// app/page.tsx
import React from "react";

/**
 * Two-column baseline layout only.
 * - Left column: sticky sidebar
 * - Right column: large content panel (placeholder for the map)
 * - No external CSS required; all styles are inline to avoid collisions.
 * - No props; compiles cleanly with Next 15 strict checks.
 */

export default function Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "16px",
        display: "grid",
        gridTemplateColumns: "380px 1fr",
        gap: "16px",
        alignItems: "start",
        background: "#0b1623", // dark canvas
      }}
    >
      {/* LEFT: sticky sidebar */}
      <aside
        style={{
          position: "sticky",
          top: 16,
          alignSelf: "start",
          display: "grid",
          gap: 16,
          height: "fit-content",
        }}
      >
        {/* Header / Logo area (left only, per your rule) */}
        <section
          style={{
            borderRadius: 12,
            border: "1px solid #1b2a41",
            background: "#0f2235",
            padding: 16,
          }}
        >
          <div
            style={{
              fontWeight: 800,
              letterSpacing: 0.2,
              color: "#c7e0ff",
              marginBottom: 8,
            }}
          >
            CERTIS
          </div>
          <div style={{ color: "#8aa3bf", fontSize: 14 }}>
            Route Builder • Layout baseline
          </div>
        </section>

        {/* Example card */}
        <section
          style={{
            borderRadius: 12,
            border: "1px solid #1b2a41",
            background: "#0f2235",
            padding: 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              marginBottom: 10,
              fontSize: 18,
              color: "#e6f0ff",
              fontWeight: 700,
            }}
          >
            Sidebar
          </h2>
          <p style={{ margin: 0, color: "#9fb5cc", fontSize: 14, lineHeight: 1.5 }}>
            This is a fixed sticky sidebar. As you scroll, the right panel can be tall,
            but this column stays pinned.
          </p>
        </section>

        {/* Another example card */}
        <section
          style={{
            borderRadius: 12,
            border: "1px solid #1b2a41",
            background: "#0f2235",
            padding: 16,
          }}
        >
          <h3
            style={{
              margin: 0,
              marginBottom: 8,
              fontSize: 16,
              color: "#e6f0ff",
              fontWeight: 700,
            }}
          >
            Controls (placeholder)
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#9fb5cc", fontSize: 14 }}>
            <li>Map style toggle</li>
            <li>Filters</li>
            <li>Trip options</li>
          </ul>
        </section>
      </aside>

      {/* RIGHT: main content panel (map placeholder) */}
      <section
        style={{
          borderRadius: 14,
          border: "1px solid #1b2a41",
          background:
            "linear-gradient(180deg, rgba(18,31,49,0.9), rgba(12,23,36,0.9))",
          minHeight: "80vh",
          height: "calc(100vh - 32px)",
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            color: "#a8c4e6",
            fontSize: 16,
            padding: 12,
            borderRadius: 8,
            border: "1px dashed #355071",
            background: "rgba(16, 34, 52, 0.65)",
          }}
        >
          Right panel (map goes here). Two-column layout locked.
        </div>
      </section>
    </main>
  );
}
