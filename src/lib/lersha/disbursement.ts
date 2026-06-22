import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit-log";

/**
 * Auto-disbursement for farmer loans after OTP verification.
 *
 * Prerequisites (must be set up by admin):
 * 1. LoanProduct for agriculture loans
 * 2. LoanProvider with ledger accounts (Principal Receivable, ServiceFee Receivable, Tax Receivable)
 * 3. Borrower mapping: uses farmerId as Borrower id
 *
 * Flow:
 * 1. Get or create Borrower using farmerId
 * 2. Create Loan record
 * 3. Create journal entries for disbursement
 * 4. Update LershaLoanRequest status to DISBURSED
 */

interface AutoDisbursementResult {
  success: boolean;
  message: string;
  loanId?: string;
  borrowerId?: string;
  error?: string;
}

/**
 * Automatically disburse a farmer's loan after OTP verification.
 * Assumes LoanProduct and LoanProvider are already configured.
 */
export async function autoDisburseFarmerLoan(
  lershaLoanRequestId: string,
): Promise<AutoDisbursementResult> {
  try {
    // Find the loan request with farmer details
    const loanRequest = await prisma.lershaLoanRequest.findUnique({
      where: { id: lershaLoanRequestId },
      include: { farmer: true },
    });

    if (!loanRequest) {
      return {
        success: false,
        message: "Loan request not found",
        error: "LOAN_REQUEST_NOT_FOUND",
      };
    }

    if (loanRequest.status !== "OTP_VERIFIED") {
      return {
        success: false,
        message: `Cannot disburse loan with status: ${loanRequest.status}`,
        error: "INVALID_LOAN_STATUS",
      };
    }

    const farmer = loanRequest.farmer;
    const borrowerId = farmer.farmerId; // Use farmerId as Borrower id

    // Get or create Borrower
    let borrower = await prisma.borrower.findUnique({
      where: { id: borrowerId },
    });

    if (!borrower) {
      borrower = await prisma.borrower.create({
        data: {
          id: borrowerId,
          status: "Active",
        },
      });
    }

    // Find agriculture loan product
    // NOTE: User must have configured a LoanProduct for agriculture loans
    const product = await prisma.loanProduct.findFirst({
      where: {
        name: { contains: "agriculture" },
        status: "Active",
      },
      include: { provider: true },
    });

    if (!product) {
      return {
        success: false,
        message:
          "No active agriculture LoanProduct found. Please configure a LoanProduct first.",
        error: "NO_AGRICULTURE_PRODUCT",
      };
    }

    const provider = product.provider;

    // Ensure required ledger accounts exist
    const requiredAccounts = [
      { name: "Principal Receivable", type: "Receivable", category: "Principal" },
      { name: "ServiceFee Receivable", type: "Receivable", category: "ServiceFee" },
      { name: "Tax Receivable", type: "Receivable", category: "Tax" },
    ];

    const ledgerAccountMap: Record<string, string> = {};

    for (const req of requiredAccounts) {
      let account = await prisma.ledgerAccount.findUnique({
        where: {
          providerId_name: {
            providerId: provider.id,
            name: req.name,
          },
        },
      });

      if (!account) {
        account = await prisma.ledgerAccount.create({
          data: {
            providerId: provider.id,
            name: req.name,
            type: req.type,
            category: req.category,
            balance: 0,
          },
        });
      }
      ledgerAccountMap[req.name] = account.id;
    }

    // Create Loan record
    // First, create a LoanApplication
    const loanApplication = await prisma.loanApplication.create({
      data: {
        borrowerId,
        productId: product.id,
        loanAmount: farmer.requestedLoanAmount,
        status: "APPROVED",
      },
    });

    const loan = await prisma.loan.create({
      data: {
        borrowerId,
        productId: product.id,
        loanApplicationId: loanApplication.id,
        loanAmount: farmer.requestedLoanAmount,
        serviceFee: 0, // Will be calculated based on product rules
        penaltyAmount: 0,
        disbursedDate: new Date(),
        dueDate: new Date(
          Date.now() +
            farmer.requestedLoanTermInMonth * 30 * 24 * 60 * 60 * 1000,
        ),
        repaymentStatus: "Unpaid",
      },
    });

    // Create journal entries for disbursement
    const journalEntry = await prisma.journalEntry.create({
      data: {
        providerId: provider.id,
        loanId: loan.id,
        date: new Date(),
        description: `Farmer loan disbursement for ${farmer.farmerName} (Farm ID: ${farmer.farmerId})`,
        entries: {
          create: [
            {
              ledgerAccountId: ledgerAccountMap["Principal Receivable"],
              type: "Debit",
              amount: farmer.requestedLoanAmount,
            },
            {
              ledgerAccountId: ledgerAccountMap["ServiceFee Receivable"], // placeholder for balancing entry
              type: "Credit",
              amount: farmer.requestedLoanAmount,
            },
          ],
        },
      },
      include: { entries: true },
    });

    // Update LershaLoanRequest status to DISBURSED
    await prisma.lershaLoanRequest.update({
      where: { id: lershaLoanRequestId },
      data: {
        status: "DISBURSED",
        disbursementConfirmedAt: new Date(),
      },
    });

    // Create audit log
    await createAuditLog({
      actorId: "lersha-integration",
      action: "LERSHA_AUTO_DISBURSEMENT",
      entity: "LershaLoanRequest",
      entityId: lershaLoanRequestId,
      details: {
        farmerId: farmer.farmerId,
        farmerName: farmer.farmerName,
        borrowerId,
        loanId: loan.id,
        loanAmount: farmer.requestedLoanAmount,
        journalEntryId: journalEntry.id,
      },
    });

    return {
      success: true,
      message: "Loan disbursed successfully",
      loanId: loan.id,
      borrowerId: borrower.id,
    };
  } catch (error: any) {
    console.error("[autoDisburseFarmerLoan] Error:", error);
    return {
      success: false,
      message: "Failed to disburse loan",
      error: error.message,
    };
  }
}
