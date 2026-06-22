"use server";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit-log";
import { getUserFromSession } from "@/lib/user";
import { hasPermission } from "@/lib/require-permission";

// Validation schema for creating a tax transfer simulation
const taxTransferCreateSchema = z.object({
  providerId: z.string().min(1, "Provider ID is required"),
  transferAmount: z.number().positive("Transfer amount must be positive"),
  destinationAccountName: z.string().min(1, "Destination account is required"),
  transferReference: z
    .string()
    .min(1, "Transfer reference is required")
    .max(100, "Transfer reference must be less than 100 characters"),
  transferDate: z.string().datetime("Invalid transfer date"),
  notes: z.string().optional(),
});

// Validation schema for reversing a tax transfer
const taxTransferReverseSchema = z.object({
  transferSimulationId: z.string().min(1, "Transfer simulation ID is required"),
  reversalReason: z
    .string()
    .min(1, "Reversal reason is required")
    .min(10, "Reversal reason must be at least 10 characters"),
});

export async function GET(request: NextRequest) {
  try {
    // Check user permissions
    const user = await getUserFromSession();
    if (!user || !hasPermission(user, "tax-transfers", "read")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("providerId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

    const where: any = {};
    if (providerId) where.providerId = providerId;
    if (status) where.status = status;

    const [transfers, total] = await Promise.all([
      prisma.taxTransferSimulation.findMany({
        where,
        include: {
          provider: true,
          recordedByUser: {
            select: { id: true, fullName: true, email: true },
          },
          reversedByUser: {
            select: { id: true, fullName: true, email: true },
          },
          journalEntry: {
            include: {
              entries: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.taxTransferSimulation.count({ where }),
    ]);

    return NextResponse.json({
      data: transfers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("Error fetching tax transfers:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to fetch tax transfers",
      },
      { status: error.status || 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check user permissions
    const user = await getUserFromSession();
    if (!user || !hasPermission(user, "tax-transfers", "create")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = taxTransferCreateSchema.parse(body);

    // Validate transfer amount doesn't exceed available balance
    const provider = await prisma.loanProvider.findUnique({
      where: { id: data.providerId },
      include: {
        ledgerAccounts: {
          where: { category: "Tax", type: "Receivable" }, // Tax holding account
        },
      },
    });

    if (!provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    // Get current collected tax balance
    const taxHoldingAccount = provider.ledgerAccounts[0];
    const currentBalance = taxHoldingAccount?.balance || 0;

    if (data.transferAmount > currentBalance) {
      return NextResponse.json(
        {
          error: `Transfer amount exceeds available balance. Available: ${currentBalance}, Requested: ${data.transferAmount}`,
        },
        { status: 400 }
      );
    }

    // Check for duplicate transfer reference
    const existingTransfer = await prisma.taxTransferSimulation.findUnique({
      where: { transferReference: data.transferReference },
    });

    if (existingTransfer) {
      return NextResponse.json(
        { error: "This transfer reference already exists. Please use a unique reference." },
        { status: 400 }
      );
    }

    // Create the tax transfer within a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Ensure a Tax clearing account exists for the other leg of the journal entry
      let taxClearingAccount = await tx.ledgerAccount.findFirst({
        where: { providerId: data.providerId, category: "Tax", type: "Received" },
      });
      if (!taxClearingAccount) {
        taxClearingAccount = await tx.ledgerAccount.create({
          data: {
            providerId: data.providerId,
            name: "Tax Transfer Clearing",
            type: "Received",
            category: "Tax",
            balance: 0,
          },
        });
      }

      // Create journal entry for the transfer
      const journalEntry = await tx.journalEntry.create({
        data: {
          providerId: data.providerId,
          date: new Date(data.transferDate),
          description: `Tax transfer simulation - Ref: ${data.transferReference}`,
          entries: {
            create: [
              {
                // Debit Tax Clearing (money going out)
                ledgerAccountId: taxClearingAccount.id,
                type: "Debit",
                amount: data.transferAmount,
              },
              {
                // Credit Tax Holding (reduce the holding balance)
                ledgerAccountId: taxHoldingAccount!.id,
                type: "Credit",
                amount: data.transferAmount,
              },
            ],
          },
        },
        include: { entries: true },
      });

      // Reduce tax holding balance
      if (taxHoldingAccount) {
        await tx.ledgerAccount.update({
          where: { id: taxHoldingAccount.id },
          data: {
            balance: taxHoldingAccount.balance - data.transferAmount,
          },
        });
      }

      // Create tax transfer simulation record
      const transfer = await tx.taxTransferSimulation.create({
        data: {
          providerId: data.providerId,
          transferAmount: data.transferAmount,
          destinationAccountName: data.destinationAccountName,
          transferReference: data.transferReference,
          transferDate: new Date(data.transferDate),
          journalEntryId: journalEntry.id,
          recordedByUserId: user.id,
          status: "SIMULATED",
          notes: data.notes,
        },
        include: {
          provider: true,
          recordedByUser: {
            select: { id: true, fullName: true, email: true },
          },
          journalEntry: {
            include: { entries: true },
          },
        },
      });

      // Create audit log
      await createAuditLog({
        actorId: user.id,
        action: "CREATE_TAX_TRANSFER_SIMULATION",
        entity: "TaxTransferSimulation",
        entityId: transfer.id,
        details: JSON.stringify({
          amount: data.transferAmount,
          reference: data.transferReference,
          destination: data.destinationAccountName,
        }),
      });

      return transfer;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("Error creating tax transfer:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error.message || "Failed to create tax transfer",
      },
      { status: error.status || 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Check user permissions
    const user = await getUserFromSession();
    if (!user || !hasPermission(user, "tax-transfers", "update")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = taxTransferReverseSchema.parse(body);

    // Find the transfer
    const transfer = await prisma.taxTransferSimulation.findUnique({
      where: { id: data.transferSimulationId },
      include: {
        provider: {
          include: {
            ledgerAccounts: {
              where: { category: "Tax", type: "Receivable" }, // Tax holding account
            },
          },
        },
        journalEntry: true,
      },
    });

    if (!transfer) {
      return NextResponse.json(
        { error: "Tax transfer not found" },
        { status: 404 }
      );
    }

    if (transfer.status === "REVERSED") {
      return NextResponse.json(
        { error: "This transfer has already been reversed" },
        { status: 400 }
      );
    }

    // Reverse the transfer within a transaction
    const result = await prisma.$transaction(async (tx) => {
      const taxHoldingAccount = transfer.provider.ledgerAccounts[0];

      // Create reversal journal entry
      if (transfer.journalEntry && taxHoldingAccount) {
        // Find tax clearing account used in the original entry
        const taxClearingAccount = await tx.ledgerAccount.findFirst({
          where: { providerId: transfer.providerId, category: "Tax", type: "Received" },
        });

        if (taxClearingAccount) {
          await tx.journalEntry.create({
            data: {
              providerId: transfer.providerId,
              date: new Date(),
              description: `Reversal of tax transfer - Ref: ${transfer.transferReference}`,
              entries: {
                create: [
                  {
                    // Reverse: Credit Tax Clearing
                    ledgerAccountId: taxClearingAccount.id,
                    type: "Credit",
                    amount: transfer.transferAmount,
                  },
                  {
                    // Reverse: Debit Tax Holding (restore balance)
                    ledgerAccountId: taxHoldingAccount.id,
                    type: "Debit",
                    amount: transfer.transferAmount,
                  },
                ],
              },
            },
          });
        }
      }

      // Restore tax holding balance
      if (taxHoldingAccount) {
        await tx.ledgerAccount.update({
          where: { id: taxHoldingAccount.id },
          data: {
            balance: taxHoldingAccount.balance + transfer.transferAmount,
          },
        });
      }

      // Update transfer status
      const reversedTransfer = await tx.taxTransferSimulation.update({
        where: { id: data.transferSimulationId },
        data: {
          status: "REVERSED",
          reversedByUserId: user.id,
          reversalReason: data.reversalReason,
          reversedAt: new Date(),
        },
        include: {
          provider: true,
          recordedByUser: {
            select: { id: true, fullName: true, email: true },
          },
          reversedByUser: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      // Create audit log
      await createAuditLog({
        actorId: user.id,
        action: "REVERSE_TAX_TRANSFER_SIMULATION",
        entity: "TaxTransferSimulation",
        entityId: reversedTransfer.id,
        details: JSON.stringify({
          amount: transfer.transferAmount,
          reason: data.reversalReason,
        }),
      });

      return reversedTransfer;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error reversing tax transfer:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error.message || "Failed to reverse tax transfer",
      },
      { status: error.status || 500 }
    );
  }
}
