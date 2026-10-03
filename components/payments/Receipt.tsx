'use client';

// Payment receipt — used by the authorize modal and the payment detail page.

import { CheckCircle2, Download, Share2 } from 'lucide-react';
import { fmtDateTime, naira } from '@/lib/format';

export interface ReceiptData {
  ref: string;
  amount: number;
  beneficiary_name: string;
  bank_name: string;
  account_mask: string;
  purpose: string;
  provider_reference?: string;
  initiated_by: string;
  authorized_by: string;
  completed_at: string;
}

export function receiptText(r: ReceiptData): string {
  return [
    'ZYTREX AI FINANCE — SANDBOX RECEIPT',
    '===================================',
    '',
    'PAYMENT SUCCESSFUL',
    naira(r.amount),
    r.beneficiary_name,
    `${r.bank_name} ••••${r.account_mask}`,
    '',
    `Purpose:        ${r.purpose}`,
    `Reference:      ${r.ref}`,
    `Gateway ref:    ${r.provider_reference ?? '—'}`,
    `Processed via:  Zytrex Payments (Sandbox)`,
    `Initiated by:   ${r.initiated_by}`,
    `Authorized by:  ${r.authorized_by}`,
    `${fmtDateTime(r.completed_at)}`,
    '',
    'SANDBOX TRANSACTION — no real money moved.',
    'Zytrex AI Finance — Talk to your money.',
  ].join('\n');
}

export function Receipt({
  data,
  onDownload,
  onShare,
}: {
  data: ReceiptData;
  onDownload?: () => void;
  onShare?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel2 overflow-hidden">
      <div className="px-5 pt-6 pb-5 text-center relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(300px 110px at 50% 0%, rgba(4,120,87,.13), transparent 70%)' }}
        />
        <div className="relative">
          <div className="mx-auto w-14 h-14 rounded-full bg-success/10 border border-success/40 grid place-items-center mb-3 anim-fade-up">
            <CheckCircle2 size={30} className="text-success" />
          </div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-success uppercase">Payment successful</div>
          <div className="text-[36px] font-bold mono tracking-tight mt-2">{naira(data.amount)}</div>
          <div className="text-[15px] font-semibold mt-2">{data.beneficiary_name}</div>
          <div className="text-[13px] text-ink3 mt-0.5">
            {data.bank_name} ••••{data.account_mask}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-line space-y-2.5">
        <Row label="Purpose" value={data.purpose} />
        <Row label="Reference" value={data.ref} mono />
        {data.provider_reference && <Row label="Gateway ref" value={data.provider_reference} mono />}
        <Row label="Processed via" value="Zytrex Payments · Sandbox" />
        <Row label="Initiated by" value={data.initiated_by} />
        <Row label="Authorized by" value={data.authorized_by} />
        <Row label="Date" value={fmtDateTime(data.completed_at)} />
      </div>

      <div className="px-5 py-4 border-t border-line flex flex-wrap gap-2">
        <button className="btn btn-secondary btn-sm flex-1" onClick={onDownload}>
          <Download size={14} /> Download receipt
        </button>
        <button
          className="btn btn-ghost btn-sm flex-1"
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: `Receipt ${data.ref}`, text: receiptText(data) }).catch(() => {});
            } else {
              onShare?.();
            }
          }}
        >
          <Share2 size={14} /> Share
        </button>
      </div>
      <div className="px-5 pb-4 text-center text-[10.5px] text-ink3 tracking-wide">
        SANDBOX TRANSACTION — no real money moved.
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-[13px]">
      <span className="text-ink3 shrink-0">{label}</span>
      <span className={`text-ink text-right ${mono ? 'mono' : ''} truncate`}>{value}</span>
    </div>
  );
}
