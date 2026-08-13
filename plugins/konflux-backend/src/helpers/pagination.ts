import { SourcePaginationState } from '../services/resource-fetcher';

export type ContinuationPayload = {
    sources: Array<{
        cluster: string;
        namespace: string;
        state: SourcePaginationState;
    }>;
};

export function encodeContinuation(payload: ContinuationPayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeContinuation(
    token?: string,
): ContinuationPayload | undefined {
    if (!token) {
        return undefined;
    }

    try {
        return JSON.parse(
            Buffer.from(token, 'base64url').toString('utf8'),
        ) as ContinuationPayload;
    } catch {
        return undefined;
    }
}
