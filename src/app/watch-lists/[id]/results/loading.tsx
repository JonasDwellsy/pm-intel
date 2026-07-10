// Route-level loading UI for the watch-list results page. Applying a watch
// list scores the whole operator universe server-side, which takes a beat —
// long enough that a blank screen reads as broken. Next renders this instantly
// on navigation (from Save & Apply, Re-Run, or a direct link) while the results
// server component streams in. Pure CSS animation so it stays a server
// component (no client bundle). Keyframe/class names are wlb-prefixed to avoid
// colliding with global styles.
//
// A building rises floor-by-floor on a ground line (no crane — an earlier
// crane-and-hook version read as a gallows). Each floor eases up from the floor
// below it, staggered bottom-to-top, then the wave loops.

const FLOORS = [0, 1, 2, 3, 4]; // rendered bottom-up via column-reverse

export default function ResultsLoading() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-background px-6 text-center">
      <style>{`
        @keyframes wlb-floor {
          0%   { opacity: 0; transform: translateY(10px) scaleY(0.45); }
          14%  { opacity: 1; transform: translateY(0) scaleY(1); }
          88%  { opacity: 1; transform: translateY(0) scaleY(1); }
          100% { opacity: 0; transform: translateY(0) scaleY(1); }
        }
        @keyframes wlb-dots { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .wlb-floor { animation: none !important; opacity: 1 !important; transform: none !important; }
          .wlb-dots { animation: none !important; }
        }
      `}</style>

      <div aria-hidden style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Building: floors stack bottom-up; a slim roof cap sits on top. */}
        <div style={{ display: "flex", flexDirection: "column-reverse", alignItems: "center", gap: 4 }}>
          {/* roof cap (animates in last, with the top floor) */}
          <div
            className="wlb-floor"
            style={{
              width: 40,
              height: 8,
              background: "var(--color-navy)",
              borderRadius: "3px 3px 0 0",
              transformOrigin: "bottom",
              animation: `wlb-floor 2.6s ease-in-out ${(FLOORS.length * 0.26).toFixed(2)}s infinite`,
            }}
          />
          {FLOORS.map((i) => (
            <div
              key={i}
              className="wlb-floor"
              style={{
                width: 92,
                height: 22,
                borderRadius: 3,
                background: "var(--color-navy)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transformOrigin: "bottom",
                animation: `wlb-floor 2.6s ease-in-out ${(i * 0.26).toFixed(2)}s infinite`,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 1.5, background: "var(--color-teal)", opacity: 0.85 }} />
              <span style={{ width: 9, height: 9, borderRadius: 1.5, background: "var(--color-teal)", opacity: 0.55 }} />
              <span style={{ width: 9, height: 9, borderRadius: 1.5, background: "var(--color-teal)", opacity: 0.85 }} />
            </div>
          ))}
        </div>
        {/* ground line */}
        <div style={{ marginTop: 5, width: 128, height: 3, borderRadius: 2, background: "var(--color-grid)" }} />
      </div>

      <p className="mt-8 text-[17px] font-semibold text-navy">
        Building your watch list
        <span className="wlb-dots" style={{ animation: "wlb-dots 1.4s ease-in-out infinite" }}>
          …
        </span>
      </p>
      <p className="mt-1.5 text-[13.5px] text-muted-foreground">
        Scoring every operator against your criteria.
      </p>
    </div>
  );
}
