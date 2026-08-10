import { memo } from 'react';
import { Square } from 'lucide-react';
import type { TickState } from '../lib/player';
import type { MorseWords } from '../lib/morse';
import { cn } from '../utils/cn';
import { fmtDuration } from '../lib/utils';

interface Props {
  tick: TickState;
  words: MorseWords;
  unitMs: number;
  onSpeed: (u: number) => void;
  onStop: () => void;
}

const SPEEDS: { label: string; unit: number }[] = [
  { label: '0.75×', unit: 82 },
  { label: '1×', unit: 62 },
  { label: '1.5×', unit: 46 },
];

/**
 * Live transmitter readout — shows the character currently on air, its morse
 * symbols lighting up in sync with the tone, and the surrounding word so the
 * signal never loses context.
 */
function LiveDisplay({ tick, words, unitMs, onSpeed, onStop }: Props) {
  const word = words[tick.wordIdx] ?? [];
  const letter = tick.letterIdx >= 0 ? word[tick.letterIdx] : undefined;
  const isWordGap = tick.kind === 'word-gap';

  return (
    <div className="mt-5 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-2)] p-3.5 sm:p-4">
      {/* header row */}
      <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="label-caps text-glow !text-[var(--accent)]">Transmitting</span>
        </div>
        <span className="mono text-[10.5px] text-[var(--muted)]">
          WORD {Math.min(tick.wordIdx + 1, words.length)}/{words.length}
          {letter && ` · LETTER ${tick.letterIdx + 1}/${word.length}`}
          {' · '}{fmtDuration(tick.totalMs)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="seg !p-0.5">
            {SPEEDS.map(s => (
              <button
                key={s.label}
                type="button"
                onClick={() => onSpeed(s.unit)}
                className={cn('!min-h-7 !px-2.5 !text-[10px]', unitMs === s.unit && 'active')}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn danger h-8 w-8" onClick={onStop} aria-label="Stop">
            <Square size={12} className="fill-current" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* current character on air */}
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'grid h-[74px] w-[74px] shrink-0 place-items-center rounded-[var(--radius-sm)] border text-[34px] font-bold transition-all duration-100',
              isWordGap
                ? 'border-[var(--line)] text-[var(--muted)]'
                : 'border-[var(--accent)] bg-[var(--accent-soft)] text-glow text-[var(--accent)]',
            )}
          >
            {isWordGap ? '/' : letter?.char ?? ''}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label-caps !text-[9.5px]">
              {isWordGap ? 'Word break' : 'On air'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {letter
                ? letter.morse.split('').map((s, i) => (
                    <span
                      key={i}
                      className={cn(
                        'sym !h-8 !min-w-8',
                        tick.symbolIdx === i && tick.kind !== 'letter-gap' ? 'live' : tick.symbolIdx > i ? 'done' : undefined,
                      )}
                    >
                      {s === '.' ? (
                        <span className="h-2 w-2 rounded-full bg-current" />
                      ) : (
                        <span className="h-2 w-4 rounded-full bg-current" />
                      )}
                    </span>
                  ))
                : (
                  <span className="mono text-[11px] text-[var(--muted)]">···&nbsp;&nbsp;&nbsp;space between words&nbsp;&nbsp;&nbsp;···</span>
                )}
            </div>
          </div>
        </div>

        {/* current word context */}
        <div className="min-w-0 flex-1">
          <span className="label-caps mb-1.5 block !text-[9.5px]">Word {tick.wordIdx + 1}</span>
          <div className="flex flex-wrap gap-1.5">
            {word.map((u, i) => (
              <span key={i} className={cn('wordchip', i === tick.letterIdx && 'live')}>
                <b className="font-bold">{u.char}</b>
                <span className="opacity-70">{u.morse}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="track mt-4">
        <div className="fill" style={{ width: `${tick.progress * 100}%` }} />
      </div>
    </div>
  );
}

export default memo(LiveDisplay);
