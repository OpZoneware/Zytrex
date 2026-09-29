'use client';

// Command orchestration: natural language in → the PRODUCT reacts.
//  • navigational intents  → route with filters applied (data.goto from the API)
//  • payment intents       → the focused PaymentFlow takes over the screen
//  • everything else       → a result surface renders the generated interface
// There is never a chat transcript.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChatCard } from '@/lib/types';
import { CommandBar } from './CommandBar';
import { ResultSurface, type SurfaceData } from './ResultSurface';
import { PaymentFlow, type FlowData } from '@/components/payments/PaymentFlow';

export interface CmdCtx {
  barOpen: boolean;
  openBar: (prefill?: string) => void;
  closeBar: () => void;
  prefill: string | null;
  clearPrefill: () => void;
  working: boolean;
  runCommand: (text: string) => Promise<void>;
  recent: string[];
  surface: SurfaceData | null;
  closeSurface: () => void;
  flow: FlowData | null;
  openFlow: (f: FlowData) => void;
  closeFlow: () => void;
}

const Ctx = createContext<CmdCtx>({
  barOpen: false,
  openBar: () => {},
  closeBar: () => {},
  prefill: null,
  clearPrefill: () => {},
  working: false,
  runCommand: async () => {},
  recent: [],
  surface: null,
  closeSurface: () => {},
  flow: null,
  openFlow: () => {},
  closeFlow: () => {},
});

export function useCommand() {
  return useContext(Ctx);
}

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [barOpen, setBarOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [surface, setSurface] = useState<SurfaceData | null>(null);
  const [flow, setFlow] = useState<FlowData | null>(null);
  const [prefill, setPrefill] = useState<string | null>(null);
  const flowRef = useRef<FlowData | null>(null);
  useEffect(() => {
    flowRef.current = flow;
  }, [flow]);

  const openBar = useCallback((text?: string) => {
    setPrefill(text ?? null);
    setBarOpen(true);
  }, []);
  const closeBar = useCallback(() => setBarOpen(false), []);
  const clearPrefill = useCallback(() => setPrefill(null), []);
  const closeSurface = useCallback(() => setSurface(null), []);
  const closeFlow = useCallback(() => setFlow(null), []);
  const openFlow = useCallback((f: FlowData) => {
    setSurface(null);
    setFlow(f);
  }, []);

  const runCommand = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || working) return;
      setRecent((r) => [q, ...r.filter((x) => x !== q)].slice(0, 5));
      setWorking(true);
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'message', text: q }),
        });
        const data = await res.json().catch(() => null);
        if (!data?.ok || !data.message) {
          setBarOpen(false);
          setSurface({ text: data?.error ?? 'Something went wrong running that command.', cards: [] });
          return;
        }
        const msg = data.message as { text: string; cards?: ChatCard[]; tool_calls?: { name: string; ms?: number; summary?: string }[] };

        // 1. Payment preparation takes over the interface.
        const preview = msg.cards?.find((c) => c.kind === 'transfer_preview');
        if (preview && preview.kind === 'transfer_preview') {
          setBarOpen(false);
          setFlow({ preview, initial: 'preview' });
          return;
        }

        // 2. Navigational commands move the product — no answer needed.
        if (typeof data.goto === 'string' && data.goto) {
          setBarOpen(false);
          setSurface(null);
          router.push(data.goto);
          return;
        }

        // 3. Otherwise: generate the interface for it.
        const call = msg.tool_calls?.[0];
        setBarOpen(false);
        setSurface({
          text: msg.text ?? '',
          cards: msg.cards ?? [],
          tool: call ? { name: call.name, ms: call.ms, summary: call.summary } : undefined,
        });
      } catch {
        setBarOpen(false);
        setSurface({ text: 'Could not reach the sandbox. Try again.', cards: [] });
      } finally {
        setWorking(false);
      }
    },
    [router, working]
  );

  // Ctrl/Cmd+K opens the command bar from anywhere in the product.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBarOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        if (flowRef.current) return; // The focused dialog owns Escape while payments are in flight.
        setSurface((s) => (s ? null : s));
        setBarOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo<CmdCtx>(
    () => ({ barOpen, openBar, closeBar, prefill, clearPrefill, working, runCommand, recent, surface, closeSurface, flow, openFlow, closeFlow }),
    [barOpen, openBar, closeBar, prefill, clearPrefill, working, runCommand, recent, surface, closeSurface, flow, openFlow, closeFlow]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <CommandBar />
      {surface && <ResultSurface data={surface} onClose={closeSurface} />}
      {flow && <PaymentFlow data={flow} onClose={closeFlow} />}
    </Ctx.Provider>
  );
}
