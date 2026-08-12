import { useEffect } from 'react';
import { KonfluxApiError } from '../api/konfluxApi';

/**
 * Watches a Konflux API error and clears tokens for any cluster that returned
 * a 401. Call this alongside any hook that passes tokens to the backend so
 * expired tokens are evicted automatically and the auth bar updates.
 *
 * Accepts the base `Error` type so callers can pass `PaginatedResult.error`
 * directly without a cast — the 401 check is done at runtime.
 */
export const useExpireTokensOn401 = (
    error: Error | undefined,
    markExpired: (clusterId: string) => void,
): void => {
    useEffect(() => {
        if (
            error instanceof KonfluxApiError &&
            error.statusCode === 401 &&
            error.missingClusters
        ) {
            for (const id of error.missingClusters) {
                markExpired(id);
            }
        }
    }, [error, markExpired]);
};
