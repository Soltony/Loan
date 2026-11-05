/**
 * Products as the mini-app may send them to a borrower's phone.
 *
 * - `salaryAdvanceMappings` is the salary-advance product's list of every eligible
 *   customer's account number and salary. Eligibility reads it on the server; a
 *   borrower's browser must never receive it (it was sent with every loan: ~365 KB of
 *   other customers' account numbers and salaries per loan).
 * - Provider and product icons can be uploaded images stored inline as base64 data URIs
 *   (NIB's is ~290 KB). Every loan carries its product and that product's provider, so
 *   each loan sent the image twice. Screens that do not draw them drop them.
 */

type ProductLike = {
  icon?: string | null;
  salaryAdvanceMappings?: string | null;
  provider?: ({ icon?: string | null } & object) | null;
};

export function forBorrower<P extends ProductLike>(product: P, { keepIcon = false }: { keepIcon?: boolean } = {}): P {
  if (!product) return product;
  const out: P = { ...product };
  if ('salaryAdvanceMappings' in out) out.salaryAdvanceMappings = null;
  if (!keepIcon) {
    out.icon = '';
    if (product.provider) out.provider = { ...product.provider, icon: '' };
  }
  return out;
}
