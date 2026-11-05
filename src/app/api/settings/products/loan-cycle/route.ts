import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/user';
import { hasPermissionForEntity } from '@/lib/permissions';
import { auditRequestContext, createAuditLog, sanitizeForAudit } from '@/lib/audit-log';

const parseJson = (value: string | null | undefined) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return value ?? null;
  }
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 });

  const config = await prisma.loanCycleConfig.findUnique({ where: { productId } });
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  const user = await getUserFromSession();
  if (!user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const body = await req.json();
    const { productId, metric, enabled, cycleRanges, grades } = body;

    if (!productId || !metric) return NextResponse.json({ error: 'productId and metric are required' }, { status: 400 });

    // Basic shape validation
    if (cycleRanges && !Array.isArray(cycleRanges)) return NextResponse.json({ error: 'cycleRanges must be an array' }, { status: 400 });
    if (grades && !Array.isArray(grades)) return NextResponse.json({ error: 'grades must be an array' }, { status: 400 });

    // If both provided, ensure grade percentage arrays align with cycleRanges length
    if (cycleRanges && grades) {
      const expectedLen = cycleRanges.length;
      for (const g of grades) {
        if (!Array.isArray(g.percentages) || g.percentages.length !== expectedLen) {
          return NextResponse.json({ error: 'Each grade must have a percentages array matching the length of cycleRanges' }, { status: 400 });
        }
      }
    }

    // if exists update else create
    const existing = await prisma.loanCycleConfig.findUnique({ where: { productId } });
    // Same rule the Loan Cycle tab uses: update an existing config, create a new one.
    if (!hasPermissionForEntity(user, 'LoanCycleConfig', existing ? 'update' : 'create')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    let result;
    if (existing) {
      result = await prisma.loanCycleConfig.update({ where: { id: existing.id }, data: { metric, enabled: enabled ?? true, cycleRanges: cycleRanges ? JSON.stringify(cycleRanges) : undefined, grades: grades ? JSON.stringify(grades) : undefined } });
    } else {
      result = await prisma.loanCycleConfig.create({ data: { productId, metric, enabled: enabled ?? true, cycleRanges: cycleRanges ? JSON.stringify(cycleRanges) : JSON.stringify([]), grades: grades ? JSON.stringify(grades) : JSON.stringify([]) } });
    }

    const snapshot = (c: typeof result | null) =>
      c ? { metric: c.metric, enabled: c.enabled, cycleRanges: parseJson(c.cycleRanges), grades: parseJson(c.grades) } : null;
    await createAuditLog({
      actorId: user.id,
      action: existing ? 'LOAN_CYCLE_CONFIG_UPDATED' : 'LOAN_CYCLE_CONFIG_CREATED',
      entity: 'LoanProduct',
      entityId: productId,
      details: sanitizeForAudit({ loanCycleConfigId: result.id, before: snapshot(existing), after: snapshot(result) }),
      ...auditRequestContext(req),
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error updating loan cycle config', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
