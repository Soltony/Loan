
import { headers } from 'next/headers';
import { ConnectClient, ConnectProblem } from './client';

export default async function ConnectPage() {
    const headersList = await headers();
    const authHeader = headersList.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return (
            <ConnectProblem
                title="Open Loans from the app"
                message="Loans can only be opened from inside the bank's app. Please go back and open it there."
                detail="Authorization header is missing or malformed."
            />
        );
    }

    const superAppToken = authHeader;

    return <ConnectClient superAppToken={superAppToken} />;
}
