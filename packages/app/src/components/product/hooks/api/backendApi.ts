import { useCallback } from 'react';
import {
    DiscoveryApi,
    FetchApi,
    discoveryApiRef,
    fetchApiRef,
    useApi,
} from '@backstage/core-plugin-api';
import { KONFLUX_TOKENS_HEADER } from '@internal/backstage-plugin-konflux-common';

/**
 * Error thrown by {@link backendRequest} for any non-2xx response from the
 * plugin backend. `statusCode` and `missingClusters` mirror the error body
 * the backend sends for auth failures.
 */
export class BackendApiError extends Error {
    statusCode?: number;
    missingClusters?: string[];

    constructor(
        message: string,
        options?: { statusCode?: number; missingClusters?: string[] },
    ) {
        super(message);
        this.name = 'BackendApiError';
        this.statusCode = options?.statusCode;
        this.missingClusters = options?.missingClusters;
    }
}

export interface BackendRequestInit {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    /** Per-cluster tokens, sent as the `X-Konflux-Tokens` header when present. */
    tokens?: Record<string, string>;
    /** Query string params; `undefined`/empty values are omitted. */
    query?: Record<string, string | undefined>;
    body?: unknown;
}

async function readErrorBody(
    response: Response,
): Promise<{ error?: string; missingClusters?: string[] }> {
    try {
        return (await response.json()) as {
            error?: string;
            missingClusters?: string[];
        };
    } catch {
        return {};
    }
}

/**
 * Low-level request helper for the plugin backend: resolves the plugin base
 * URL, builds the query string, attaches the tokens header when needed, and
 * normalizes error handling into a {@link BackendApiError}.
 *
 * Prefer {@link useBackendRequest} inside components/hooks — this function is
 * exported mainly so it can be used as a `queryFn`/`mutationFn`, or from
 * one-off imperative call sites.
 */
export const backendRequest = async <T>(
    discoveryApi: DiscoveryApi,
    fetchApi: FetchApi,
    path: string,
    init: BackendRequestInit = {},
): Promise<T> => {
    const baseUrl = await discoveryApi.getBaseUrl('konflux');
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(init.query ?? {})) {
        if (value !== undefined && value !== '') {
            url.searchParams.set(key, value);
        }
    }

    const response = await fetchApi.fetch(url.toString(), {
        method: init.method ?? 'GET',
        headers: {
            Accept: 'application/json',
            ...(init.body !== undefined
                ? { 'Content-Type': 'application/json' }
                : {}),
            ...(init.tokens
                ? { [KONFLUX_TOKENS_HEADER]: JSON.stringify(init.tokens) }
                : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    if (response.status === 204) {
        return undefined as T;
    }

    if (response.status === 401) {
        const body = await readErrorBody(response);
        throw new BackendApiError(body.error || 'Authentication required', {
            statusCode: 401,
            missingClusters: body.missingClusters,
        });
    }

    if (!response.ok) {
        const body = await readErrorBody(response);
        throw new BackendApiError(
            body.error || `Request failed: HTTP ${response.status}`,
            { statusCode: response.status },
        );
    }

    return (await response.json()) as T;
};

/**
 * Returns a stable `request(path, init)` function bound to the current
 * discovery/fetch APIs, for use as a `queryFn`/`mutationFn` or in imperative
 * callbacks.
 */
export const useBackendRequest = (): (<T>(
    path: string,
    init?: BackendRequestInit,
) => Promise<T>) => {
    const discoveryApi = useApi(discoveryApiRef);
    const fetchApi = useApi(fetchApiRef);
    return useCallback(
        <T>(path: string, init?: BackendRequestInit) =>
            backendRequest<T>(discoveryApi, fetchApi, path, init),
        [discoveryApi, fetchApi],
    );
};

/**
 * Like `request`, but returns `undefined` instead of throwing on 404.
 * Useful for optional GETs (e.g. checking whether a config record exists).
 */
export const backendRequestOrUndefined = async <T>(
    request: <U>(path: string, init?: BackendRequestInit) => Promise<U>,
    path: string,
    init?: BackendRequestInit,
): Promise<T | undefined> => {
    try {
        return await request<T>(path, init);
    } catch (e) {
        if (e instanceof BackendApiError && e.statusCode === 404) {
            return undefined;
        }
        throw e;
    }
};
