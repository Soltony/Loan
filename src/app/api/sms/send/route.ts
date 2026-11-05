import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession } from '@/lib/user';
import { hasPermission } from '@/lib/permissions';
import { sendSmsToLoan, sendSingleSms, resolveMessagePlaceholders } from '@/actions/sms';
import { auditRequestContext, createAuditLog } from '@/lib/audit-log';

export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromSession();
        if (!user || !hasPermission(user, 'sms-management', 'create')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const data = await request.json();
        // A manual send from the admin UI; campaign sends are audited when the campaign starts.
        const auditSend = (result: { success: boolean; smsLogId: string; status: string; error?: string }, extra: Record<string, unknown>) =>
            createAuditLog({
                actorId: user.id,
                action: result.success ? 'SMS_SENT' : 'SMS_SEND_FAILED',
                entity: 'SmsLog',
                entityId: result.smsLogId,
                details: { ...extra, templateId: data.templateId ?? null, status: result.status, error: result.error ?? null },
                ...auditRequestContext(request),
            });

        // Send to specific loan
        if (data.loanId) {
            const result = await sendSmsToLoan({
                loanId: data.loanId,
                templateId: data.templateId,
                customMessage: data.customMessage,
            });
            await auditSend(result, { loanId: data.loanId, customMessage: data.customMessage ?? null });
            return NextResponse.json(result);
        }

        // Send directly to phone number (Quick Send)
        if (data.recipientPhone && data.messageContent) {
            const resolvedContent = await resolveMessagePlaceholders(
                data.messageContent,
                data.recipientPhone
            );
            const result = await sendSingleSms({
                recipientPhone: data.recipientPhone,
                recipientName: data.recipientName,
                messageContent: resolvedContent,
                templateId: data.templateId,
            });
            await auditSend(result, { recipientPhone: data.recipientPhone, messageContent: resolvedContent });
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Invalid request. Provide either loanId or recipientPhone with messageContent.' }, { status: 400 });
    } catch (error: any) {
        console.error('[API] POST /api/sms/send error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
