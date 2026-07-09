"use client";

// Per-metric "i" info modal for the Operating Performance metrics — on both
// the live scorecard cards and the home-page sample cards. Content is sourced
// entirely from the shared metric-definitions dictionary (re-homed here after
// Classic's InfoIcon was retired). The dialog is portaled to <body> so a
// transformed card ancestor can't scope the fixed overlay; it dismisses on
// Escape / backdrop / close and restores focus to the trigger on close.

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { METRIC_DEFINITIONS, type MetricKey } from "@/lib/metric-definitions";

export function MetricInfoModal({ metricKey }: { metricKey: MetricKey }) {
  const def = METRIC_DEFINITIONS[metricKey];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const titleId = useId();

  // Escape-to-close while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Restore focus to the trigger only on an open→close transition (never on
  // mount, which would steal focus on page load).
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (!def) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`About ${def.name}`}
        aria-haspopup="dialog"
        onClick={(e) => {
          // These cards are often wrapped in a <Link> (home-page samples,
          // market rows). Without this, the click bubbles to the anchor and
          // navigates to the scorecard — the modal flashes then disappears.
          // stopPropagation kills the Link's onClick nav; preventDefault kills
          // the native anchor default nav. Both are needed.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "15px",
          height: "15px",
          flexShrink: 0,
          borderRadius: "50%",
          border: "1px solid #c3cad6",
          background: "transparent",
          color: "#8894ac",
          fontSize: "10px",
          fontWeight: 700,
          fontStyle: "italic",
          lineHeight: 1,
          cursor: "pointer",
          padding: 0,
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        i
      </button>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => {
              // React portals bubble synthetic events through the React tree
              // (not the DOM tree), so a backdrop click still reaches a wrapping
              // <Link>'s onClick and would navigate. Stop it before closing.
              e.stopPropagation();
              setOpen(false);
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(15,31,63,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                background: "#fff",
                borderRadius: "12px",
                maxWidth: "460px",
                width: "100%",
                maxHeight: "80vh",
                overflowY: "auto",
                padding: "24px 24px 22px",
                boxShadow: "0 12px 40px rgba(15,31,63,0.22)",
                textAlign: "left",
              }}
            >
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  width: "26px",
                  height: "26px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: "#8894ac",
                  fontSize: "20px",
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ×
              </button>

              <h3
                id={titleId}
                style={{ fontSize: "18px", fontWeight: 700, color: "#0f1f3f", margin: "0 24px 8px 0" }}
              >
                {def.name}
              </h3>

              <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#2a3547", margin: "0 0 14px" }}>
                {def.definition}
              </p>

              {def.formula && (
                <pre
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: "11.5px",
                    lineHeight: 1.5,
                    color: "#155772",
                    background: "#f2f5f8",
                    border: "1px solid #e2e7ef",
                    borderRadius: "7px",
                    padding: "9px 11px",
                    margin: "0 0 14px",
                    whiteSpace: "pre-wrap",
                    overflowX: "auto",
                  }}
                >
                  {def.formula}
                </pre>
              )}

              {def.variableDefs && def.variableDefs.length > 0 && (
                <dl style={{ margin: "0 0 14px", fontSize: "12.5px", color: "#2a3547" }}>
                  {def.variableDefs.map((v) => (
                    <div key={v.symbol} style={{ display: "flex", gap: "8px", marginBottom: "3px" }}>
                      <dt style={{ fontWeight: 700, color: "#155772", flexShrink: 0 }}>{v.symbol}</dt>
                      <dd style={{ margin: 0 }}>{v.meaning}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <p style={{ fontSize: "12.5px", lineHeight: 1.55, color: "#5b6577", margin: "0 0 12px" }}>
                <span style={{ fontWeight: 700, color: "#3a4a6b" }}>Compared against: </span>
                {def.cohortScope}
              </p>

              {def.caveats.length > 0 && (
                <div style={{ margin: "0 0 14px" }}>
                  <p
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#8894ac",
                      margin: "0 0 4px",
                    }}
                  >
                    Caveats
                  </p>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", lineHeight: 1.55, color: "#5b6577" }}>
                    {def.caveats.map((c, i) => (
                      <li key={i} style={{ marginBottom: "3px" }}>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <a
                href={def.methodologyHref ?? "/methodology"}
                style={{ fontSize: "13px", fontWeight: 600, color: "#155772", textDecoration: "none" }}
              >
                Full methodology →
              </a>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
