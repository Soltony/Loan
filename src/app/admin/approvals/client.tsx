'use client';

import React, { useState } from 'react';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DateTimeCell, StatusBadge, type DataTableColumn } from '@/components/admin/data-table';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { PendingChangeWithDetails, PaginatedPendingChanges } from './page';
import type { User } from '@/lib/types';
import { usePermissions } from '@/hooks/use-permissions';


// Detailed change dialog and diff/preview helpers removed — details now live on
// /admin/approvals/[id] as a simplified, accessible full-page view.


export function ApprovalsClient({
  paginatedData: initialData,
  currentUser,
}: {
  paginatedData: PaginatedPendingChanges;
  currentUser: User;
}) {
  useRequirePermission('approvals');
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const changes = initialData.data.filter(c => !removedIds.has(c.id));
  const [rejectionReason, setRejectionReason] = useState('');
  const [changeToReject, setChangeToReject] = useState<PendingChangeWithDetails | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const { canModule } = usePermissions();
  const canProcessApprovals = canModule('approvals', 'update');


  const handleProcessChange = async (changeId: string, approved: boolean, reason?: string) => {
    if (!canProcessApprovals) {
      toast({ title: 'Not authorized', description: 'You are not authorized to approve or reject changes.', variant: 'destructive' });
      return;
    }
    setProcessingId(changeId);
    try {
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeId, approved, rejectionReason: reason }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${approved ? 'approve' : 'reject'} change.`);
      }

      setRemovedIds(prev => new Set([...prev, changeId]));
      toast({
        title: 'Success',
        description: `Change has been successfully ${approved ? 'approved' : 'rejected'}.`,
      });

      if (approved) {
          router.refresh();
      }

    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
      setChangeToReject(null);
      setRejectionReason('');
    }
  };

  const handlePageChange = (page: number) => {
    router.push(`?page=${page}`);
  };

  const columns: DataTableColumn<PendingChangeWithDetails>[] = [
    {
      id: 'entity',
      header: 'Entity',
      cell: (change) => (
        <div className="font-medium">
          <div>{change.entityType}</div>
          <div className="text-sm font-normal text-muted-foreground">{change.entityName}</div>
          {change.providerName && <div className="text-xs font-normal text-muted-foreground">({change.providerName})</div>}
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: (change) => <StatusBadge status={change.changeType} tone={change.changeType === 'DELETE' ? 'danger' : 'info'} />,
    },
    { id: 'requestedBy', header: 'Requested By', cell: (change) => change.createdBy?.fullName || 'Unknown User' },
    { id: 'requestedAt', header: 'Requested At', cell: (change) => <DateTimeCell value={change.createdAt} /> },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      className: 'space-x-2 whitespace-nowrap',
      cell: (change) => (
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open change request" onClick={() => router.push(`/admin/approvals/${change.id}`)}>
            <Eye className="h-4 w-4" />
          </Button>
          {canProcessApprovals && (
            <>
              <Button
                variant="outline"
                size="sm"
                aria-label="Approve"
                onClick={() => handleProcessChange(change.id, true)}
                disabled={processingId === change.id || change.createdById === currentUser.id}
                className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
              >
                {processingId === change.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label="Reject"
                onClick={() => setChangeToReject(change)}
                disabled={processingId === change.id || change.createdById === currentUser.id}
                className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </>
      ),
    },
  ];

  return (
    <>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <h2 className="text-3xl font-bold tracking-tight">Pending Approvals</h2>
        <Card>
          <CardHeader>
            <CardTitle>Change Requests</CardTitle>
            <CardDescription>Review and approve or reject pending changes made by other users.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              caption="Change requests"
              columns={columns}
              rows={changes}
              rowKey={(change) => change.id}
              isLoading={isLoading}
              emptyMessage="No pending approvals for you to review."
              onRowClick={(change) => router.push(`/admin/approvals/${change.id}`)}
              paging={{
                page: initialData.page,
                pageSize: initialData.pageSize,
                total: initialData.total,
                totalPages: initialData.totalPages,
                onPageChange: handlePageChange,
              }}
            />
          </CardContent>
        </Card>
      </div>
      <Dialog open={!!changeToReject} onOpenChange={() => setChangeToReject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Change</DialogTitle>
            <DialogDescription>Please provide a reason for rejecting this change.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="e.g., Incorrect configuration..."
              disabled={!canProcessApprovals}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeToReject(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => handleProcessChange(changeToReject!.id, false, rejectionReason)}
              disabled={!canProcessApprovals || !rejectionReason.trim()}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Approval details are now on their own page: /admin/approvals/[id] */}
    </>
  );
}
