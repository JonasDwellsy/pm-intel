const QUADRANTS = [
  { id: "mf-institutional", label: "MF / BTR", subLabel: "Institutional", row: 0, col: 1 },
  { id: "mf-independent", label: "MF / BTR", subLabel: "Independent", row: 0, col: 0 },
  { id: "ss-institutional", label: "Scattered Site", subLabel: "Institutional", row: 1, col: 1 },
  { id: "ss-independent", label: "Scattered Site", subLabel: "Independent", row: 1, col: 0 },
];

function classify(q: string): string {
  const norm = q.toLowerCase();
  if (norm.includes("mf") || norm.includes("btr")) {
    return norm.includes("institutional") ? "mf-institutional" : "mf-independent";
  }
  return norm.includes("institutional") ? "ss-institutional" : "ss-independent";
}

export function QuadrantGrid({
  quadrant,
  hybrid = false,
}: {
  quadrant: string;
  hybrid?: boolean;
}) {
  const activeId = classify(quadrant);

  return (
    <div className="w-full">
      <div className="relative">
        <div className="grid grid-cols-2 grid-rows-2 gap-2">
          {QUADRANTS.map((q) => {
            const active = q.id === activeId;
            return (
              <div
                key={q.id}
                className={
                  "rounded-md border p-4 text-sm transition-colors " +
                  (active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-muted/30 text-muted-foreground")
                }
              >
                <div className="font-medium">{q.label}</div>
                <div className="text-xs opacity-80">{q.subLabel}</div>
              </div>
            );
          })}
        </div>
        {hybrid && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Hybrid operator — straddles two quadrants
          </p>
        )}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>← Independent</span>
        <span>Institutional →</span>
      </div>
    </div>
  );
}
