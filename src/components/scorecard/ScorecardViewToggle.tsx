"use client";

// Scorecard A/B toggle — lets a viewer switch between the Classic (A) and
// New (B) scorecard render. Sets a per-browser cookie and reloads so the
// server picks up the chosen branch on the next request. Standalone client
// component: no imports from page.tsx, self-contained styling.

interface ScorecardViewToggleProps {
  currentView: "classic" | "new";
}

/** Small segmented pill switch. Copy is plain — "Classic" / "New" only. */
export function ScorecardViewToggle({ currentView }: ScorecardViewToggleProps) {
  function selectView(choice: "classic" | "new") {
    if (choice === currentView) return;
    document.cookie = `scorecard_view=${choice}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "#8894ac",
        }}
      >
        Scorecard:
      </span>

      <div
        role="group"
        aria-label="Scorecard view"
        style={{
          display: "inline-flex",
          border: "1px solid #d7dce5",
          borderRadius: "20px",
          background: "#f2f5f8",
          padding: "2px",
        }}
      >
        <ToggleSegment
          label="Classic"
          active={currentView === "classic"}
          onClick={() => selectView("classic")}
        />
        <ToggleSegment
          label="New"
          active={currentView === "new"}
          onClick={() => selectView("new")}
        />
      </div>
    </div>
  );
}

function ToggleSegment({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        border: "none",
        borderRadius: "18px",
        padding: "3px 12px",
        fontSize: "11px",
        fontWeight: 600,
        cursor: active ? "default" : "pointer",
        background: active ? "#155772" : "transparent",
        color: active ? "#ffffff" : "#8894ac",
        transition: "background 0.15s ease, color 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}
