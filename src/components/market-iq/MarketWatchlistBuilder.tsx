"use client";

import { useState, type FormEvent } from "react";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import type {
  MarketIqGeographyType,
  MarketIqPropertyType,
  MarketIqWatchlistView,
} from "@/lib/market-iq/watchlists";

const bedroomOptions = [0, 1, 2, 3, 4] as const;

function scopeLabel(watchlist: MarketIqWatchlistView) {
  if (watchlist.geographyType === "msa") return "Full Cleveland MSA";
  return watchlist.geographyValues.join(", ");
}

export function MarketWatchlistBuilder({
  initialWatchlists,
}: {
  initialWatchlists: MarketIqWatchlistView[];
}) {
  const [watchlists, setWatchlists] = useState(initialWatchlists);
  const [open, setOpen] = useState(initialWatchlists.length === 0);
  const [name, setName] = useState("Cleveland core apartments");
  const [geographyType, setGeographyType] = useState<MarketIqGeographyType>("msa");
  const [geographyText, setGeographyText] = useState("");
  const [propertyTypes, setPropertyTypes] = useState<MarketIqPropertyType[]>(["apartment", "house"]);
  const [bedrooms, setBedrooms] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleProperty(value: MarketIqPropertyType) {
    setPropertyTypes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  function toggleBedroom(value: number) {
    setBedrooms((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/market-iq/watchlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          marketId: CLEVELAND_MARKET_ID,
          geographyType,
          geographyValues: geographyText.split(",").map((item) => item.trim()).filter(Boolean),
          propertyTypes,
          bedroomCounts: bedrooms,
          alertsEnabled: true,
          alertCadence: "weekly",
        }),
      });
      const payload = (await response.json()) as { watchlist?: MarketIqWatchlistView; error?: string };
      if (!response.ok || !payload.watchlist) throw new Error(payload.error || "Could not save watchlist.");
      setWatchlists((current) => [payload.watchlist!, ...current]);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save watchlist.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="watchlists-heading" className="mt-10 rounded-lg border border-grid bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="dq-eyebrow">Saved monitoring</p>
          <h2 id="watchlists-heading" className="dq-h2">Your Market IQ watchlists</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Save a city, ZIP code, or full-market product segment. Weekly alerts will use this exact scope when new trend data arrives.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy/90"
        >
          {open ? "Close builder" : "Build a watchlist"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-6 grid gap-5 rounded-lg border border-teal/25 bg-teal-soft p-5 lg:grid-cols-2">
          <label className="text-sm font-semibold text-navy">
            Watchlist name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-md border border-grid bg-white px-3 py-2.5 font-normal text-foreground outline-none focus:border-teal"
              maxLength={80}
              required
            />
          </label>

          <label className="text-sm font-semibold text-navy">
            Geography level
            <select
              value={geographyType}
              onChange={(event) => setGeographyType(event.target.value as MarketIqGeographyType)}
              className="mt-2 w-full rounded-md border border-grid bg-white px-3 py-2.5 font-normal text-foreground outline-none focus:border-teal"
            >
              <option value="msa">Full Cleveland MSA</option>
              <option value="city">Cities</option>
              <option value="zip">ZIP codes</option>
            </select>
          </label>

          {geographyType !== "msa" && (
            <label className="text-sm font-semibold text-navy lg:col-span-2">
              {geographyType === "city" ? "Cities" : "ZIP codes"}
              <input
                value={geographyText}
                onChange={(event) => setGeographyText(event.target.value)}
                placeholder={geographyType === "city" ? "Cleveland, Lakewood, Shaker Heights" : "44113, 44118, 44120"}
                className="mt-2 w-full rounded-md border border-grid bg-white px-3 py-2.5 font-normal text-foreground outline-none focus:border-teal"
                required
              />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">Separate multiple selections with commas.</span>
            </label>
          )}

          <fieldset>
            <legend className="text-sm font-semibold text-navy">Product type</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["apartment", "house"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={propertyTypes.includes(value)}
                  onClick={() => toggleProperty(value)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium capitalize ${propertyTypes.includes(value) ? "border-navy bg-navy text-white" : "border-grid bg-white text-navy"}`}
                >
                  {value}s
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-navy">Bedrooms <span className="font-normal text-muted-foreground">(all if blank)</span></legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {bedroomOptions.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={bedrooms.includes(value)}
                  onClick={() => toggleBedroom(value)}
                  className={`min-w-10 rounded-full border px-3 py-1.5 text-sm font-medium ${bedrooms.includes(value) ? "border-navy bg-navy text-white" : "border-grid bg-white text-navy"}`}
                >
                  {value === 0 ? "Studio" : value === 4 ? "4+" : value}
                </button>
              ))}
            </div>
          </fieldset>

          {error && <p role="alert" className="text-sm font-medium text-bad lg:col-span-2">{error}</p>}
          <div className="flex items-center justify-between gap-3 border-t border-teal/20 pt-4 lg:col-span-2">
            <p className="text-xs text-muted-foreground">Weekly narrative alerts are enabled by default.</p>
            <button disabled={saving || propertyTypes.length === 0} className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Saving..." : "Save watchlist"}
            </button>
          </div>
        </form>
      )}

      {watchlists.length > 0 ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {watchlists.map((watchlist) => (
            <article key={watchlist.id} className="rounded-lg border border-grid p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-navy">{watchlist.name}</h3>
                <span className="rounded-full bg-good-soft px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-good">Weekly</span>
              </div>
              <p className="mt-3 text-sm text-foreground/80">{scopeLabel(watchlist)}</p>
              <p className="mt-1 text-xs capitalize text-muted-foreground">
                {watchlist.propertyTypes.join(" + ")} · {watchlist.bedroomCounts.length ? `${watchlist.bedroomCounts.join(", ")} bedrooms` : "All bedroom counts"}
              </p>
            </article>
          ))}
        </div>
      ) : !open ? (
        <p className="mt-6 rounded-lg bg-surface-soft p-4 text-sm text-muted-foreground">No Market IQ watchlists saved yet.</p>
      ) : null}
    </section>
  );
}
