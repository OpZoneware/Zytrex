// Formatting helpers — naira amounts, dates, percentages

const nairaFmt = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const nairaFmt0 = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFmt = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

/** ₦520,000.00 — full precision, for receipts */
export function naira(n: number): string {
  return nairaFmt.format(n);
}

/** ₦520,000 — no kobo, for tables and cards */
export function naira0(n: number): string {
  return nairaFmt0.format(n);
}

/** ₦8.7m / ₦742k / ₦45,000 — compact display for stats */
export function compact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}₦${(abs / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}b`;
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    const s = v >= 10 ? v.toFixed(1) : v.toFixed(2);
    return `${sign}₦${s.replace(/\.?0+$/, '')}m`;
  }
  if (abs >= 1_000) {
    const v = abs / 1_000;
    const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
    return `${sign}₦${s.replace(/\.0$/, '')}k`;
  }
  return `${sign}₦${numberFmt.format(abs)}`;
}

export function pct(n: number, digits = 1): string {
  const s = n.toFixed(digits);
  return `${n > 0 ? '+' : ''}${s}%`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)} • ${fmtTime(iso)}`;
}

export function maskAccount(mask: string): string {
  return `••••${mask.slice(-4)}`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDateShort(iso);
}
