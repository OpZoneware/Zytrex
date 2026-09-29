'use client';

// The command bar — the hero of the product. Docked at the bottom of every
// screen, Spotlight-style. Focus it, type (or speak) what you want, and the
// product reacts: navigation, generated result surfaces, or a payment flow.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Mic, Square, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCommand } from './CommandContext';

interface Suggestion {
  label: string;
  run: () => void;
}

interface SpeechLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechLike;
function getSpeechCtor(): SpeechCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function CommandBar() {
  const router = useRouter();
  const { barOpen, openBar, closeBar, working, runCommand, recent, prefill, clearPrefill } = useCommand();
  const [value, setValue] = useState('');
  const [listening, setListening] = useState(false);
  const [micHint, setMicHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechLike | null>(null);
  const [voiceOk, setVoiceOk] = useState(false);

  useEffect(() => {
    setVoiceOk(Boolean(typeof window !== 'undefined' && getSpeechCtor()));
  }, []);

  useEffect(() => {
    if (barOpen) inputRef.current?.focus();
  }, [barOpen]);

  // refocus after suggestion clicks change the value
  useEffect(() => {
    if (barOpen && value && document.activeElement !== inputRef.current) {
      inputRef.current?.focus();
    }
  }, [barOpen, value]);

  useEffect(() => {
    if (prefill != null) {
      setValue(prefill);
      clearPrefill();
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(prefill.length, prefill.length);
    }
  }, [prefill, clearPrefill]);

  useEffect(() => () => { try { recRef.current?.stop(); } catch {} }, []);

  function submit(text?: string) {
    const t = (text ?? value).trim();
    if (!t) return;
    setValue('');
    closeBar();
    void runCommand(t);
  }

  function startVoice() {
    const SR = typeof window !== 'undefined' ? getSpeechCtor() : undefined;
    if (!SR) {
      setMicHint(true);
      openBar();
      return;
    }
    try {
      const rec = new SR();
      rec.lang = 'en-NG';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        const text = e.results?.[0]?.[0]?.transcript ?? '';
        stopVoice();
        if (text) { setValue(text); openBar(); }
      };
      rec.onerror = () => { stopVoice(); setMicHint(true); };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
      setMicHint(false);
      openBar();
    } catch {
      setMicHint(true);
    }
  }

  function stopVoice() {
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recRef.current = null;
    setListening(false);
  }

  const suggestions: Suggestion[] = [
    { label: 'Pay someone', run: () => setValue('Pay ') },
    { label: 'Find a transaction', run: () => { closeBar(); router.push('/transactions'); } },
    { label: 'Check pending approvals', run: () => { closeBar(); router.push('/approvals'); } },
    { label: "Analyse this month's spending", run: () => submit("Analyse this month's spending") },
  ];

  const showPanel = barOpen && !working && !listening;

  return (
    <div
      className="fixed z-40 -translate-x-1/2 command-position"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {showPanel && (
        <div className="absolute bottom-full mb-2 w-full card anim-fade-up overflow-hidden p-1.5">
          <div className="px-3 pt-2 pb-1.5 flex items-center justify-between">
            <span className="kicker">{value ? 'Run command' : 'Suggestions'}</span>
            <span className="text-[10.5px] text-ink3 mono">CTRL K</span>
          </div>

          {value ? (
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-panel2 transition text-left"
              onClick={(e) => { e.preventDefault(); submit(); }}>
              <Search size={15} className="text-accent shrink-0" />
              <span className="text-[13.5px] font-medium text-ink truncate">{value}</span>
              <ArrowRight size={14} className="text-ink3 ml-auto shrink-0" />
            </button>
          ) : (
            <>
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-panel2 transition text-left group"
                  onClick={(e) => { e.preventDefault(); s.run(); }}
                >
                  <span className="w-6 h-6 rounded-md bg-accent/10 text-accent grid place-items-center shrink-0">
                    <Search size={12} />
                  </span>
                  <span className="text-[13.5px] font-medium text-ink">{s.label}</span>
                  <ArrowRight size={14} className="text-ink3 ml-auto opacity-0 group-hover:opacity-100 transition" />
                </button>
              ))}
              {recent.length > 0 && (
                <>
                  <div className="hairline mx-2 my-1.5" />
                  <div className="px-3 pb-1"><span className="kicker">Recent</span></div>
                  {recent.slice(0, 3).map((r) => (
                    <button
                      key={r}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-panel2 transition text-left"
                      onClick={(e) => { e.preventDefault(); submit(r); }}
                    >
                      <span className="text-[13px] text-ink2 truncate">{r}</span>
                    </button>
                  ))}
                </>
              )}
              {micHint && (
                <div className="mx-2 my-1.5 rounded-lg bg-warn/10 border border-warn/30 px-3 py-2 text-[12px] text-warn">
                  Voice input could not start. Check microphone permission or type instead. Numbers work in words, e.g. “Send five hundred thousand naira…”.
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className={cn('cmdbar flex items-center gap-2 px-3 py-2', barOpen && 'cmdbar-open')}>
        {working ? (
          <div className="flex items-center gap-2.5 w-full px-1.5 py-1">
            <span className="w-6 h-6 rounded-md bg-accent text-white grid place-items-center text-[12px] font-bold anim-z-pulse">Z</span>
            <span className="text-[13.5px] text-ink2">Understanding…</span>
            <span className="flex gap-1 ml-1">
              <i className="dot bg-accent anim-pulse-dot" style={{ animationDelay: '0ms' }} />
              <i className="dot bg-accent anim-pulse-dot" style={{ animationDelay: '200ms' }} />
              <i className="dot bg-accent anim-pulse-dot" style={{ animationDelay: '400ms' }} />
            </span>
          </div>
        ) : listening ? (
          <div className="flex items-center gap-3 w-full px-1.5 py-1">
            <div className="flex items-end gap-[3px] h-6" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="wave-bar" style={{ animationDelay: `${i * 120}ms`, height: 8 }} />
              ))}
            </div>
            <span className="text-[13.5px] text-ink2">Listening…</span>
            <button
              className="ml-auto w-7 h-7 rounded-full bg-danger text-white grid place-items-center"
              onClick={stopVoice}
              aria-label="Stop listening"
            >
              <Square size={11} fill="currentColor" />
            </button>
          </div>
        ) : (
          <>
            <span className="w-6 h-6 rounded-md bg-accent text-white grid place-items-center text-[12px] font-bold shrink-0">Z</span>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent border-0 outline-none text-[14px] text-ink placeholder:text-ink3 px-1 min-w-0"
              aria-label="Finance command"
              placeholder="What would you like to do?"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => openBar()}
              onBlur={(e) => { if (!e.currentTarget.closest(".command-position")?.contains(e.relatedTarget)) closeBar(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') closeBar();
              }}
            />
            <button
              className={cn('w-8 h-8 rounded-lg grid place-items-center transition shrink-0',
                voiceOk ? 'text-ink2 hover:bg-panel2' : 'text-ink3 hover:bg-panel2')}
              onClick={startVoice}
              aria-label="Voice command"
              title="Voice command"
            >
              <Mic size={16} />
            </button>
            <button
              className={cn('w-8 h-8 rounded-lg grid place-items-center transition shrink-0',
                value.trim() ? 'bg-accent text-white hover:bg-brand-ink' : 'text-ink3 bg-panel2')}
              onClick={() => submit()}
              aria-label="Run command"
              disabled={!value.trim()}
            >
              <ArrowRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
