/**
 * Who may do what in the Manual Repayment module (BRD 3.1 / 3.10).
 *
 * The module keys match the sidebar labels in `menu-items.ts`, which is where this
 * portal's permission keys come from — renaming either label orphans every role's
 * stored permissions, so they are spelled out here once.
 *
 *   Maker (Repayment Officer)  manual-repayment: create
 *   Checker (Digital Ops)      repayment-approvals: update
 *   Auditor                    manual-repayment / repayment-approvals: read
 *   System Admin               access-control: update (policy)
 */

import type { User } from './types';

export const MAKER_MODULE = 'manual-repayment';
export const CHECKER_MODULE = 'repayment-approvals';

type Actor = Pick<User, 'permissions' | 'role'> | null | undefined;

const can = (user: Actor, moduleKey: string, action: 'create' | 'read' | 'update' | 'delete' | 'approve') =>
  !!user?.permissions?.[moduleKey]?.[action];

/** May key in a new repayment. */
export const canEnterRepayment = (user: Actor) => can(user, MAKER_MODULE, 'create');

/** May see repayments and the module's reports — makers, checkers and auditors. */
export const canViewRepayments = (user: Actor) =>
  can(user, MAKER_MODULE, 'read') || can(user, CHECKER_MODULE, 'read');

/** May approve or reject a repayment someone else entered. */
export const canDecideRepayment = (user: Actor) =>
  can(user, CHECKER_MODULE, 'update') || can(user, CHECKER_MODULE, 'approve');

/** May ask for a posted repayment to be backed out. */
export const canRequestReversal = (user: Actor) =>
  can(user, MAKER_MODULE, 'update') || can(user, MAKER_MODULE, 'delete');

/** May change the module's policy (allocation order, limits, overpayment handling). */
export const canConfigureModule = (user: Actor) =>
  user?.role === 'Super Admin' || can(user, 'access-control', 'update');

/** The IP and user agent the audit trail records for every transition (BRD 3.8). */
export function requestActorContext(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for');
  return {
    ipAddress: (forwarded ? forwarded.split(',')[0].trim() : null) || req.headers.get('x-real-ip') || 'N/A',
    userAgent: req.headers.get('user-agent') || 'N/A',
  };
}
