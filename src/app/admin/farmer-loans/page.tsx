'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRequirePermission } from '@/hooks/use-require-permission';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Eye,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { format } from 'date-fns';

// ── Types ──────────────────────────────────────────

interface LoanPurpose {
  id: string;
  loanPurpose: string;
  specificVarietyName: string | null;
  quantity: number | null;
  unitOfMeasurement: string | null;
  unitPrice: number | null;
  totalCost: number;
  agroDealerName: string | null;
  agroDealerAccountNo: string | null;
  insuranceName: string | null;
}

interface LoanRequest {
  id: string;
  status: string;
  referenceNo: string | null;
  otpVerified: boolean;
  lershaDecisionSentAt: string | null;
  createdAt: string;
}

interface Farmer {
  id: string;
  farmerId: string;
  farmerName: string;
  phoneNumber: string;
  primaryCropType: string;
  totalFarmSizeInHectare: number;
  cultivatedAreaInHectare: number;
  requestedLoanAmount: number;
  requestedLoanTermInMonth: number;
  creditScoreValue: number;
  applicationChannel: string;
  status: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  createdAt: string;
  loanPurposes: LoanPurpose[];
  loanRequests: LoanRequest[];
}

// ── Helpers ────────────────────────────────────────

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + ' ETB';

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'APPROVED':
    case 'DISBURSED':
      return 'default';
    case 'DECLINED':
    case 'REJECTED':
      return 'destructive';
    case 'PENDING':
    case 'PENDING_OTP':
    case 'OTP_VERIFIED':
      return 'secondary';
    default:
      return 'outline';
  }
};

const statusLabel = (status: string): string => {
  switch (status) {
    case 'OTP_VERIFIED': return 'AUTO DISBURSING';
    case 'PENDING_OTP': return 'PENDING OTP';
    default: return status.replace(/_/g, ' ');
  }
};

const ITEMS_PER_PAGE = 20;

// ── Decline Reason Dialog ──────────────────────────

function DeclineDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  farmerName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting: boolean;
  farmerName: string;
}) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason);
      setReason('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline Loan Request</DialogTitle>
          <DialogDescription>
            Please provide a reason for declining the loan request for{' '}
            <span className="font-semibold">{farmerName}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="declineReason">Reason</Label>
          <Textarea
            id="declineReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Insufficient credit score, incomplete documentation..."
            className="mt-2"
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleConfirm}
            disabled={!reason.trim() || isSubmitting}
            variant="destructive"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Decline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────

export default function FarmerLoansPage() {
  useRequirePermission('farmer-loans');

  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Action state — only registration decisions; loan disbursement is automatic
  type ActionType = 'view' | 'approveRegistration' | 'rejectRegistration';
  const [actionState, setActionState] = useState<{
    type: ActionType;
    farmer: Farmer | null;
  }>({ type: 'view', farmer: null });
  const [rejectReason, setRejectReason] = useState('');

  const { toast } = useToast();
  const { canModule } = usePermissions();
  const canDecide = canModule('farmer-loans', 'update');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value === 'ALL' ? '' : value);
    setPage(1);
  }, []);

  const clearFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setStatusFilter('');
    setPage(1);
  };

  const hasActiveFilters = debouncedSearch || statusFilter;

  // Fetch
  const fetchFarmers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(ITEMS_PER_PAGE),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);

      const response = await fetch(`/api/farmer-loans?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch farmers.');
      const data = await response.json();
      setFarmers(data.farmers);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, toast]);

  useEffect(() => {
    fetchFarmers();
  }, [fetchFarmers]);

  // NOTE: Loan disbursement is fully automatic after OTP verification.
  // No manual admin decision is required for the loan itself.

  // Handle farmer registration approval/rejection
  const handleFarmerApproval = async (
    decision: 'APPROVED' | 'REJECTED',
    rejectionReason?: string,
  ) => {
    const farmer = actionState.farmer;
    if (!farmer || !canDecide) return;

    if (farmer.status !== 'PENDING') {
      toast({
        title: 'Error',
        description: 'Only PENDING farmers can be approved or rejected.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/farmer/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmer_id: farmer.farmerId,
          decision,
          rejectionReason: rejectionReason || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process decision.');
      }

      const result = await response.json();

      toast({
        title: decision === 'APPROVED' ? 'Farmer Approved' : 'Farmer Rejected',
        description: `${farmer.farmerName} has been ${decision.toLowerCase()}.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
        variant: decision === 'APPROVED' ? 'default' : 'destructive',
      });

      fetchFarmers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setActionState({ type: 'view', farmer: null });
    }
  };

  return (
    <>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Farmer Loans</h2>
          <p className="text-muted-foreground">
            Registered farmers from Lersha integration — view profiles, approve, or decline loan requests.
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-muted-foreground mb-1 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, ID, phone, crop..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="w-full md:w-[200px]">
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <Select value={statusFilter || 'ALL'} onValueChange={handleStatusChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All statuses</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="DECLINED">Declined</SelectItem>
                    <SelectItem value="DISBURSED">Disbursed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 gap-1">
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Registered Farmers</CardTitle>
            <CardDescription>
              {total} farmer{total !== 1 ? 's' : ''} registered
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Farmer ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Crop</TableHead>
                  <TableHead className="text-right">Loan Amount</TableHead>
                  <TableHead>Credit Score</TableHead>
                  <TableHead>Loan Status</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : farmers.length > 0 ? (
                  farmers.map((farmer) => {
                    const latestRequest = farmer.loanRequests[0];

                    return (
                      <TableRow key={farmer.id}>
                        <TableCell className="font-mono text-xs">
                          {farmer.farmerId}
                        </TableCell>
                        <TableCell className="font-medium">
                          {farmer.farmerName}
                        </TableCell>
                        <TableCell>{farmer.phoneNumber}</TableCell>
                        <TableCell>{farmer.primaryCropType}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(farmer.requestedLoanAmount)}
                        </TableCell>
                        <TableCell className="font-mono">
                          {farmer.creditScoreValue}
                        </TableCell>
                        <TableCell>
                          {latestRequest ? (
                            <Badge variant={statusVariant(latestRequest.status)}>
                              {statusLabel(latestRequest.status)}
                            </Badge>
                          ) : (
                            <Badge variant={statusVariant(farmer.status)}>
                              {statusLabel(farmer.status)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(farmer.createdAt), 'yyyy-MM-dd')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                setActionState({ type: 'view', farmer })
                              }
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canDecide && farmer.status === 'PENDING' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-green-600 hover:text-green-700"
                                  title="Approve farmer registration"
                                  onClick={() =>
                                    setActionState({ type: 'approveRegistration', farmer })
                                  }
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-600 hover:text-red-700"
                                  title="Reject farmer registration"
                                  onClick={() =>
                                    setActionState({ type: 'rejectRegistration', farmer })
                                  }
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {/* Loan disbursement is automatic after OTP — no manual action needed here */}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      No farmers found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter>
            <div className="flex items-center justify-end w-full space-x-2">
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* ── Detail Dialog ── */}
      <Dialog
        open={actionState.type === 'view' && !!actionState.farmer}
        onOpenChange={(open) =>
          !open && setActionState({ type: 'view', farmer: null })
        }
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {actionState.farmer && (
            <>
              <DialogHeader>
                <DialogTitle>{actionState.farmer.farmerName}</DialogTitle>
                <DialogDescription>
                  Farmer ID: {actionState.farmer.farmerId}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Personal Info */}
                <section>
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                    Personal Information
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Phone:</span>{' '}
                      {actionState.farmer.phoneNumber}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Address:</span>{' '}
                      {actionState.farmer.address}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Channel:</span>{' '}
                      {actionState.farmer.applicationChannel}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Credit Score:</span>{' '}
                      <span className="font-mono">{actionState.farmer.creditScoreValue}</span>
                    </div>
                  </div>
                </section>

                {/* Farm Details */}
                <section>
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                    Farm Details
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Crop:</span>{' '}
                      {actionState.farmer.primaryCropType}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total Farm:</span>{' '}
                      {actionState.farmer.totalFarmSizeInHectare} ha
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cultivated:</span>{' '}
                      {actionState.farmer.cultivatedAreaInHectare} ha
                    </div>
                    <div>
                      <span className="text-muted-foreground">Loan Term:</span>{' '}
                      {actionState.farmer.requestedLoanTermInMonth} months
                    </div>
                  </div>
                </section>

                {/* Emergency Contact */}
                <section>
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                    Emergency Contact
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Name:</span>{' '}
                      {actionState.farmer.emergencyContactName}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone:</span>{' '}
                      {actionState.farmer.emergencyContactPhone}
                    </div>
                  </div>
                </section>

                {/* Loan Purposes */}
                <section>
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                    Loan Purposes ({actionState.farmer.loanPurposes.length})
                  </h4>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Purpose</TableHead>
                          <TableHead>Variety</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {actionState.farmer.loanPurposes.map((lp) => (
                          <TableRow key={lp.id}>
                            <TableCell>{lp.loanPurpose}</TableCell>
                            <TableCell>
                              {lp.specificVarietyName || lp.insuranceName || '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {lp.quantity != null
                                ? `${lp.quantity} ${lp.unitOfMeasurement || ''}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {lp.unitPrice != null ? formatCurrency(lp.unitPrice) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(lp.totalCost)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="text-right mt-2 text-sm font-semibold">
                    Requested Total: {formatCurrency(actionState.farmer.requestedLoanAmount)}
                  </div>
                </section>

                {/* Latest Loan Request */}
                {actionState.farmer.loanRequests.length > 0 && (
                  <section>
                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                      Latest Loan Request
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Status:</span>{' '}
                        <Badge variant={statusVariant(actionState.farmer.loanRequests[0].status)}>
                          {actionState.farmer.loanRequests[0].status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Reference:</span>{' '}
                        <span className="font-mono">
                          {actionState.farmer.loanRequests[0].referenceNo || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">OTP Verified:</span>{' '}
                        {actionState.farmer.loanRequests[0].otpVerified ? 'Yes' : 'No'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Lersha Notified:</span>{' '}
                        {actionState.farmer.loanRequests[0].lershaDecisionSentAt
                          ? format(
                              new Date(actionState.farmer.loanRequests[0].lershaDecisionSentAt),
                              'yyyy-MM-dd HH:mm',
                            )
                          : '—'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Requested:</span>{' '}
                        {format(
                          new Date(actionState.farmer.loanRequests[0].createdAt),
                          'yyyy-MM-dd HH:mm',
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {/* Loan disbursement is triggered automatically upon OTP verification */}
                {actionState.farmer.loanRequests[0]?.status === 'OTP_VERIFIED' && (
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                    ⏳ OTP verified — loan disbursement is being processed automatically.
                  </div>
                )}
                {actionState.farmer.loanRequests[0]?.status === 'DISBURSED' && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                    ✅ Loan disbursed successfully.
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Loan approve/decline dialogs removed — disbursement is automatic after OTP */}

      {/* ── Approve Farmer Registration Dialog ── */}
      <AlertDialog
        open={actionState.type === 'approveRegistration' && !!actionState.farmer}
        onOpenChange={(open) =>
          !open && setActionState({ type: 'view', farmer: null })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Farmer Registration?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to approve the farmer registration for{' '}
              <span className="font-bold">
                {actionState.farmer?.farmerName}
              </span>
              . Once approved, this farmer can proceed to request a loan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleFarmerApproval('APPROVED')}
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Approve Registration
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reject Farmer Registration Dialog ── */}
      <Dialog
        open={actionState.type === 'rejectRegistration' && !!actionState.farmer}
        onOpenChange={(open) => {
          if (!open) {
            setActionState({ type: 'view', farmer: null });
            setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Farmer Registration</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting the registration of{' '}
              <span className="font-semibold">{actionState.farmer?.farmerName}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="rejectReason">Reason</Label>
            <Textarea
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Insufficient credit score, incomplete documentation, failed eligibility check..."
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (rejectReason.trim()) {
                  handleFarmerApproval('REJECTED', rejectReason);
                  setRejectReason('');
                }
              }}
              disabled={!rejectReason.trim() || isSubmitting}
              variant="destructive"
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reject Registration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
