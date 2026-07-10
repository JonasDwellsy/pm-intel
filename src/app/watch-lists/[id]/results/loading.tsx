// Route-level loading UI for the watch-list results page. Applying a watch
// list scores the whole operator universe server-side, which takes a beat —
// long enough that a blank screen reads as broken. Next renders this instantly
// on navigation (from Save & Apply, Re-Run, or a direct link) while the results
// server component streams in. Pure CSS animation so it stays a server
// component (no client bundle). Keyframe/class names are wlb-prefixed to avoid
// colliding with global styles.

const FLOORS = [0, 1, 2, 3, 4];

export default function ResultsLoading() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-background px-6 text-center">
      <style>{`
        @keyframes wlb-rise {
          0%   { opacity: 0; transform: translateY(12px) scaleY(0.5); }
          55%  { opacity: 1; transform: translateY(0) scaleY(1); }
          100% { opacity: 1; transform: translateY(0) scaleY(1); }
        }
        @keyframes wlb-hook { 0%,100% { transform: translateY(0); } 50% { transform: translateY(7px); } }
        @keyframes wlb-dots { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .wlb-floor, .wlb-hookarm, .wlb-dots { animation: none !important; }
        }
      `}</style>

      <div style={{ position: "relative", width: 140, height: 156 }} aria-hidden>
        {/* Crane: mast + jib */}
        <div style={{ position: "absolute", left: 6, top: 0, bottom: 2, width: 3, background: "var(--color-teal)", opacity: 0.45, borderRadius: 2 }} />
        <div style={{ position: "absolute", left: 6, top: 4, width: 104, height: 3, background: "var(--color-teal)", opacity: 0.45, borderRadius: 2 }} />
        {/* Hook lowering a block */}
        <div
          className="wlb-hookarm"
          style={{ position: "absolute", left: 104, top: 7, display: "flex", flexDirection: "column", alignItems: "center", animation: "wlb-hook 1.9s ease-in-out infinite" }}
        >
          <div style={{ width: 1, height: 20, background: "var(--color-teal)", opacity: 0.55 }} />
          <div style={{ width: 36, height: 14, background: "var(--color-teal)", borderRadius: 2 }} />
        </div>
        {/* Floors rising bottom-up, staggered */}
        <div style={{ position: "absolute", left: 28, bottom: 0, display: "flex", flexDirection: "column-reverse", gap: 4 }}>
          {FLOORS.map((i) => (
            <div
              key={i}
              className="wlb-floor"
              style={{
                width: 84,
                height: 20,
                borderRadius: 3,
                background: "var(--color-navy)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transformOrigin: "bottom",
                animation: `wlb-rise 2.4s ease-in-out ${(i * 0.28).toFixed(2)}s infinite`,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 1, background: "var(--color-teal)", opacity: 0.8 }} />
              <span style={{ width: 8, height: 8, borderRadius: 1, background: "var(--color-teal)", opacity: 0.55 }} />
              <span style={{ width: 8, height: 8, borderRadius: 1, background: "var(--color-teal)", opacity: 0.8 }} />
            </div>
          ))}
        </div>
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
