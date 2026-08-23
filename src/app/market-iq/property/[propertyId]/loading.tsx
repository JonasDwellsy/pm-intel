export default function MarketIqPropertyActivityLoading() {
  return <main className="mx-auto w-full max-w-[1400px] animate-pulse px-5 py-10 sm:px-6 lg:px-10">
    <div className="h-5 w-56 rounded bg-slate-200" />
    <div className="mt-5 h-[360px] rounded-3xl bg-slate-200" />
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 rounded-2xl bg-slate-100" />)}</div>
    <div className="mt-6 h-96 rounded-2xl bg-slate-100" />
  </main>;
}
