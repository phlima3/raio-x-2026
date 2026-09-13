/** Esqueleto da home, no mesmo desenho da página: hero dividida e lista. */
export default function HomeLoading() {
  const bar = 'bg-ink/10 rounded-sm animate-pulse'
  return (
    <div className="paper-grain text-ink">
      <section className="container mx-auto px-4 md:px-6 pt-12 md:pt-16 pb-14 grid grid-cols-12 gap-y-10 md:gap-x-10 lg:gap-x-14 items-start">
        <div className="col-span-12 md:col-span-5 space-y-4">
          <div className={`h-12 lg:h-16 w-8/12 ${bar}`} />
          <div className={`h-12 lg:h-16 w-11/12 ${bar}`} />
          <div className={`h-12 lg:h-16 w-10/12 ${bar}`} />
          <div className={`mt-6 h-4 w-9/12 ${bar}`} />
          <div className={`mt-10 h-14 w-full border-2 border-ink/20 ${bar}`} />
        </div>
        <div className="col-span-12 md:col-span-7 grid grid-cols-4 md:grid-cols-5 gap-[2px] bg-ink/20 border-2 border-ink/20">
          {Array.from({ length: 13 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-paper-dark animate-pulse" />
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 md:px-6 py-16 md:py-20">
        <div className={`h-9 w-72 max-w-full mb-10 ${bar}`} />
        <ol className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 border-t border-ink/25">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex items-start gap-5 py-6 border-b border-ink/20">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-paper-dark border border-ink/15 shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0 space-y-3 pt-1.5">
                <div className={`h-6 w-2/3 ${bar}`} />
                <div className={`h-3 w-1/4 ${bar}`} />
                <div className={`h-3 w-4/5 ${bar}`} />
              </div>
              <div className="pt-1 shrink-0 w-[9.5rem] space-y-2">
                <div className={`h-7 w-24 ml-auto ${bar}`} />
                <div className={`h-2.5 w-20 ml-auto ${bar}`} />
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
