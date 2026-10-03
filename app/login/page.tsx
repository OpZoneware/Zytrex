'use client';

// Login — extremely minimal, per the product direction:
// ZYTREX · Finance, at your command. · SANDBOX DEMO

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ShieldCheck } from 'lucide-react';

const USERS = [
  { id: 'usr_daniel', name: 'Daniel', title: 'CEO', color: '#17665f' },
  { id: 'usr_amara', name: 'Amara', title: 'Finance', color: '#6e8bff' },
  { id: 'usr_ngozi', name: 'Ngozi', title: 'Director', color: '#c084fc' },
  { id: 'usr_tunde', name: 'Tunde', title: 'Ops', color: '#f2a93b' },
  { id: 'usr_chidi', name: 'Chidi', title: 'Auditor', color: '#94a3b8' },
];

export default function LoginPage() {
  const router = useRouter();
  const [selected, setSelected] = useState('usr_daniel');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(false);

  async function enter(id?: string) {
    const userId = id ?? selected;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!response.ok) throw new Error('Could not open sandbox');
      router.push('/dashboard');
    } catch {
      setLoading(false);
      setError('Unable to open the sandbox. Please try again.');
    }
  }

  return (
    <div className="min-h-screen bg-app flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden">
      {/* quiet brand wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(700px 340px at 50% -8%, rgba(23,102,95,0.08), transparent 70%), radial-gradient(500px 260px at 85% 110%, rgba(23,102,95,0.04), transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-[440px] anim-fade-up">
        <div className="text-center">
          <div
            className="mx-auto w-12 h-12 rounded-2xl grid place-items-center text-white text-xl font-bold shadow-lift"
            style={{ background: 'linear-gradient(135deg, #17665f 0%, #203f4d 100%)' }}
          >
            Z
          </div>
          <h1 className="mt-5 text-[34px] font-extrabold tracking-[0.2em] text-ink">ZYTREX</h1>
          <p className="mt-2 text-[16px] font-medium text-ink2">Finance, at your command.</p>
          <p className="mt-3 text-[13.5px] text-ink3 leading-relaxed max-w-[340px] mx-auto">
            Manage payments, approvals and financial operations using natural language.
          </p>
        </div>

        <div className="card mt-8 p-5">
          {error && <p role="alert" className="text-danger text-sm mb-3">{error}</p>}
          {!picked ? (
            <>
              <button
                className="btn btn-primary btn-lg w-full"
                onClick={() => setPicked(true)}
                disabled={loading}
              >
                Enter Zytrex AI Finance <ArrowRight size={16} />
              </button>
              <div className="text-center text-[11.5px] text-ink3 mt-3 flex items-center justify-center gap-1.5">
                <ShieldCheck size={13} /> Sandbox · demo PIN 123456 · no real money
              </div>
            </>
          ) : (
            <>
              <div className="kicker text-center mb-3">Enter as</div>
              <div className="grid grid-cols-5 gap-2">
                {USERS.map((u) => (
                  <button
                    key={u.id}
                    className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border transition ${
                      selected === u.id
                        ? 'border-accent bg-accent/10 shadow-soft'
                        : 'border-line hover:border-line2'
                    }`}
                    onClick={() => setSelected(u.id)}
                  >
                    <span
                      className="w-9 h-9 rounded-full grid place-items-center text-white text-[13px] font-bold"
                      style={{ background: u.color }}
                    >
                      {u.name[0]}
                    </span>
                    <span className="text-[11.5px] font-semibold text-ink">{u.name}</span>
                    <span className="text-[9.5px] text-ink3 uppercase tracking-wide">{u.title}</span>
                  </button>
                ))}
              </div>
              <button className="btn btn-primary btn-lg w-full mt-4" onClick={() => enter()} disabled={loading}>
                {loading ? 'Entering…' : <>Continue <ArrowRight size={16} /></>}
              </button>
              <button className="btn btn-ghost w-full mt-1" onClick={() => setPicked(false)} disabled={loading}>
                Back
              </button>
            </>
          )}
        </div>

        <div className="mt-6 text-center text-[10.5px] text-ink3 tracking-[0.18em] uppercase">Sandbox demo</div>
      </div>
    </div>
  );
}
