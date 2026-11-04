import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/user';
import { hasPermission } from '@/lib/permissions';

/**
 * GET /api/settings/statement-parameters
 *
 * The approved statement parameters, plus change requests still awaiting approval. Creating,
 * changing and removing go through /api/settings/pending-changes (entityType "StatementParameter").
 */
export async function GET() {
  const user = await getUserFromSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!hasPermission(user, 'scoring-engine', 'read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [parameters, pendingChanges] = await Promise.all([
    prisma.statementParameter.findMany({ orderBy: { name: 'asc' } }),
    prisma.pendingChange.findMany({
      where: { entityType: 'StatementParameter', status: 'PENDING' },
      select: { id: true, entityId: true, changeType: true, payload: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const pending = pendingChanges.map((c) => {
    let proposed: any = null;
    try {
      const parsed = JSON.parse(c.payload);
      proposed = parsed.created ?? parsed.updated ?? parsed.original ?? null;
    } catch {
      // keep null
    }
    return { id: c.id, entityId: c.entityId, changeType: c.changeType, createdAt: c.createdAt, proposed };
  });

  return NextResponse.json({ parameters, pending });
}
