export default function HomeLoading() {
  return (
    <div className="paper-grain text-ink">
      {/* Masthead placeholder */}
      <div className="border-y border-ink/20 bg-paper-light/60">
        <div className="container mx-auto px-6 py-2.5 flex items-center justify-between font-mono text-[10px] md:text-[11px] uppercase tracking-[0.22em] text-ink-muted">
          <span>Dossiê Eleitoral</span>
          <span className="hidden sm:inline opacity-60">carregando edição…</span>
          <span className="h-3 w-28 bg-ink/10 rounded-sm animate-pulse" />
        </div>
      </div>

      {/* Hero skeleton */}
      <section className="container mx-auto px-6 pt-16 md:pt-24 pb-14">
        <div className="grid grid-cols-12 gap-x-8 gap-y-10">
          <div className="col-span-12 md:col-span-8 space-y-6">
            <div className="h-3 w-56 bg-ember/40 rounded-sm animate-pulse" />
            <div className="space-y-3">
              <div className="h-14 md:h-20 w-11/12 bg-ink/10 rounded-sm animate-pulse" />
              <div className="h-14 md:h-20 w-10/12 bg-ink/10 rounded-sm animate-pulse" />
              <div className="h-14 md:h-20 w-9/12 bg-ink/10 rounded-sm animate-pulse" />
            </div>
            <div className="pt-6 space-y-2 max-w-xl">
              <div className="h-3 w-full bg-ink/10 rounded-sm animate-pulse" />
              <div className="h-3 w-11/12 bg-ink/10 rounded-sm animate-pulse" />
              <div className="h-3 w-8/12 bg-ink/10 rounded-sm animate-pulse" />
            </div>
          </div>
          <aside className="col-span-12 md:col-span-4 md:pl-8 md:border-l md:border-ink/15 space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-2.5 w-20 bg-ink/15 rounded-sm animate-pulse" />
                <div className="h-4 w-11/12 bg-ink/10 rounded-sm animate-pulse" />
              </div>
            ))}
          </aside>
        </div>

        {/* Search skeleton */}
        <div className="mt-16 md:mt-20 border-y-2 border-ink h-16 md:h-20 flex items-center px-5 animate-pulse">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            § Carregando arquivo…
          </span>
        </div>
      </section>

      {/* Stats skeleton */}
      <section className="border-y-2 border-ink bg-paper-dark/40">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-ink/15">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="px-5 md:px-8 py-10 flex flex-col justify-between min-h-[180px]"
              >
                <div className="h-2.5 w-6 bg-ink/15 rounded-sm animate-pulse" />
                <div className="space-y-3">
                  <div className="h-14 md:h-20 w-24 bg-ink/15 rounded-sm animate-pulse" />
                  <div className="h-3 w-28 bg-ink/10 rounded-sm animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Candidates skeleton */}
      <section className="container mx-auto px-6 pt-20 md:pt-28 pb-16">
        <div className="mb-12 space-y-4">
          <div className="h-3 w-28 bg-ember/40 rounded-sm animate-pulse" />
          <div className="h-10 md:h-12 w-96 max-w-full bg-ink/10 rounded-sm animate-pulse" />
          <div className="h-3 w-72 max-w-full bg-ink/10 rounded-sm animate-pulse" />
        </div>
        <ol className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 border-t border-ink/25">
          {Array.from({ length: 8 }).map((_, i) => (
            <li
              key={i}
              className="flex items-start gap-5 py-7 border-b border-ink/20"
            >
              <span className="font-mono text-[11px] tracking-[0.1em] text-ink-soft tabular-nums pt-1.5 w-8 shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-ink/10 border border-ink/15 shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0 space-y-3 pt-1.5">
                <div className="h-6 w-2/3 bg-ink/15 rounded-sm animate-pulse" />
                <div className="h-3 w-1/3 bg-ink/10 rounded-sm animate-pulse" />
                <div className="h-3 w-4/5 bg-ink/10 rounded-sm animate-pulse" />
              </div>
              <div className="pt-2 shrink-0 min-w-[64px] space-y-2 text-right">
                <div className="h-7 w-12 ml-auto bg-ink/15 rounded-sm animate-pulse" />
                <div className="h-2 w-14 ml-auto bg-ink/10 rounded-sm animate-pulse" />
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
