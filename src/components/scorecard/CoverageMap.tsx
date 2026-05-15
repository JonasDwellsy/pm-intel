import { SectionHead } from "./SectionHead";
import type { ScorecardData } from "@/lib/types";
import { fmtInt } from "@/lib/format";

// Stylized inline-SVG MSA map. Not a literal geographic projection; replace
// with Mapbox / MapLibre tile in production. Operator-of-record city is
// orange-haloed; secondary cities are muted dots.
function StylizedMap({ city, msaName }: { city: string; msaName: string }) {
  return (
    <svg
      viewBox="0 0 880 380"
      className="block h-auto w-full rounded"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="880" height="380" fill="#F2F5F8" />
      <path
        d="M70,90 C110,40 250,30 360,55 C470,80 560,40 700,70 C820,95 830,200 800,260 C770,320 650,360 520,340 C400,322 300,360 200,330 C100,300 40,250 50,180 C56,140 50,120 70,90 Z"
        fill="#fff"
        stroke="#D5DBE3"
        strokeWidth="1.5"
      />
      <path
        d="M260,55 C265,160 250,260 240,335"
        stroke="#D5DBE3"
        strokeWidth="1"
        fill="none"
      />
      <path
        d="M500,40 C510,180 490,300 510,340"
        stroke="#D5DBE3"
        strokeWidth="1"
        fill="none"
      />
      <path
        d="M70,200 C260,205 520,210 800,215"
        stroke="#D5DBE3"
        strokeWidth="1"
        fill="none"
      />
      <text
        x="780"
        y="100"
        fill="#8A92A2"
        textAnchor="end"
        fontSize="11"
        fontWeight="600"
        letterSpacing="0.18em"
        style={{ textTransform: "uppercase" }}
      >
        {msaName}
      </text>
      {/* Primary city */}
      <g>
        <circle cx="430" cy="195" r="22" fill="#D97834" opacity="0.14" />
        <circle cx="430" cy="195" r="9" fill="#D97834" stroke="#fff" strokeWidth="2.5" />
        <text x="446" y="192" fill="#0F1F3F" fontSize="14" fontWeight="700">
          {city}
        </text>
      </g>
      {/* Secondary cities (positional only) */}
      {[
        { x: 290, y: 155, label: "Cleveland" },
        { x: 600, y: 170, label: "Dalton" },
        { x: 490, y: 270, label: "Fort Oglethorpe" },
        { x: 350, y: 280, label: "Trenton" },
        { x: 220, y: 240, label: "South Pittsburg" },
      ].map((c) => (
        <g key={c.label}>
          <circle cx={c.x} cy={c.y} r="3" fill="#5C6573" />
          <text
            x={c.x + 8}
            y={c.y + 4}
            fill="#5C6573"
            fontSize="11"
            fontWeight="500"
          >
            {c.label}
          </text>
        </g>
      ))}
      {/* Scale bar */}
      <g transform="translate(60,330)">
        <line x1="0" y1="0" x2="80" y2="0" stroke="#5C6573" strokeWidth="1.5" />
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#5C6573" strokeWidth="1.5" />
        <line x1="80" y1="-4" x2="80" y2="4" stroke="#5C6573" strokeWidth="1.5" />
        <text
          x="40"
          y="-8"
          textAnchor="middle"
          fill="#5C6573"
          fontSize="10"
          fontWeight="500"
        >
          20 mi
        </text>
      </g>
    </svg>
  );
}

export function CoverageMap({ scorecard }: { scorecard: ScorecardData }) {
  const { coverage, geographicCoverage, market } = scorecard;
  return (
    <section id="geography" className="dq-section">
      <SectionHead
        num="03"
        title="Geographic coverage"
        lede={`Where ${scorecard.pm.name}'s portfolio sits within the ${market.fullName} footprint.`}
      />
      <div className="rounded-lg border border-grid bg-white p-2">
        <StylizedMap city={market.name} msaName={market.fullName} />
      </div>
      <div className="mt-4 grid gap-6 px-2 py-4 md:grid-cols-[1fr_2fr_1.2fr]">
        <div>
          <p className="dq-eyebrow-muted mb-1.5">Cities observed</p>
          <p className="text-sm text-navy">
            <strong>{fmtInt(coverage.citiesObserved)}</strong> in the MSA
            footprint
          </p>
        </div>
        <div>
          <p className="dq-eyebrow-muted mb-1.5">Coverage concentration</p>
          <p className="text-sm text-navy">{geographicCoverage.citiesText}</p>
        </div>
        <div>
          <p className="dq-eyebrow-muted mb-1.5">Geographic posture</p>
          <p className="text-sm">
            <span className="dq-pill dq-pill-navy-soft">
              {coverage.citiesObserved === 1
                ? "Single-submarket"
                : coverage.citiesObserved <= 5
                  ? "Concentrated"
                  : "Multi-city"}
            </span>{" "}
            <span className="text-muted-foreground">
              {scorecard.pm.quadrant.split(" / ")[0]} footprint
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
