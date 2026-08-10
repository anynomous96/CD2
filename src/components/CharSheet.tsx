import { memo, useCallback, useEffect, useState } from 'react';
import { BookOpenText, ChevronDown } from 'lucide-react';
import { SHEET_LETTERS, SHEET_PUNCT } from '../lib/morse';
import type { MorseEngine } from '../lib/player';
import { cn } from '../utils/cn';

interface Props {
  engine: MorseEngine;
}

/** Interactive ITU reference — every character sounds itself out on press. */
function CharSheet({ engine }: Props) {
  const [open, setOpen] = useState(false);
  const [showPunct, setShowPunct] = useState(false);
  const [playingChar, setPlayingChar] = useState<string | null>(null);

  useEffect(() => engine.addListener(t => { if (!t) setPlayingChar(null); }), [engine]);

  const press = useCallback((char: string, morse: string) => {
    if (playingChar === char) {
      engine.stop(true);
      return;
    }
    if (engine.play([[{ char, morse }]], 66, 620, 'sheet')) setPlayingChar(char);
  }, [engine, playingChar]);

  const rows = showPunct ? [...SHEET_LETTERS, ...SHEET_PUNCT] : SHEET_LETTERS;

  return (
    <section className="panel fade-up p-4 sm:p-5" style={{ animationDelay: '40ms' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 text-left"
        aria-expanded={open}
      >
        <BookOpenText size={16} className="text-[var(--accent)]" />
        <h2 className="text-[15px] font-bold tracking-tight">Signal reference</h2>
        <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
          ITU alphabet
        </span>
        <ChevronDown
          size={16}
          className={cn('ml-auto text-[var(--muted)] transition-transform duration-300', open && 'rotate-180')}
        />
      </button>

      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          open ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="seg mb-3 max-w-[240px]">
            <button type="button" className={cn('!min-h-8', !showPunct && 'active')} onClick={() => setShowPunct(false)}>
              A–Z · 0–9
            </button>
            <button type="button" className={cn('!min-h-8', showPunct && 'active')} onClick={() => setShowPunct(true)}>
              + Punctuation
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-9">
            {rows.map(([char, morse]) => (
              <button
                key={char}
                type="button"
                onClick={() => press(char, morse)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-2)] px-1 py-2 transition-all duration-100 hover:border-[var(--accent)]/50 hover:text-[var(--accent)]',
                  playingChar === char && 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-[0_0_14px_var(--accent-glow)]',
                )}
                aria-label={`Play ${char}`}
              >
                <span className="text-[14px] font-bold leading-none">{char === '"' ? '”' : char}</span>
                <span className="mono text-[9px] leading-none tracking-wider opacity-70">{morse}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(CharSheet);
