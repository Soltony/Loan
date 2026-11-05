import prisma from '@/lib/prisma';

export type DeletedEligibilityList = {
  productName: string;
  uploadId: string;
  fileName: string | null;
  rowCount: number | null;
  uploadedBy: string | null;
  uploadedAt: Date | null;
  deletedRows: number;
  previousFilter: string | null;
};

/**
 * Removes a product's eligibility allow-list: unlinks it, switches the
 * allow-list off (so the Settings switch matches what loans enforce), and
 * deletes the upload and its provisioned rows. Runs only on approval of an
 * EligibilityList DELETE change; deleting a list used to be a direct call that
 * skipped maker-checker. Returns null when the product has no list.
 */
export async function deleteEligibilityList(productId: string): Promise<DeletedEligibilityList | null> {
  const product = await prisma.loanProduct.findUnique({
    where: { id: productId },
    select: { name: true, eligibilityUploadId: true, eligibilityFilter: true },
  });
  if (!product?.eligibilityUploadId) return null;
  const uploadId = product.eligibilityUploadId;

  const upload = await prisma.dataProvisioningUpload.findUnique({
    where: { id: uploadId },
    select: { fileName: true, rowCount: true, uploadedBy: true, uploadedAt: true },
  });

  const deletedRows = await prisma.$transaction(async (tx) => {
    await tx.loanProduct.update({
      where: { id: productId },
      data: { eligibilityFilter: null, eligibilityUploadId: null, dataProvisioningEnabled: false },
    });
    // Delete provisioned rows before the upload. Its relation is SetNull, and
    // nulling uploadId would collide on the (borrowerId, configId, uploadId)
    // unique index.
    const rows = await tx.provisionedData.deleteMany({ where: { uploadId } });
    await tx.dataProvisioningUpload.deleteMany({ where: { id: uploadId } });
    return rows.count;
  });

  return {
    productName: product.name,
    uploadId,
    fileName: upload?.fileName ?? null,
    rowCount: upload?.rowCount ?? null,
    uploadedBy: upload?.uploadedBy ?? null,
    uploadedAt: upload?.uploadedAt ?? null,
    deletedRows,
    previousFilter: product.eligibilityFilter ?? null,
  };
}
