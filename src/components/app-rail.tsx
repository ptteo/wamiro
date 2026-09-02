"use client";

const WORDS = 8;

function Word() {
  return (
    <span className="wamiro-rail-word pb-16 text-[10px] font-semibold tracking-[0.22em] text-brand [text-orientation:upright] [writing-mode:vertical-rl]">
      WAMIRO
    </span>
  );
}

/**
 * Desktop-only brand strip: repeating WAMIRO with a gap between words,
 * looping slowly. Hidden below md.
 */
export function AppRail() {
  return (
    <aside
      aria-hidden
      className="wamiro-rail fixed inset-y-0 left-0 z-30 hidden w-8 overflow-hidden border-r border-border-subtle bg-surface md:flex"
    >
      <div className="relative flex h-full w-full items-start justify-center [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]">
        <div className="wamiro-rail-shine" />
        <div className="wamiro-rail-track flex shrink-0 flex-col items-center">
          {[0, 1].map((copy) =>
            Array.from({ length: WORDS }, (_, i) => (
              <Word key={`${copy}-${i}`} />
            )),
          )}
        </div>
      </div>
    </aside>
  );
}
