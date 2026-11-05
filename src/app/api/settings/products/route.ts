import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/user';
import { hasPermissionForEntity } from '@/lib/permissions';
import { auditRequestContext, createAuditLog } from '@/lib/audit-log';

// Product create, edit and delete go through maker-checker
// (/api/settings/pending-changes → /api/approvals). The only direct write left
// here is the Settings page's Active/Disabled switch, which by design takes
// effect immediately (see SAFE_LOAN_PRODUCT_FIELDS in lib/loan-product-changes).
// POST and DELETE used to create and delete products directly for any signed-in
// user; nothing called them, so they are gone (Next.js answers 405).

const statusSchema = z.object({
    id: z.string().min(1),
    status: z.enum(['Active', 'Disabled']),
}).strict();

export async function PUT(req: NextRequest) {
    const user = await getUserFromSession();
    if (!user?.id) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermissionForEntity(user, 'LoanProduct', 'update')) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    let body: z.infer<typeof statusSchema>;
    try {
        body = statusSchema.parse(await req.json());
    } catch {
        return NextResponse.json(
            { error: 'Only the product status (Active or Disabled) can be changed here. Other edits need approval.' },
            { status: 400 },
        );
    }

    const product = await prisma.loanProduct.findUnique({
        where: { id: body.id },
        select: { id: true, name: true, status: true, providerId: true },
    });
    // Staff tied to a provider may only switch that provider's products.
    if (!product || (user.loanProviderId && product.providerId !== user.loanProviderId)) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    if (product.status === body.status) {
        return NextResponse.json(product);
    }

    const updated = await prisma.loanProduct.update({
        where: { id: product.id },
        data: { status: body.status },
        select: { id: true, name: true, status: true, providerId: true },
    });

    await createAuditLog({
        actorId: user.id,
        action: 'PRODUCT_STATUS_UPDATED',
        entity: 'LoanProduct',
        entityId: product.id,
        details: { productName: product.name, before: { status: product.status }, after: { status: updated.status } },
        ...auditRequestContext(req),
    });

    return NextResponse.json(updated);
}
