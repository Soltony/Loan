import {
  LayoutDashboard,
  Settings,
  FileText,
  ShieldCheck,
  FileCog,
  BadgeAlert,
  Landmark,
  Download,
  FolderArchive,
  BookUser,
  CheckSquare,
  Ban,
  MessageSquare,
  Wheat,
  Send,
  Banknote,
  PiggyBank,
  HeartHandshake,
  HandCoins,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';

export type MenuItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  /**
   * Role permission key for this page. Defaults to the kebab-cased label; set it
   * when a page is renamed so roles saved under the old key keep their access.
   */
  permissionKey?: string;
};

export const allMenuItems: MenuItem[] = [
  {
    path: '/admin',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['Super Admin', 'Loan Manager', 'Auditor', 'Loan Provider', 'Branch', 'District'],
  },
  {
    path: '/admin/reports',
    label: 'Reports',
    icon: FileText,
    roles: ['Super Admin', 'Loan Manager', 'Auditor', 'Loan Provider', 'Reconciliation', 'Branch', 'District'],
  },
   {
    path: '/admin/approvals',
    label: 'Approvals',
    icon: CheckSquare,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/reversals',
    label: 'Reversals',
    icon: FolderArchive,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/reversal-approvals',
    label: 'Reversal Approval',
    icon: CheckSquare,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/pending-payments',
    label: 'Pending Payments',
    icon: Download,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/pending-payment-approvals',
    label: 'Payment Approvals',
    icon: CheckSquare,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/manual-repayment',
    label: 'Manual Repayment',
    icon: HandCoins,
    roles: ['Super Admin', 'Loan Manager', 'Auditor', 'Branch', 'District'],
  },
  {
    path: '/admin/manual-repayment-approvals',
    label: 'Repayment Approvals',
    icon: ClipboardCheck,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/npl',
    label: 'NPL',
    icon: BadgeAlert,
    roles: ['Super Admin', 'Loan Manager', 'Auditor', 'Branch', 'District'],
  },
  {
    path: '/admin/npl-collection',
    label: 'NPL Collection',
    icon: Banknote,
    roles: ['Super Admin', 'Loan Manager', 'Auditor'],
  },
  {
    path: '/admin/sms-management',
    label: 'SMS Management',
    icon: MessageSquare,
    roles: ['Super Admin', 'Loan Manager'],
  },
   {
    path: '/admin/access-control',
    label: 'Access Control',
    icon: ShieldCheck,
    roles: ['Super Admin'],
  },
  {
    path: '/admin/credit-score-engine',
    label: 'Scoring Engine',
    icon: FileCog,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/tax',
    label: 'Tax',
    icon: Landmark,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/collection-transfers',
    label: 'Collection Transfers',
    // Formerly "Tax Transfers"; roles store their access under the old key.
    permissionKey: 'tax-transfers',
    icon: Send,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/collection-transfer-approvals',
    label: 'Transfer Approvals',
    icon: ClipboardCheck,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/revolving-fund',
    label: 'Revolving Fund',
    icon: PiggyBank,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/settings',
    label: 'Settings',
    icon: Settings,
    roles: ['Super Admin', 'Loan Manager', 'Loan Provider'],
  },
  {
    path: '/admin/disbursement-control',
    label: 'Disbursement Control',
    icon: Ban,
    roles: ['Super Admin'],
  },
  {
    path: '/admin/audit-logs',
    label: 'Audit Logs',
    icon: BookUser,
    roles: ['Super Admin', 'Auditor'],
  },
  {
    path: '/admin/farmer-loans',
    label: 'Farmer Loans',
    icon: Wheat,
    roles: ['Super Admin', 'Loan Manager'],
  },
  {
    path: '/admin/insurance-payments',
    label: 'Insurance Payments',
    icon: HeartHandshake,
    roles: ['Super Admin', 'Loan Manager'],
  },
];

/** Permission key that roles store this menu item's access under. */
export function menuPermissionKey(item: Pick<MenuItem, 'label' | 'permissionKey'>) {
  return item.permissionKey ?? item.label.toLowerCase().replace(/\s+/g, '-');
}

/** Display name for a permission module key: the menu label when one maps to it. */
export function permissionModuleLabel(moduleKey: string) {
  const item = allMenuItems.find((i) => menuPermissionKey(i) === moduleKey);
  return item?.label ?? moduleKey.replace(/-/g, ' ');
}
