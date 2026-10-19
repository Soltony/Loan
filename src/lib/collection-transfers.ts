import { Prisma, type PrismaClient } from "@prisma/client";
import { normalizeReference } from "@/lib/manual-repayment";
import {
  componentPostsJournal,
  countsAsTransferred,
  roundCurrency,
  TRANSFER_COMPONENT_KEYS,
  type AccountSuggestions,
  type CollectionTransferSummary,
  type ComponentBalance,
  type TransferComponent,
} from "@/lib/collection-transfer-utils";

// Server side of the Collection Transfers register (maker-checker). Records are
// stored in the TaxTransferSimulation table (see schema.prisma for why the name stayed).

const TOLERANCE = 0.005;
const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

export class TransferError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type Client = PrismaClient | Prisma.TransactionClient;
type LedgerAccountLike = { id: string; name: string; type: string; category: string; balance: number };

export const userSummarySelect = { id: true, fullName: true, email: true } as const;

export const transferInclude = {
  provider: { select: { id: true, name: true } },
  recordedByUser: { select: userSummarySelect },
  checkedByUser: { select: userSummarySelect },
  reversalRequestedByUser: { select: userSummarySelect },
  reversedByUser: { select: userSummarySelect },
} satisfies Prisma.TaxTransferSimulationInclude;

function destinationLedgerAccountName(destinationAccountName: string) {
  return `Tax Destination: ${destinationAccountName}`.slice(0, 255);
}

/** A rejected or reversed row gives its reference back so a corrected entry can use it. */
function retiredReferenceKey(referenceKey: string, id: string) {
  return `${referenceKey}|${id}`;
}

/**
 * Ledger account whose balance bounds how much of a component can be transferred:
 *  - Tax: the Tax Receivable holding account. Inclusive tax deducted at
 *    disbursement sits there, and approved tax transfers post out of it, so its
 *    balance is already net of what has been transferred.
 *  - Everything else: <Component> Received, the running total collected from
 *    borrowers. Transfers do not post against it, so what is still available
 *    is that total minus the transfers approved so far.
 */
export function sourceLedgerFor(component: TransferComponent, accounts: LedgerAccountLike[]) {
  const type = component === "Tax" ? "Receivable" : "Received";
  return accounts.find((a) => a.category === component && a.type === type) ?? null;
}

/** Pending submissions reserve their amount, so two makers cannot commit the same balance. */
export function availableFor(
  component: TransferComponent,
  sourceBalance: number,
  transferred: number,
  pending: number
) {
  if (componentPostsJournal(component)) return roundCurrency(sourceBalance - pending);
  return roundCurrency(sourceBalance - transferred - pending);
}

async function transferTotals(client: Client, providerId: string) {
  const rows = await client.taxTransferSimulation.groupBy({
    by: ["component", "status"],
    where: { providerId },
    _sum: { transferAmount: true },
  });
  const totals = new Map<string, { transferred: number; pending: number }>();
  for (const r of rows) {
    const t = totals.get(r.component) ?? { transferred: 0, pending: 0 };
    const amount = r._sum.transferAmount ?? 0;
    if (countsAsTransferred(r.status)) t.transferred = roundCurrency(t.transferred + amount);
    else if (r.status === "PENDING_APPROVAL") t.pending = roundCurrency(t.pending + amount);
    totals.set(r.component, t);
  }
  return totals;
}

async function componentAvailability(tx: Client, providerId: string, component: TransferComponent) {
  const accounts = await tx.ledgerAccount.findMany({ where: { providerId } });
  const source = sourceLedgerFor(component, accounts);
  if (!source) {
    const type = component === "Tax" ? "Receivable" : "Received";
    throw new TransferError(`${component} ${type} ledger account is not configured for this provider.`);
  }
  const totals = (await transferTotals(tx, providerId)).get(component) ?? { transferred: 0, pending: 0 };
  return {
    accounts,
    source,
    available: availableFor(component, source.balance, totals.transferred, totals.pending),
  };
}

/**
 * Serializes balance-changing work for one provider + component so concurrent
 * requests cannot both pass the available-balance check. An application lock is
 * used instead of a SERIALIZABLE transaction because the latter would hold range
 * locks on the provider's ledger accounts and could deadlock with repayment
 * callbacks updating those same rows.
 */
async function lockComponent(tx: Prisma.TransactionClient, providerId: string, component: string) {
  const resource = `collection-transfer:${providerId}:${component}`;
  const rows = await tx.$queryRaw<Array<{ result: number }>>`
    DECLARE @result INT;
    EXEC @result = sp_getapplock @Resource = ${resource}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
    SELECT @result AS result;
  `;
  if ((rows[0]?.result ?? -999) < 0) {
    throw new TransferError("Another transfer for this component is being processed. Please try again.", 409);
  }
}

async function loadTransfer(client: Client, transferId: string) {
  const transfer = await client.taxTransferSimulation.findUnique({ where: { id: transferId } });
  if (!transfer) throw new TransferError("Transfer not found", 404);
  return transfer;
}

function staleState(): never {
  throw new TransferError("This transfer has already changed state. Refresh and try again.", 409);
}

export async function getCollectionTransferSummary(
  client: PrismaClient,
  providerId: string
): Promise<CollectionTransferSummary> {
  const provider = await client.loanProvider.findUnique({
    where: { id: providerId },
    include: { ledgerAccounts: true },
  });
  if (!provider) throw new TransferError("Provider not found", 404);

  const totals = await transferTotals(client, providerId);

  const components: ComponentBalance[] = TRANSFER_COMPONENT_KEYS.map((component) => {
    const source = sourceLedgerFor(component, provider.ledgerAccounts);
    const { transferred, pending } = totals.get(component) ?? { transferred: 0, pending: 0 };
    const available = availableFor(component, source?.balance ?? 0, transferred, pending);
    return {
      component,
      sourceLedgerName: source?.name ?? null,
      transferred,
      pending,
      available,
      collected: roundCurrency(transferred + pending + available),
      postsJournal: componentPostsJournal(component),
    };
  });

  // Previously used from/to accounts per component, most recent first, so the
  // form can offer them instead of retyping GL numbers.
  const recent = await client.taxTransferSimulation.findMany({
    where: { providerId, status: { not: "REJECTED" } },
    select: { component: true, sourceAccountName: true, destinationAccountName: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const suggestions: Partial<Record<TransferComponent, AccountSuggestions>> = {};
  for (const row of recent) {
    const bucket = (suggestions[row.component as TransferComponent] ??= { sources: [], destinations: [] });
    const src = row.sourceAccountName?.trim();
    const dest = row.destinationAccountName?.trim();
    if (src && !bucket.sources.includes(src) && bucket.sources.length < 10) bucket.sources.push(src);
    if (dest && !bucket.destinations.includes(dest) && bucket.destinations.length < 10) {
      bucket.destinations.push(dest);
    }
  }

  return { providerId, components, suggestions };
}

export type SubmitTransferInput = {
  providerId: string;
  component: TransferComponent;
  amount: number;
  sourceAccountName: string;
  destinationAccountName: string;
  transferReference: string;
  transferDate: Date;
  notes?: string | null;
  makerId: string;
};

/** Maker: records the transfer as PENDING_APPROVAL, reserving its amount. Nothing posts yet. */
export async function submitCollectionTransfer(client: PrismaClient, input: SubmitTransferInput) {
  const amount = roundCurrency(input.amount);
  if (amount <= 0) throw new TransferError("Transfer amount must be at least 0.01");

  const referenceKey = normalizeReference(input.transferReference);
  if (!referenceKey) throw new TransferError("Transfer reference is required");
  const duplicate = await client.taxTransferSimulation.findUnique({
    where: { referenceKey },
    select: { id: true },
  });
  if (duplicate) {
    throw new TransferError("This transfer reference is already used by a pending or approved transfer.");
  }

  return client.$transaction(async (tx) => {
    await lockComponent(tx, input.providerId, input.component);

    const { available } = await componentAvailability(tx, input.providerId, input.component);
    if (amount > available + TOLERANCE) {
      throw new TransferError(
        `Transfer amount exceeds the ${input.component} amount available to transfer. Available: ${available.toFixed(2)}, requested: ${amount.toFixed(2)}.`
      );
    }

    return tx.taxTransferSimulation.create({
      data: {
        providerId: input.providerId,
        component: input.component,
        transferAmount: amount,
        sourceAccountName: input.sourceAccountName,
        destinationAccountName: input.destinationAccountName,
        transferReference: input.transferReference,
        referenceKey,
        transferDate: input.transferDate,
        recordedByUserId: input.makerId,
        status: "PENDING_APPROVAL",
        notes: input.notes || null,
      },
      include: transferInclude,
    });
  }, TRANSACTION_OPTIONS);
}

/** Checker: approves a pending transfer. Approved tax transfers post their journal entry now. */
export async function approveCollectionTransfer(
  client: PrismaClient,
  input: { transferId: string; checkerId: string }
) {
  const head = await loadTransfer(client, input.transferId);
  const component = head.component as TransferComponent;

  return client.$transaction(async (tx) => {
    await lockComponent(tx, head.providerId, component);

    const transfer = await loadTransfer(tx, input.transferId);
    if (transfer.status !== "PENDING_APPROVAL") staleState();
    if (transfer.recordedByUserId === input.checkerId) {
      throw new TransferError("You cannot approve a transfer you submitted yourself.", 403);
    }

    // This transfer is still counted as pending, so the balance must simply not
    // have gone negative since it was submitted (e.g. a repayment reversal).
    const { accounts, source, available } = await componentAvailability(tx, transfer.providerId, component);
    if (available < -TOLERANCE) {
      throw new TransferError(
        `Approving would exceed the ${component} amount available to transfer by ${Math.abs(available).toFixed(2)}. Reject it or ask the maker to resubmit a smaller amount.`
      );
    }

    let journalEntryId: string | null = null;
    if (componentPostsJournal(component)) {
      const amount = transfer.transferAmount;
      const destLedgerName = destinationLedgerAccountName(transfer.destinationAccountName);
      // Kept as Tax/Received so tax moved out of Tax Receivable does not
      // reappear as receivable; the dashboard counts these as tax paid.
      const destination =
        accounts.find((a) => a.name === destLedgerName) ??
        (await tx.ledgerAccount.create({
          data: {
            providerId: transfer.providerId,
            name: destLedgerName,
            type: "Received",
            category: "Tax",
            balance: 0,
          },
        }));

      const journalEntry = await tx.journalEntry.create({
        data: {
          providerId: transfer.providerId,
          date: transfer.transferDate,
          description: `Tax transfer - Ref: ${transfer.transferReference}`.slice(0, 255),
          entries: {
            create: [
              { ledgerAccountId: destination.id, type: "Debit", amount },
              { ledgerAccountId: source.id, type: "Credit", amount },
            ],
          },
        },
      });
      journalEntryId = journalEntry.id;

      await tx.ledgerAccount.update({
        where: { id: source.id },
        data: { balance: { decrement: amount } },
      });
      await tx.ledgerAccount.update({
        where: { id: destination.id },
        data: { balance: { increment: amount } },
      });
    }

    const claimed = await tx.taxTransferSimulation.updateMany({
      where: { id: transfer.id, status: "PENDING_APPROVAL" },
      data: { status: "APPROVED", checkedByUserId: input.checkerId, checkedAt: new Date(), journalEntryId },
    });
    if (claimed.count !== 1) staleState();

    return tx.taxTransferSimulation.findUniqueOrThrow({ where: { id: transfer.id }, include: transferInclude });
  }, TRANSACTION_OPTIONS);
}

/** Checker: rejects a pending transfer, releasing its reserved amount and its reference. */
export async function rejectCollectionTransfer(
  client: PrismaClient,
  input: { transferId: string; checkerId: string; reason: string }
) {
  return client.$transaction(async (tx) => {
    const transfer = await loadTransfer(tx, input.transferId);
    if (transfer.status !== "PENDING_APPROVAL") staleState();
    if (transfer.recordedByUserId === input.checkerId) {
      throw new TransferError("You cannot reject a transfer you submitted yourself.", 403);
    }

    const claimed = await tx.taxTransferSimulation.updateMany({
      where: { id: transfer.id, status: "PENDING_APPROVAL" },
      data: {
        status: "REJECTED",
        checkedByUserId: input.checkerId,
        checkedAt: new Date(),
        rejectionReason: input.reason,
        referenceKey: retiredReferenceKey(transfer.referenceKey, transfer.id),
      },
    });
    if (claimed.count !== 1) staleState();

    return tx.taxTransferSimulation.findUniqueOrThrow({ where: { id: transfer.id }, include: transferInclude });
  }, TRANSACTION_OPTIONS);
}

/** Maker: asks for an approved transfer to be reversed. Nothing changes until a checker approves. */
export async function requestTransferReversal(
  client: PrismaClient,
  input: { transferId: string; requesterId: string; reason: string }
) {
  const claimed = await client.taxTransferSimulation.updateMany({
    where: { id: input.transferId, status: { in: ["APPROVED", "SIMULATED"] } },
    data: {
      status: "PENDING_REVERSAL",
      reversalReason: input.reason,
      reversalRequestedByUserId: input.requesterId,
      reversalRequestedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    await loadTransfer(client, input.transferId);
    throw new TransferError("Only an approved transfer can be reversed.", 409);
  }
  return client.taxTransferSimulation.findUniqueOrThrow({ where: { id: input.transferId }, include: transferInclude });
}

/** Checker: approves a reversal. Tax transfers get a compensating journal entry. */
export async function approveTransferReversal(
  client: PrismaClient,
  input: { transferId: string; checkerId: string }
) {
  const head = await loadTransfer(client, input.transferId);

  return client.$transaction(async (tx) => {
    await lockComponent(tx, head.providerId, head.component);

    const transfer = await tx.taxTransferSimulation.findUnique({
      where: { id: input.transferId },
      include: { journalEntry: { include: { entries: true } } },
    });
    if (!transfer) throw new TransferError("Transfer not found", 404);
    if (transfer.status !== "PENDING_REVERSAL") staleState();
    if (transfer.reversalRequestedByUserId === input.checkerId) {
      throw new TransferError("You cannot approve a reversal you requested yourself.", 403);
    }

    const claimed = await tx.taxTransferSimulation.updateMany({
      where: { id: transfer.id, status: "PENDING_REVERSAL" },
      data: {
        status: "REVERSED",
        reversedByUserId: input.checkerId,
        reversedAt: new Date(),
        referenceKey: retiredReferenceKey(transfer.referenceKey, transfer.id),
      },
    });
    if (claimed.count !== 1) staleState();

    // Only approved tax transfers carry a journal entry; register-only rows just change status.
    const originalEntries = transfer.journalEntry?.entries ?? [];
    if (originalEntries.length > 0) {
      await tx.journalEntry.create({
        data: {
          providerId: transfer.providerId,
          date: new Date(),
          description: `Reversal of tax transfer - Ref: ${transfer.transferReference}`.slice(0, 255),
          entries: {
            create: originalEntries.map((e) => ({
              ledgerAccountId: e.ledgerAccountId,
              type: e.type === "Debit" ? "Credit" : "Debit",
              amount: e.amount,
            })),
          },
        },
      });
      for (const e of originalEntries) {
        // The original debit raised the destination; the credit lowered the holding account.
        await tx.ledgerAccount.update({
          where: { id: e.ledgerAccountId },
          data: { balance: e.type === "Debit" ? { decrement: e.amount } : { increment: e.amount } },
        });
      }
    }

    return tx.taxTransferSimulation.findUniqueOrThrow({ where: { id: transfer.id }, include: transferInclude });
  }, TRANSACTION_OPTIONS);
}

/** Checker: declines a reversal request; the transfer stands as approved. */
export async function rejectTransferReversal(
  client: PrismaClient,
  input: { transferId: string; checkerId: string }
) {
  const transfer = await loadTransfer(client, input.transferId);
  if (transfer.status !== "PENDING_REVERSAL") staleState();
  if (transfer.reversalRequestedByUserId === input.checkerId) {
    throw new TransferError("You cannot decide on a reversal you requested yourself.", 403);
  }

  const claimed = await client.taxTransferSimulation.updateMany({
    where: { id: transfer.id, status: "PENDING_REVERSAL" },
    data: {
      status: "APPROVED",
      reversalReason: null,
      reversalRequestedByUserId: null,
      reversalRequestedAt: null,
    },
  });
  if (claimed.count !== 1) staleState();

  return client.taxTransferSimulation.findUniqueOrThrow({ where: { id: transfer.id }, include: transferInclude });
}
