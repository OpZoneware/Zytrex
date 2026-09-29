import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { dashboardStats, changePct } from '@/lib/services/queries';
import { approvalQueue } from '@/lib/services/queries';
import { currentUser } from '@/lib/store';

export const dynamic = 'force-dynamic';

async function handleGET() {
  const user = currentUser();
  const stats = dashboardStats();
  const change = changePct();
  const queue = approvalQueue(user);
  return NextResponse.json({
    ok: true,
    stats,
    change: { this_month: change.thisMonth, last_month: change.lastMonth, pct: change.pct },
    queue_counts: {
      pending: queue.pending.length,
      actionable: queue.pending.filter((p) => p.actionable).length,
      ready_to_authorize: queue.ready_to_authorize.length,
      actionable_auth: queue.ready_to_authorize.filter((p) => p.actionable).length,
    },
    user,
  });
}

export const GET = withSandbox(handleGET);
