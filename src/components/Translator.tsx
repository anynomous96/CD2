import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Square, Bookmark, Trash2, Copy, ArrowRightLeft, ChevronRight, Radio,
} from 'lucide-react';
import type { Mode, Session } from '../App';
import type { MorseWords } from '../lib/morse';
import type { MorseEngine, TickState } from '../lib/player';
import { cn } from '../utils/cn';
import LiveDisplay from './LiveDisplay';

interface Props {
  mode: Mode;
  session: Session;
  engine: MorseEngine;
  onInput: (v: string) => void;
  onTranslate: () => MorseWords;
  onSave: () => void;
  onClear: () => void;
  onWipe: () => void;
  onSendOther: () => void;
  onCopyOutput: () => void;
}

/* Clear button with a hidden hold-trigger: a quick press clears the current
   translator; pressing and holding for 2s fires a full device wipe. */
function HoldClearButton({ onClear, onWipe }: { onClear: () => void; onWipe: () => void }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const startT = useRef(0);
  const fired = useRef(false);
  const R = 13;
  const C = 2 * Math.PI * R;

  const cancel = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setP(0);
  }, []);

  const begin = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    fired.current = false;
    startT.current = performance.now();
    const loop = (t: number) => {
      const pr = Math.min(1, (t - startT.current) / 2000);
      setP(pr);
      if (pr >= 1) {
        if (!fired.current) {
          fired.current = true;
          onWipe();
        }
        window.setTimeout(() => setP(0), 250);
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }, [onWipe]);

  const end = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const held = performance.now() - startT.current;
    if (!fired.current && held < 2000 && held < 400) onClear();
    window.setTimeout(() => setP(0), 120);
  }, [onClear]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <button
      type="button"
      aria-label="Clear"
      className={cn('icon-btn danger touch-none select-none', p > 0 && 'border-[var(--err)] text-[var(--err)]')}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerLeave={() => { if (!fired.current) cancel(); }}
      onPointerCancel={cancel}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClear();
        }
      }}
    >
      {p > 0 && (
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 40 40" aria-hidden>
          <circle cx="20" cy="20" r={R} fill="none" stroke="var(--err)" strokeOpacity="0.2" strokeWidth="2.5" />
          <circle
            cx="20" cy="20" r={R} fill="none"
            stroke="var(--err)" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - p)}
          />
        </svg>
      )}
      <Trash2 size={16} strokeWidth={2} />
    </button>
  );
}

const META: Record<Mode, {
  inputLabel: string; outputLabel: string; placeholder: string; inputFont: string;
}> = {
  m2t: {
    inputLabel: 'Input · Morse code',
    outputLabel: 'Output · Text',
    placeholder: 'Type morse code using dots and dashes — single space between letters,  /  or double space between words…',
    inputFont: 'mono',
  },
  t2m: {
    inputLabel: 'Input · Text',
    outputLabel: 'Output · Morse code',
    placeholder: 'Type any message to convert into morse code…',
    inputFont: 'font-sans',
  },
};

export default function Translator({
  mode, session, engine,
  onInput, onTranslate, onSave, onClear, onWipe, onSendOther, onCopyOutput,
}: Props) {
  const [tick, setTick] = useState<TickState | null>(null);
  const [unitMs, setUnitMs] = useState(62);
  const meta = META[mode];
  const canPlay = session.input.trim().length > 0;

  useEffect(() => engine.addListener(t => {
    if (!t) setTick(null);
    else if (t.tag === 'translator') setTick(t);
  }), [engine]);

  // stop playback as soon as the signal changes
  const prevInput = useRef(session.input);
  useEffect(() => {
    if (prevInput.current !== session.input) {
      prevInput.current = session.input;
      if (engine.playing) engine.stop(true);
    }
  }, [session.input, engine]);
  useEffect(() => () => engine.stop(false), [engine]);

  const handlePlay = useCallback(() => {
    if (tick) {
      engine.stop(true);
      return;
    }
    // ensure the latest input is translated, then transmit the fresh signal
    const words = onTranslate();
    if (words.length) engine.play(words, unitMs, 620, 'translator');
  }, [tick, engine, onTranslate, unitMs]);

  const changeSpeed = (u: number) => {
    setUnitMs(u);
    if (tick) {
      engine.stop(false);
      engine.play(session.words, u, 620, 'translator');
    }
  };

  const letterCount = session.words.reduce((n: number, w: MorseWords[number]) => n + w.length, 0);

  return (
    <section className="panel fade-up relative overflow-hidden p-4 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)]">
        {/* ---------- INPUT ---------- */}
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="label-caps">{meta.inputLabel}</span>
            <span className="mono text-[10.5px] text-[var(--muted)]">
              {session.input.length > 0 ? `${session.input.length} chars` : ''}
            </span>
          </div>
          <textarea
            value={session.input}
            onChange={e => onInput(e.target.value)}
            placeholder={meta.placeholder}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className={cn(
              'field min-h-[168px] resize-y sm:min-h-[196px]',
              meta.inputFont,
              mode === 'm2t' && 'text-[15px] tracking-[0.06em]',
            )}
          />
        </div>

        {/* ---------- CONTROLS ---------- */}
        <div className="flex flex-row flex-wrap items-center justify-center gap-2 lg:flex-col lg:gap-2.5 lg:py-6">
          <button type="button" onClick={() => onTranslate()} className="btn-primary lg:h-16 lg:w-16 lg:rounded-full lg:p-0" aria-label="Translate">
            <span className="lg:hidden">Translate</span>
            <ChevronRight size={20} strokeWidth={2.4} className="hidden lg:block" aria-hidden />
          </button>

          <button
            type="button"
            className="icon-btn"
            data-off={!canPlay && !tick ? 'true' : undefined}
            onClick={handlePlay}
            aria-label={tick ? 'Stop transmitter' : 'Play transmitter'}
          >
            {tick ? <Square size={15} className="fill-current" /> : <Play size={16} className="ml-0.5" />}
          </button>

          <button type="button" className="icon-btn" onClick={onSave} aria-label="Save translation">
            <Bookmark size={16} />
          </button>

          <button type="button" className="icon-btn" onClick={onSendOther} aria-label="Send output to the other translator">
            <ArrowRightLeft size={16} />
          </button>

          <HoldClearButton onClear={onClear} onWipe={onWipe} />
        </div>

        {/* ---------- OUTPUT ---------- */}
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="label-caps truncate">{meta.outputLabel}</span>
              {session.stale && (
                <span className="mono shrink-0 rounded-full border border-[var(--line)] px-2 py-0.5 text-[9.5px] uppercase tracking-[0.14em] text-[var(--warn)]">
                  edited
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="mono text-[10.5px] text-[var(--muted)]">
                {letterCount > 0 ? `${letterCount} letters` : ''}
              </span>
              <button
                type="button"
                className="icon-btn h-8 w-8"
                data-off={!session.output ? 'true' : undefined}
                onClick={onCopyOutput}
                aria-label="Copy output"
              >
                <Copy size={13} />
              </button>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => onTranslate()}
            onKeyDown={e => { if (e.key === 'Enter') onTranslate(); }}
            className={cn(
              'field flex min-h-[168px] flex-1 cursor-pointer flex-col gap-2 overflow-y-auto sm:min-h-[196px]',
            )}
          >
            {session.issues.map((iss: Session['issues'][number], i: number) => (
              <div key={i} className={cn('issue', iss.tone)}>
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                <span className="break-words">{iss.text}</span>
              </div>
            ))}
            {session.output ? (
              <p className={cn(
                'whitespace-pre-wrap break-words text-[16px] leading-[1.9]',
                mode === 't2m' ? 'mono tracking-[0.1em]' : 'font-medium tracking-[0.02em]',
                session.stale && 'opacity-50',
              )}>
                {session.output}
              </p>
            ) : session.issues.length === 0 ? (
              <p className="mono text-[12px] leading-relaxed text-[var(--muted)]/70">
                The translation will appear here.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------- LIVE TRANSMITTER ---------- */}
      {tick ? (
        <LiveDisplay
          tick={tick}
          words={session.words}
          unitMs={unitMs}
          onSpeed={changeSpeed}
          onStop={() => engine.stop(true)}
        />
      ) : (
        session.words.length > 0 && (
          <div className="mt-5 flex items-center gap-2.5 border-t border-[var(--line-2)] pt-4">
            <Radio size={13} className="text-[var(--muted)]" />
            <span className="mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--muted)]">
              Audio transmitter ready
            </span>
          </div>
        )
      )}
    </section>
  );
}
