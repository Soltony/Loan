
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getUserFromSession } from '@/lib/user';
import ExcelJS from 'exceljs';
import { hasPermissionForEntity } from '@/lib/require-permission';
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit-log';
import { isSafeOnlyProductUpdate } from '@/lib/loan-product-changes';
import { checkStatementParameterChange } from '@/lib/statement-parameters';
import { ONE_PENDING_CHANGE_PER_ENTITY } from '@/lib/settings-pending';

export async function GET(req: NextRequest) {
  const user = await getUserFromSession();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const canReadApprovals = !!user.permissions?.['approvals']?.read || !!user.permissions?.['approvals']?.update || user.role === 'Super Admin' || user.role === 'Auditor';
  if (!canReadApprovals) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const change = await prisma.pendingChange.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!change) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(change);
  } catch (error) {
    console.error('Failed to fetch pending change:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const changeSchema = z.object({
  entityType: z.string(),
  entityId: z.string().optional(),
  changeType: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  payload: z.string(), // JSON string
});

// sanitize payload before storing - remove large fileContent fields for product/provider changes
function removeFileContent(obj: any) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeFileContent);

  const out: any = {};
  for (const k of Object.keys(obj)) {
    if (k === 'fileContent') {
      // drop raw file content
      continue;
    }
    const v = obj[k];
    if (typeof v === 'object' && v !== null) {
      // For nested objects, recurse
      out[k] = removeFileContent(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function sanitizePendingChangePayload(entityType: string, payloadStr: string) {
  try {
    const parsed = JSON.parse(payloadStr);
    // Traverse created/updated/original and remove any fileContent fields (and sensitive fields)
    ['created', 'updated', 'original'].forEach((p) => {
      if (parsed[p]) {
        if (entityType === 'EligibilityList' || entityType === 'DataProvisioningUpload') {
          // For file uploads keep fileContent but strip sensitive fields like passwords
          parsed[p] = removeSensitiveFields(parsed[p]);
        } else {
          parsed[p] = removeFileContent(parsed[p]);
          // Also remove any sensitive auth fields like passwords
          parsed[p] = removeSensitiveFields(parsed[p]);
        }
      }
    });

    // As a final precaution, run a global sensitive field removal on the root
    const sanitized = removeSensitiveFields(parsed);
    return JSON.stringify(sanitized);
  } catch (e) {
    // If parsing fails, just return original payload
    return payloadStr;
  }
}

// Remove known sensitive fields (password hashes etc.) from payloads
function removeSensitiveFields(obj: any) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeSensitiveFields);

  const out: any = {};
  for (const k of Object.keys(obj)) {
    if (k === 'password' || k.toLowerCase().includes('password') || k === 'passwordHash' || k === 'hashedPassword' || k === 'pass') {
      // drop sensitive auth fields
      continue;
    }
    const v = obj[k];
    if (typeof v === 'object' && v !== null) {
      out[k] = removeSensitiveFields(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Returned when a provider-owned item's provider can't be found (unknown id,
// missing providerId in the payload, or a provider-linked user creating a
// provider); provider-linked staff are refused in that case.
const PROVIDER_UNRESOLVED = Symbol('provider-unresolved');

// Which provider a change touches. null = a bank-wide item (tax, statement
// parameters, reversals, payments…) that provider scoping doesn't apply to.
async function resolveOwningProviderId(
  entityType: string,
  entityId: string | undefined,
  changeType: string,
  payload: any,
): Promise<string | null | typeof PROVIDER_UNRESOLVED> {
  const productProvider = async (id: unknown) => {
    if (!id) return PROVIDER_UNRESOLVED;
    const row = await prisma.loanProduct.findUnique({ where: { id: String(id) }, select: { providerId: true } });
    return row?.providerId ?? PROVIDER_UNRESOLVED;
  };
  const configProvider = async (id: unknown) => {
    if (!id) return PROVIDER_UNRESOLVED;
    const row = await prisma.dataProvisioningConfig.findUnique({ where: { id: String(id) }, select: { providerId: true } });
    return row?.providerId ?? PROVIDER_UNRESOLVED;
  };
  const given = (id: unknown) => (id ? String(id) : PROVIDER_UNRESOLVED);

  switch (entityType) {
    case 'LoanProvider':
      return changeType === 'CREATE' ? PROVIDER_UNRESOLVED : given(entityId);
    case 'LoanProduct':
      return changeType === 'CREATE' ? given(payload?.created?.providerId) : productProvider(entityId);
    case 'EligibilityList':
    case 'LoanCycleConfig':
      return productProvider(entityId ?? payload?.created?.productId);
    case 'TermsAndConditions':
      // Approval publishes the new version for the payload's provider.
      return given(payload?.updated?.providerId);
    case 'ScoringRules':
      return given(entityId); // entityId is the provider id
    case 'DataProvisioningConfig':
      return changeType === 'CREATE' ? given(payload?.created?.providerId) : configProvider(entityId);
    case 'DataProvisioningUpload':
      return configProvider(payload?.created?.configId ?? entityId);
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { entityType, entityId, changeType, payload } = changeSchema.parse(body);

      // Enforce RBAC: ensure the requesting user has permission to request this change
      const user = await getUserFromSession();
      if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }

      const actionMap: Record<string, 'create' | 'update' | 'delete'> = {
        CREATE: 'create',
        UPDATE: 'update',
        DELETE: 'delete',
      };

      const requiredAction = actionMap[changeType];
      if (!requiredAction) {
        return NextResponse.json({ error: 'Invalid change type' }, { status: 400 });
      }

      const allowed = hasPermissionForEntity(user, entityType, requiredAction);
      if (!allowed) {
        return NextResponse.json({ error: 'Not authorized to perform this action' }, { status: 403 });
      }

    const parsedPayload = (() => {
      try {
        return JSON.parse(payload);
      } catch {
        return null;
      }
    })();

    // Staff tied to a provider may only request changes to that provider's
    // items. Bank-level staff (no provider link) are not limited.
    if (user.loanProviderId) {
      const owner = await resolveOwningProviderId(entityType, entityId, changeType, parsedPayload);
      if (owner === PROVIDER_UNRESOLVED || (owner !== null && owner !== user.loanProviderId)) {
        return NextResponse.json({ error: 'You can only change items that belong to your provider.' }, { status: 403 });
      }
    }

    // One open request per Settings item. Two pending edits of the same product
    // are each built from the same "original", so approving one silently undoes
    // or mixes with the other.
    if (entityId && ONE_PENDING_CHANGE_PER_ENTITY.has(entityType)) {
      const open = await prisma.pendingChange.findFirst({
        where: { entityType, entityId, status: 'PENDING' },
        select: { id: true },
      });
      if (open) {
        return NextResponse.json(
          { error: 'This item already has a change waiting for approval. It must be approved or rejected before you submit another.' },
          { status: 409 },
        );
      }
    }

    // Every check that can refuse the request runs before the status changes
    // further down; otherwise a refused request left the product disabled (or
    // the provider/tax PENDING_APPROVAL) with nothing waiting for approval.

    // Statement parameters are checked now (clear errors for the maker) and again on approval.
    if (entityType === 'StatementParameter') {
      if (!parsedPayload) {
        return NextResponse.json({ error: 'Invalid statement parameter.' }, { status: 400 });
      }
      const checked = await checkStatementParameterChange(changeType, entityId, parsedPayload);
      if (!checked.ok) {
        return NextResponse.json({ error: checked.error }, { status: 400 });
      }
    }

    // Validate embedded file payloads for uploads submitted via pending changes
    if ((entityType === 'DataProvisioningUpload' || entityType === 'EligibilityList') && changeType === 'CREATE') {
      try {
        const created = parsedPayload?.created;
        const fileContent = created?.fileContent;
        const fileName = created?.fileName;

        if (!fileContent || !fileName) {
          return NextResponse.json({ error: 'File upload failed. Please try again.' }, { status: 400 });
        }

        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
        const buffer = Buffer.from(fileContent, 'base64');
        if (buffer.length > MAX_FILE_SIZE) {
          return NextResponse.json({ error: 'File upload failed. Please try again.' }, { status: 400 });
        }

        if (!/\.(xlsx|xls)$/i.test(fileName)) {
          return NextResponse.json({ error: 'File upload failed. Please try again.' }, { status: 400 });
        }

        // Try to parse the workbook to ensure it's a valid Excel file
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
      } catch (err) {
        console.error('Invalid file payload for pending change:', err);
        return NextResponse.json({ error: 'File upload failed. Please try again.' }, { status: 400 });
      }
    }

    // Deleting an eligibility list goes through approval (it used to be an
    // immediate call); there must be a list to delete.
    if (entityType === 'EligibilityList' && changeType === 'DELETE') {
      const product = entityId
        ? await prisma.loanProduct.findUnique({ where: { id: entityId }, select: { eligibilityUploadId: true } })
        : null;
      if (!product?.eligibilityUploadId) {
        return NextResponse.json({ error: 'This product has no eligibility list to delete.' }, { status: 400 });
      }
    }

    // For update/delete requests we change the original entity state to prevent
    // it from being used while the change is pending. For products we disable
    // them immediately so they cannot be selected; providers remain PENDING_APPROVAL.
    if (entityId && (changeType === 'UPDATE' || changeType === 'DELETE')) {
      if (entityType === 'LoanProvider') {
        await prisma.loanProvider.update({ where: { id: entityId }, data: { status: 'PENDING_APPROVAL' }});
      } else if (entityType === 'LoanProduct') {
        // Safe-only updates (e.g. salary mappings, eligibility) don't change
        // existing loan terms, so keep the product in its current status while
        // the change is pending. The maker-checker flow is unchanged.
        const keepProductStatus = changeType === 'UPDATE' && !!parsedPayload && isSafeOnlyProductUpdate(parsedPayload);
        if (!keepProductStatus) {
          await prisma.loanProduct.update({ where: { id: entityId }, data: { status: 'Disabled' }});
        }
      } else if (entityType === 'Tax') {
        await prisma.tax.update({ where: { id: entityId }, data: { status: 'PENDING_APPROVAL' }});
      }
      // Scoring rules don't have a status on a single entity, it's a collection.
    }

    const sanitizedPayload = sanitizePendingChangePayload(entityType, payload);

    const newChange = await prisma.pendingChange.create({
      data: {
        entityType,
        entityId,
        changeType,
        payload: sanitizedPayload,
        status: 'PENDING', // Explicitly set the status
        createdById: session.userId,
      },
    });
    
    await createAuditLog({
        actorId: session.userId,
        action: 'CHANGE_REQUEST_CREATED',
        entity: entityType,
        entityId: entityId,
        details: { changeRequestId: newChange.id, changeType }
    });

    return NextResponse.json(newChange, { status: 201 });

  } catch (error: any) {
    console.error('Failed to create pending change:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

