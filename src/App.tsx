import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioWaveform, Type, Minus, Zap } from 'lucide-react';
import Translator from './components/Translator';
import SavedPanel from './components/SavedPanel';
import CharSheet from './components/CharSheet';
import { decodeMorse, encodeText, type MorseWords } from './lib/morse';
import { MorseEngine } from './lib/player';
import { copyText, loadJSON, removeKeys, saveJSON, uid } from './lib/utils';
import { cn } from './utils/cn';
import gsap from "gsap";

export type Mode = 'm2t' | 't2m';
export type Theme = 'simple' | 'cyber';

export interface Issue {
  tone: 'warn' | 'err';
  text: string;
}

export interface Session {
  input: string;
  output: string;
  issues: Issue[];
  words: MorseWords;
  stale: boolean;
}

export interface SaveEntry {
  id: string;
  input: string;
  output: string;
  ts: number;
}

const K_THEME = 'ditdah.theme';
const K_SESSIONS = 'ditdah.sessions';
const K_SAVES = 'ditdah.saves';
const MAX_SAVES = 100;

const emptySession = (): Session => ({ input: '', output: '', issues: [], words: [], stale: false });
const freshSessions = (): Record<Mode, Session> => ({ m2t: emptySession(), t2m: emptySession() });
const freshSaves = (): Record<Mode, SaveEntry[]> => ({ m2t: [], t2m: [] });

interface Computed {
  output: string;
  issues: Issue[];
  words: MorseWords;
}

function compute(mode: Mode, input: string): Computed {
  if (!input.trim()) return { output: '', issues: [], words: [] };
  if (mode === 't2m') {
    const r = encodeText(input);
    return {
      output: r.morse,
      issues: r.invalid.length
        ? [{ tone: 'warn', text: `${r.invalid.length} character${r.invalid.length > 1 ? 's' : ''} can't be morse-coded and were skipped: ${r.invalid.join('  ')}` }]
        : [],
      words: r.words,
    };
  }
  const r = decodeMorse(input);
  const issues: Issue[] = [];
  if (r.invalidChars.length)
    issues.push({ tone: 'err', text: `${r.invalidChars.length} invalid symbol${r.invalidChars.length > 1 ? 's' : ''} — not part of morse code: ${r.invalidChars.join('  ')}` });
  if (r.unknownSeqs.length)
    issues.push({ tone: 'warn', text: `${r.unknownSeqs.length} unrecognised sequence${r.unknownSeqs.length > 1 ? 's' : ''} skipped: ${r.unknownSeqs.join('  ')}` });
  return { output: r.text, issues, words: r.words };
}

function loadSessions(): Record<Mode, Session> {
  const raw = loadJSON<Record<Mode, Session> | null>(K_SESSIONS, null);
  const base = freshSessions();
  if (raw && typeof raw === 'object') {
    for (const m of ['m2t', 't2m'] as Mode[]) {
      const s = raw[m];
      if (s && typeof s.input === 'string') {
        base[m] = {
          input: s.input,
          output: typeof s.output === 'string' ? s.output : '',
          issues: Array.isArray(s.issues) ? s.issues : [],
          words: Array.isArray(s.words) ? s.words : [],
          stale: Boolean(s.stale),
        };
      }
    }
  }
  return base;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = loadJSON<string>(K_THEME, 'simple');
    return t === 'cyber' ? 'cyber' : 'simple';
  });
  const [mode, setMode] = useState<Mode>('m2t');
  const [sessions, setSessions] = useState<Record<Mode, Session>>(loadSessions);
  const [saves, setSaves] = useState<Record<Mode, SaveEntry[]>>(() => {
    const raw = loadJSON<Record<Mode, SaveEntry[]> | null>(K_SAVES, null);
    const base = freshSaves();
    if (raw && typeof raw === 'object') {
      for (const m of ['m2t', 't2m'] as Mode[]) {
        if (Array.isArray(raw[m])) base[m] = raw[m].filter(e => e && typeof e.input === 'string').slice(0, MAX_SAVES);
      }
    }
    return base;
  });
  const [toast, setToast] = useState<{ id: number; msg: string; tone: 'ok' | 'err' } | null>(null);

  const engineRef = useRef<MorseEngine | null>(null);
  if (!engineRef.current) engineRef.current = new MorseEngine();
  const engine = engineRef.current;

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const savesRef = useRef(saves);
  savesRef.current = saves;
  const timers = useRef<Partial<Record<Mode, number>>>({});
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), msg, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 2300);
  }, []);

  /* ---------- theme ---------- */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'cyber' ? '#030609' : '#F4F3EE');
    saveJSON(K_THEME, theme);
  }, [theme]);

  /* ---------- persistence (debounced for keystrokes, flushed on exit) ---------- */
  const persist = useCallback(() => {
    saveJSON(K_SESSIONS, sessionsRef.current);
    saveJSON(K_SAVES, savesRef.current);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(persist, 600);
    return () => window.clearTimeout(t);
  }, [sessions, saves, persist]);
  useEffect(() => {
    window.addEventListener('beforeunload', persist);
    return () => window.removeEventListener('beforeunload', persist);
  }, [persist]);

  /* ---------- translation ---------- */
  const runTranslate = useCallback((m: Mode, inputOverride?: string): MorseWords => {
    const input = inputOverride ?? sessionsRef.current[m].input;
    const c = compute(m, input);
    setSessions(prev => ({
      ...prev,
      [m]: { input, output: c.output, issues: c.issues, words: c.words, stale: false },
    }));
    return c.words;
  }, []);

  const handleInput = useCallback((v: string) => {
    const m = mode;
    setSessions(prev => ({ ...prev, [m]: { ...prev[m], input: v, stale: true } }));
    window.clearTimeout(timers.current[m]);
    // hidden behaviour — the signal resolves itself shortly after typing
    timers.current[m] = window.setTimeout(() => runTranslate(m), 2000);
  }, [mode, runTranslate]);

  /* ---------- actions ---------- */
  const handleSave = useCallback(() => {
    const s = sessionsRef.current[mode];
    const c = s.stale ? compute(mode, s.input) : { output: s.output, issues: s.issues, words: s.words };
    if (!c.output) {
      showToast(s.input.trim() ? 'Nothing translatable to save' : 'Nothing to save yet', 'err');
      return;
    }
    setSessions(prev => ({
      ...prev,
      [mode]: { input: s.input, output: c.output, issues: c.issues, words: c.words, stale: false },
    }));
    const list = savesRef.current[mode];
    if (list.some(e => e.input === s.input && e.output === c.output)) {
      showToast('Already in your saved list');
      return;
    }
    const entry: SaveEntry = { id: uid(), input: s.input, output: c.output, ts: Date.now() };
    setSaves(prev => ({ ...prev, [mode]: [entry, ...prev[mode]].slice(0, MAX_SAVES) }));
    showToast('Translation saved');
  }, [mode, showToast]);

  const handleClear = useCallback(() => {
    window.clearTimeout(timers.current[mode]);
    engine.stop(true);
    setSessions(prev => ({ ...prev, [mode]: emptySession() }));
  }, [mode, engine]);

  const handleWipe = useCallback(() => {
    (Object.keys(timers.current) as Mode[]).forEach(m => window.clearTimeout(timers.current[m]));
    engine.stop(true);
    removeKeys([K_SESSIONS, K_SAVES]);
    setSessions(freshSessions());
    setSaves(freshSaves());
    showToast('All translators and saved data cleared');
  }, [engine, showToast]);

  const handleSendOther = useCallback(() => {
    const s = sessionsRef.current[mode];
    if (!s.input.trim()) {
      showToast('Nothing to send yet', 'err');
      return;
    }
    const c = s.stale ? compute(mode, s.input) : { output: s.output, issues: s.issues, words: s.words };
    if (!c.output) {
      showToast('No output to send', 'err');
      return;
    }
    const other: Mode = mode === 'm2t' ? 't2m' : 'm2t';
    window.clearTimeout(timers.current[other]);
    engine.stop(true);
    setSessions(prev => ({
      ...prev,
      [mode]: { input: s.input, output: c.output, issues: c.issues, words: c.words, stale: false },
    }));
    runTranslate(other, c.output);
    setMode(other);
    showToast(other === 't2m' ? 'Sent to Text → Morse' : 'Sent to Morse → Text');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [mode, engine, runTranslate, showToast]);

  const handleCopyOutput = useCallback(() => {
    const out = sessionsRef.current[mode].output;
    if (!out) return;
    copyText(out).then(ok => showToast(ok ? 'Output copied' : 'Copy failed', ok ? 'ok' : 'err'));
  }, [mode, showToast]);

  const handleLoad = useCallback((m: Mode, entry: SaveEntry) => {
    window.clearTimeout(timers.current[m]);
    engine.stop(true);
    runTranslate(m, entry.input);
    setMode(m);
    showToast('Loaded into translator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [engine, runTranslate, showToast]);

  const handleDelete = useCallback((m: Mode, id: string) => {
    setSaves(prev => ({ ...prev, [m]: prev[m].filter(e => e.id !== id) }));
  }, []);

  const handleClearList = useCallback((m: Mode) => {
    setSaves(prev => ({ ...prev, [m]: [] }));
    saveJSON(K_SAVES, { ...savesRef.current, [m]: [] });
    showToast('Saved list cleared');
  }, [showToast]);

  const session = sessions[mode];

  const navRef = useRef<HTMLElement>(null);

 useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (!navRef.current) return;

      if (currentScrollY > lastScrollY && currentScrollY > 25) {
        // Scroll Down → Hide Navbar
        gsap.to(navRef.current, {
          yPercent: -100,
          duration: 0.3,
          ease: "ease-in-out",
        });
      } else {
        // Scroll Up → Show Navbar
        gsap.to(navRef.current, {
          yPercent: 0,
          duration: 0.3,
          ease: "eaes-in-out",
        });
      }

      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);
  
  return (
    <div className="min-h-screen">
      {/* ================= HEADER ================= */}
      <header
        ref={navRef}
        className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{ background: 'color-mix(in srgb, var(--bg) 80%, transparent)', borderColor: 'var(--line)' }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <div className="flex items-center gap-3">
            <svg width="30" height="16" viewBox="0 0 30 16" aria-hidden className="shrink-0">
              <circle cx="5" cy="8" r="4.2" fill="var(--accent)" className="sig-dot" />
              <rect x="12" y="4" width="13" height="8" rx="2.5" fill="var(--ink)" className="sig-dash" />
            </svg>
            <div className="flex items-baseline gap-2">
              <span className="text-[16px] font-bold tracking-tight sm:text-[17px]">DIT·DAH</span>
              <span className="mono hidden text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] sm:inline">
                morse translator
              </span>
            </div>
          </div>

          <div className="seg w-[200px]" role="tablist" aria-label="Theme">
            <button type="button" className={cn(theme === 'simple' && 'active')} onClick={() => setTheme('simple')}>
              <Minus size={13} /> Simple
            </button>
            <button type="button" className={cn(theme === 'cyber' && 'active')} onClick={() => setTheme('cyber')}>
              <Zap size={13} /> Cyber
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-7 sm:px-6 sm:pt-10">
        {/* ================= HERO + MODE ================= */}
        <div className="mb-6 flex flex-col gap-5 lg:mb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <h1 className="text-[30px] font-bold leading-[1.06] tracking-tight sm:text-[42px]">
              Every signal,{' '}
              <span className="text-[var(--accent)]">translated.</span>
            </h1>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--ink-2)] sm:text-[14.5px]">
              Morse to text and text to morse — precise, limitless, with a live audio transmitter.
            </p>
          </div>
          <div className="seg w-full sm:w-[360px]" role="tablist" aria-label="Translator mode">
            <button
              type="button"
              className={cn(mode === 'm2t' && 'active')}
              onClick={() => setMode('m2t')}
            >
              <AudioWaveform size={14} />
              Morse&nbsp;→&nbsp;Text
            </button>
            <button
              type="button"
              className={cn(mode === 't2m' && 'active')}
              onClick={() => setMode('t2m')}
            >
              <Type size={14} />
              Text&nbsp;→&nbsp;Morse
            </button>
          </div>
        </div>

        {/* ================= WORKSPACE ================= */}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
          <Translator
            mode={mode}
            session={session}
            engine={engine}
            onInput={handleInput}
            onTranslate={() => runTranslate(mode)}
            onSave={handleSave}
            onClear={handleClear}
            onWipe={handleWipe}
            onSendOther={handleSendOther}
            onCopyOutput={handleCopyOutput}
          />

          <div className="flex flex-col gap-5">
            <CharSheet engine={engine} />
            <SavedPanel
              saves={saves}
              onLoad={handleLoad}
              onCopy={t => copyText(t).then(ok => showToast(ok ? 'Copied' : 'Copy failed', ok ? 'ok' : 'err'))}
              onDelete={handleDelete}
              onClearList={handleClearList}
            />
          </div>
        </div>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-[var(--line)]/60 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            ITU-R M.1677-1
          </span>
          <span className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            DitDah
          </span>
        </div>
      </footer>

      {/* ================= TOAST ================= */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="toast fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2.5 rounded-full border px-4 py-2.5 shadow-2xl"
          style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--bg)' }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: toast.tone === 'ok' ? 'var(--ok)' : 'var(--err)' }}
          />
          <span className="mono text-[11.5px] tracking-wide">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
