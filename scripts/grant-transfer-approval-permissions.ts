/**
 * Grants the Transfer Approvals (checker) permission to existing roles.
 *
 * Role permissions in this portal are a JSON blob keyed by the sidebar label
 * (`allMenuItems[].label` lower-cased and hyphenated, unless the item sets
 * `permissionKey`). A role that predates a new menu entry has no key for it, and
 * the middleware's "menu permission read check" runs for every role — Super Admin
 * included — so until the key exists the new page bounces back to /admin for everyone.
 *
 * This writes one key:
 *   transfer-approvals   Checker: approve/reject collection transfers and reversals
 *
 * The maker side keeps using the existing `tax-transfers` key (Collection Transfers):
 * create = submit a transfer, update = request a reversal.
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register scripts/grant-transfer-approval-permissions.ts
 *   npx tsx -r tsconfig-paths/register scripts/grant-transfer-approval-permissions.ts --apply
 *   npx tsx -r tsconfig-paths/register scripts/grant-transfer-approval-permissions.ts --apply --role "Loan Manager"
 *
 * Without --apply it runs as a dry run and only prints what it would change.
 */

import prisma from '../src/lib/prisma';
import { TRANSFER_CHECKER_MODULE } from '../src/lib/collection-transfer-access';

type Grant = { create: boolean; read: boolean; update: boolean; delete: boolean; approve?: boolean };

const NONE: Grant = { create: false, read: false, update: false, delete: false };
const FULL: Grant = { create: true, read: true, update: true, delete: true, approve: true };
const CHECKER: Grant = { create: false, read: true, update: true, delete: false, approve: true };
const READ_ONLY: Grant = { create: false, read: true, update: false, delete: false };

/**
 * What each known role gets. A role not listed here gets nothing unless it is
 * named with --role, in which case it gets read-only access.
 */
const BY_ROLE: Record<string, Grant> = {
  'Super Admin': FULL,
  'Loan Manager': CHECKER,
  Auditor: READ_ONLY,
};

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const roleIndex = argv.indexOf('--role');
  const role = roleIndex >= 0 ? argv[roleIndex + 1] : undefined;
  return { apply, role };
}

async function main() {
  const { apply, role } = parseArgs(process.argv.slice(2));

  const roles = await prisma.role.findMany({
    where: role ? { name: role } : undefined,
    orderBy: { name: 'asc' },
  });

  if (roles.length === 0) {
    console.log(role ? `No role named "${role}".` : 'No roles found.');
    return;
  }

  let changed = 0;

  for (const r of roles) {
    let permissions: Record<string, Grant>;
    try {
      permissions = JSON.parse(r.permissions || '{}');
    } catch {
      console.warn(`! ${r.name}: permissions are not valid JSON — skipped.`);
      continue;
    }

    if (permissions[TRANSFER_CHECKER_MODULE]) {
      console.log(`= ${r.name}: already has ${TRANSFER_CHECKER_MODULE} — left as is.`);
      continue;
    }

    const grant = BY_ROLE[r.name] ?? (role ? READ_ONLY : NONE);
    permissions[TRANSFER_CHECKER_MODULE] = grant;

    console.log(`${apply ? '+' : '~'} ${r.name}: ${TRANSFER_CHECKER_MODULE}=${describe(grant)}`);

    if (apply) {
      await prisma.role.update({
        where: { id: r.id },
        data: { permissions: JSON.stringify(permissions) },
      });
    }
    changed += 1;
  }

  console.log(
    apply
      ? `\nUpdated ${changed} role(s).`
      : `\nDry run: ${changed} role(s) would change. Re-run with --apply to write.`,
  );
}

function describe(grant: Grant) {
  const actions = (['create', 'read', 'update', 'delete', 'approve'] as const).filter((a) => grant[a]);
  return actions.length ? actions.join('/') : 'none';
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
