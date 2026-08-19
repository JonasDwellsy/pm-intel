export default function MarketIqLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading Market IQ"
      className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10"
    >
      <div className="animate-pulse">
        <div className="h-3 w-28 rounded bg-slate-200" />
        <div className="mt-5 grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_340px] lg:items-end">
          <div>
            <div className="h-10 max-w-2xl rounded-lg bg-slate-200" />
            <div className="mt-4 h-4 max-w-xl rounded bg-slate-100" />
            <div className="mt-2 h-4 max-w-md rounded bg-slate-100" />
          </div>
          <div className="h-28 rounded-2xl bg-slate-100" />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-32 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="h-3 w-20 rounded bg-slate-100" />
              <div className="mt-6 h-8 w-28 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-36 rounded bg-slate-100" />
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="h-3 w-32 rounded bg-slate-100" />
          <div className="mt-4 h-8 max-w-md rounded bg-slate-200" />
          <div className="mt-7 h-64 rounded-xl bg-slate-100" />
        </div>
      </div>
    </main>
  );
}
