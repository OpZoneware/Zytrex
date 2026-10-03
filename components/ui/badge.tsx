import { cn } from '@/lib/utils';

export function Badge({
  children,
  tone = 'slate',
  className,
  dot,
}: {
  children: React.ReactNode;
  tone?: 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'slate' | 'accent';
  className?: string;
  dot?: boolean;
}) {
  const tones: Record<string, string> = {
    green: 'text-success border-success/40 bg-success/10',
    accent: 'text-accent border-accent/40 bg-accent/10',
    amber: 'text-warn border-warn/40 bg-warn/10',
    red: 'text-danger border-danger/40 bg-danger/10',
    blue: 'text-info border-info/40 bg-info/10',
    violet: 'text-violet border-violet/40 bg-violet/10',
    slate: 'text-ink2 border-line2 bg-panel2',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-[3px] text-[11px] font-semibold tracking-wide uppercase whitespace-nowrap',
        tones[tone],
        className
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current anim-pulse-dot" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'slate'; label: string }> = {
    DRAFT: { tone: 'slate', label: 'Scheduled' },
    AWAITING_APPROVAL: { tone: 'amber', label: 'Awaiting approval' },
    APPROVED: { tone: 'blue', label: 'Approved' },
    AWAITING_AUTHORIZATION: { tone: 'violet', label: 'Awaiting authorization' },
    AUTHORIZED: { tone: 'blue', label: 'Authorized' },
    PROCESSING: { tone: 'blue', label: 'Processing' },
    SUCCESSFUL: { tone: 'green', label: 'Successful' },
    FAILED: { tone: 'red', label: 'Failed' },
    DECLINED: { tone: 'red', label: 'Declined' },
    CANCELLED: { tone: 'slate', label: 'Cancelled' },
    REVERSED: { tone: 'amber', label: 'Reversed' },
    EXPIRED: { tone: 'slate', label: 'Expired' },
    VERIFIED: { tone: 'green', label: 'Verified' },
    UNVERIFIED: { tone: 'amber', label: 'Unverified' },
    PENDING: { tone: 'amber', label: 'Pending' },
    PROCESSING_TXN: { tone: 'blue', label: 'Processing' },
    SUCCESS: { tone: 'green', label: 'Successful' },
  };
  const v = map[status] ?? { tone: 'slate' as const, label: status.replace(/_/g, ' ') };
  return (
    <Badge tone={v.tone} dot={status === 'PROCESSING' || status === 'AWAITING_APPROVAL'}>
      {v.label}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  const tone = risk === 'CRITICAL' || risk === 'HIGH' ? 'red' : risk === 'MEDIUM' ? 'amber' : 'green';
  return <Badge tone={tone}>{risk} RISK</Badge>;
}
