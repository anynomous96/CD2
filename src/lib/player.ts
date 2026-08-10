import type { MorseWords } from './morse';

export interface TickState {
  wordIdx: number;          // current word
  letterIdx: number;        // current letter within word (-1 during word gap)
  symbolIdx: number;        // current symbol within letter (-1 during gaps)
  kind: 'dot' | 'dash' | 'letter-gap' | 'word-gap';
  progress: number;         // 0..1
  totalMs: number;
  tag: string;              // playback source, so UIs only react to their own signal
}

interface TimelineItem {
  start: number;
  end: number;
  wordIdx: number;
  letterIdx: number;
  symbolIdx: number;
  kind: TickState['kind'];
}

type Listener = (t: TickState | null) => void;

/**
 * Zero-lag morse audio engine.
 * - Tones scheduled on WebAudio's hardware clock (sample-accurate, no setTimeout drift)
 * - Lookahead chunk scheduler keeps memory flat even for very long messages
 * - Visual ticks broadcast via rAF, only when the active timeline item changes
 */
export class MorseEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private live = new Set<OscillatorNode>();
  private raf = 0;
  private schedTimer: number | undefined;
  private items: TimelineItem[] = [];
  private t0 = 0;
  private total = 0;
  private cursor = -1;
  private schedIdx = 0;
  private freq = 620;
  private tag = '';
  playing = false;

  private listeners = new Set<Listener>();
  addListener(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(t: TickState | null) {
    this.listeners.forEach(fn => fn(t));
  }

  play(words: MorseWords, unitMs = 62, freq = 620, tag = ''): boolean {
    if (!words.length) return false;
    if (typeof AudioContext === 'undefined') return false;
    this.stop(true);
    this.freq = freq;
    this.tag = tag;
    const unit = unitMs / 1000;

    // ---- build timeline ------------------------------------------------ //
    const items: TimelineItem[] = [];
    let t = 0;
    words.forEach((word, wi) => {
      word.forEach((unit_, li) => {
        const syms = unit_.morse.split('');
        syms.forEach((s, si) => {
          const dur = (s === '.' ? 1 : 3) * unit;
          items.push({ start: t, end: t + dur, wordIdx: wi, letterIdx: li, symbolIdx: si, kind: s === '.' ? 'dot' : 'dash' });
          t += dur + unit; // intra-letter gap
        });
        t -= unit; // last intra gap not needed
        if (li < word.length - 1) {
          items.push({ start: t, end: t + 3 * unit, wordIdx: wi, letterIdx: li, symbolIdx: -1, kind: 'letter-gap' });
          t += 3 * unit;
        }
      });
      if (wi < words.length - 1) {
        items.push({ start: t, end: t + 7 * unit, wordIdx: wi, letterIdx: -1, symbolIdx: -1, kind: 'word-gap' });
        t += 7 * unit;
      }
    });
    this.items = items;
    this.total = t;

    // ---- audio graph --------------------------------------------------- //
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return false;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    this.master = master;
    this.t0 = ctx.currentTime + 0.08;

    this.schedIdx = 0;
    this.scheduleAhead();
    this.schedTimer = window.setInterval(() => this.scheduleAhead(), 400);

    this.playing = true;
    this.cursor = -1;
    const tick = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime - this.t0;
      if (now >= this.total) {
        this.stop(true);
        return;
      }
      let idx = this.cursor;
      while (idx + 1 < this.items.length && this.items[idx + 1].start <= now) idx++;
      if (idx !== this.cursor && idx >= 0) {
        this.cursor = idx;
        const it = this.items[idx];
        this.emit({
          wordIdx: it.wordIdx,
          letterIdx: it.letterIdx,
          symbolIdx: it.symbolIdx,
          kind: it.kind,
          progress: Math.min(1, now / this.total),
          totalMs: this.total * 1000,
          tag: this.tag,
        });
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return true;
  }

  /** keep at most ~2s of oscillators in flight regardless of message length */
  private scheduleAhead() {
    if (!this.ctx || !this.master) return;
    const horizon = this.ctx.currentTime - this.t0 + 2.5;
    while (this.schedIdx < this.items.length && this.items[this.schedIdx].start < horizon) {
      const it = this.items[this.schedIdx++];
      if (it.kind !== 'dot' && it.kind !== 'dash') continue;
      const s = this.t0 + it.start;
      const e = this.t0 + it.end;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = this.freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(1, s + 0.004);
      g.gain.setValueAtTime(1, Math.max(s + 0.004, e - 0.008));
      g.gain.linearRampToValueAtTime(0.0001, e);
      osc.connect(g);
      g.connect(this.master);
      osc.start(s);
      osc.stop(e + 0.02);
      this.live.add(osc);
      osc.onended = () => this.live.delete(osc);
    }
    if (this.schedIdx >= this.items.length && this.schedTimer !== undefined) {
      window.clearInterval(this.schedTimer);
      this.schedTimer = undefined;
    }
  }

  stop(notify = true) {
    if (this.schedTimer !== undefined) {
      window.clearInterval(this.schedTimer);
      this.schedTimer = undefined;
    }
    cancelAnimationFrame(this.raf);
    this.live.forEach(o => {
      try { o.stop(); } catch { /* already stopped */ }
    });
    this.live.clear();
    if (this.ctx) {
      this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.master = null;
    }
    this.playing = false;
    this.cursor = -1;
    if (notify) this.emit(null);
  }
}
