// Momentum section narrative — synthesizes the trajectory sparklines into one
// factual, 1-2 sentence story for the Momentum takeaway banner.
//
// Each signal carries BOTH a `net` direction (first observed → latest) and a
// `recent` direction (last few quarters), so the copy can convey texture the
// old single-label version hid — e.g. "larger overall but pulled back over
// recent quarters" instead of a bare "volatile". Strictly descriptive: no
// rank, no composite, no judgment words (see [[scorecard-sharpening-pr1]]).

export type TrendDir = "growing" | "stable" | "declining";
export type SignalKey = "portfolio" | "share" | "reach" | "quality" | "footprint";

export interface NarrativeSignal {
  key: SignalKey;
  net: TrendDir;
  recent: TrendDir;
  /** Series swings enough period-to-period that a flat net/recent still isn't a "steady" story. */
  volatile?: boolean;
}

// Subject rendered two ways: `first` leads the headline sentence (name's X),
// `mid` is the "its X" form used mid-sentence. `aux` handles has/have.
const SUBJ: Record<SignalKey, { first: (n: string) => string; mid: string; aux: "has" | "have" }> = {
  portfolio: { first: (n) => `${n}'s estimated portfolio`, mid: "its estimated portfolio", aux: "has" },
  share: { first: (n) => `${n}'s share of the market's new listings`, mid: "its share of the market's new listings", aux: "has" },
  reach: { first: (n) => `${n}'s geographic reach`, mid: "its geographic reach", aux: "has" },
  quality: { first: (n) => `${n}'s operating-quality signals`, mid: "its operating-quality signals", aux: "have" },
  footprint: { first: (n) => `${n}'s market footprint`, mid: "its market footprint", aux: "has" },
};

const VERB: Record<SignalKey, { growing: string; declining: string }> = {
  portfolio: { growing: "grown", declining: "shrunk" },
  share: { growing: "climbed", declining: "slipped" },
  reach: { growing: "widened", declining: "narrowed" },
  quality: { growing: "strengthened", declining: "softened" },
  footprint: { growing: "expanded", declining: "contracted" },
};

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Full-texture clause for the headline (driver) signal, subject led by the operator name. */
function headlineClause(name: string, s: NarrativeSignal): string {
  const subj = SUBJ[s.key].first(name);
  const aux = SUBJ[s.key].aux;
  const V = VERB[s.key];
  if (s.net === "stable" && s.recent === "stable") {
    return s.volatile
      ? `${subj} ${aux} swung from period to period without a clear net trend`
      : `${subj} ${aux} held steady`;
  }
  if (s.net === "stable") {
    return s.recent === "growing"
      ? `${subj} ${aux} held roughly steady, with a recent uptick`
      : `${subj} ${aux} held roughly steady, with a recent dip`;
  }
  if (s.net === s.recent) return `${subj} ${aux} ${V[s.net]}`; // monotone up or down
  if (s.net === "growing" && s.recent === "declining")
    return `${subj} ${aux} ${V.growing} overall but ${aux} pulled back over recent quarters`;
  if (s.net === "declining" && s.recent === "growing")
    return `${subj} ${aux} ${V.declining} overall but ${aux} firmed up over recent quarters`;
  if (s.net === "growing") return `${subj} ${aux} ${V.growing}, then leveled off recently`;
  return `${subj} ${aux} ${V.declining}, then steadied recently`;
}

/** Brief net-direction phrase for a supporting signal (no name, mid-sentence). */
function supportPhrase(s: NarrativeSignal): string | null {
  if (s.net === "stable") return null; // supporting steadies are omitted to keep it tight
  return `${SUBJ[s.key].mid} ${SUBJ[s.key].aux} ${VERB[s.key][s.net]}`;
}

/**
 * Build the momentum takeaway. `signals` holds only signals with enough history
 * (empty = not enough to read). `driverKey` names the headline signal (portfolio
 * when available, else the best-observed series); the rest become brief context.
 */
export function buildMomentumNarrative(
  name: string,
  signals: NarrativeSignal[],
  driverKey: SignalKey | null
): string {
  if (signals.length === 0) return `Not enough history yet to read ${name}'s trajectory.`;
  const driver = signals.find((s) => s.key === driverKey) ?? signals[0];
  const head = cap(headlineClause(name, driver)) + ".";

  const others = signals.filter((s) => s !== driver);
  const ups = others.filter((s) => s.net === "growing").map(supportPhrase).filter((p): p is string => !!p);
  const downs = others.filter((s) => s.net === "declining").map(supportPhrase).filter((p): p is string => !!p);

  let context = "";
  if (ups.length && downs.length) context = ` Alongside, ${joinList(ups)}, though ${joinList(downs)}.`;
  else if (ups.length) context = ` Alongside, ${joinList(ups)}.`;
  else if (downs.length) context = ` Meanwhile, ${joinList(downs)}.`;

  return head + context;
}
