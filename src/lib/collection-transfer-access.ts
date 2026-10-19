/**
 * Who may do what with collection transfers (maker-checker).
 *
 *   Maker    tax-transfers: create (submit), update (request a reversal)
 *   Checker  transfer-approvals: update (approve/reject transfers and reversals)
 *   Viewer   tax-transfers or transfer-approvals: read
 *
 * `tax-transfers` is the Collection Transfers page's key from when it was
 * "Tax Transfers" (kept via `permissionKey` in menu-items.ts); `transfer-approvals`
 * is derived from the "Transfer Approvals" menu label. Nobody may decide on a
 * transfer they submitted, or on a reversal they requested.
 */

import type { User } from './types';

export const TRANSFER_MAKER_MODULE = 'tax-transfers';
export const TRANSFER_CHECKER_MODULE = 'transfer-approvals';

type Actor = Pick<User, 'permissions'> | null | undefined;

const can = (user: Actor, moduleKey: string, action: 'create' | 'read' | 'update' | 'delete' | 'approve') =>
  !!(user?.permissions as any)?.[moduleKey]?.[action];

export const canViewTransfers = (user: Actor) =>
  can(user, TRANSFER_MAKER_MODULE, 'read') || can(user, TRANSFER_CHECKER_MODULE, 'read');

export const canSubmitTransfer = (user: Actor) => can(user, TRANSFER_MAKER_MODULE, 'create');

export const canRequestTransferReversal = (user: Actor) => can(user, TRANSFER_MAKER_MODULE, 'update');

export const canDecideTransfer = (user: Actor) =>
  can(user, TRANSFER_CHECKER_MODULE, 'update') || can(user, TRANSFER_CHECKER_MODULE, 'approve');
