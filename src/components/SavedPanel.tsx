import { memo, useState } from 'react';
import { ArrowUpToLine, Copy, Trash2, BookmarkX, ArrowDown } from 'lucide-react';
import type { Mode, SaveEntry } from '../App';
import { timeAgo } from '../lib/utils';
import { cn } from '../utils/cn';

interface Props {
  saves: Record<Mode, SaveEntry[]>;
  onLoad: (mode: Mode, entry: SaveEntry) => void;
  onCopy: (text: string) => void;
  onDelete: (mode: Mode, id: string) => void;
  onClearList: (mode: Mode) => void;
}

const TAB_LABEL: Record<Mode, string> = {
  m2t: 'Morse → Text',
  t2m: 'Text → Morse',
};

function SavedPanel({ saves, onLoad, onCopy, onDelete, onClearList }: Props) {
  const [tab, setTab] = useState<Mode>('m2t');
  const list = saves[tab];

  return (
    <section className="panel fade-up p-4 sm:p-5" style={{ animationDelay: '80ms' }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
          Saved translations
        </h2>
        {list.length > 0 && (
          <button
            type="button"
            onClick={() => onClearList(tab)}
            className="mono flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--err)]"
          >
            <BookmarkX size={13} />
            Clear list
          </button>
        )}
      </div>

      <div className="seg mb-4">
        {(['m2t', 't2m'] as Mode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setTab(m)}
            className={cn(tab === m && 'active')}
          >
            {TAB_LABEL[m]}
            <span className="mono rounded-full border border-current/30 px-1.5 text-[9.5px] leading-4 opacity-70">
              {saves[m].length}
            </span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--line)] py-10 text-center">
          <ArrowUpToLine size={18} className="text-[var(--muted)]" />
          <p className="mono text-[11px] text-[var(--muted)]">
            Nothing saved here yet.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {list.map(e => (
            <li
              key={e.id}
              className="group rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-2)] p-3 transition-colors hover:border-[var(--accent)]/40"
            >
              <div className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => onLoad(tab, e)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  aria-label="Load into translator"
                >
                  <p className={cn('clamp-2 text-[12.5px] leading-relaxed text-[var(--ink-2)]', tab === 'm2t' ? 'mono' : 'font-medium')}>
                    {e.input}
                  </p>
                  <ArrowDown size={11} className="my-1 text-[var(--accent)]" />
                  <p className={cn('clamp-2 text-[12.5px] leading-relaxed text-[var(--ink)]', tab === 't2m' ? 'mono tracking-[0.08em]' : 'font-semibold')}>
                    {e.output}
                  </p>
                </button>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 border-t border-[var(--line-2)] pt-2">
                <span className="mono text-[10px] text-[var(--muted)]">{timeAgo(e.ts)}</span>
                <span className="flex-1" />
                <button type="button" className="icon-btn h-7 w-7 !border-transparent" onClick={() => onLoad(tab, e)} aria-label="Load">
                  <ArrowUpToLine size={12.5} />
                </button>
                <button type="button" className="icon-btn h-7 w-7 !border-transparent" onClick={() => onCopy(e.output)} aria-label="Copy output">
                  <Copy size={12.5} />
                </button>
                <button type="button" className="icon-btn danger h-7 w-7 !border-transparent" onClick={() => onDelete(tab, e.id)} aria-label="Delete">
                  <Trash2 size={12.5} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default memo(SavedPanel);
