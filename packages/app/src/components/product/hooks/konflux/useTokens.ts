import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'konflux-cluster-tokens';

const readTokens = (): Record<string, string> => {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const tokens: Record<string, string> = {};
            for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === 'string' && value.trim()) {
                    tokens[key] = value.trim();
                }
            }
            return tokens;
        }
    } catch {
        // ignore corrupt storage
    }
    return {};
};

const writeTokens = (tokens: Record<string, string>): void => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
};

/**
 * Manages per-cluster Konflux tokens in sessionStorage.
 * Tokens survive page refresh but are cleared when the tab closes.
 */
export const useKonfluxTokens = (
    configuredClusterIds: string[] = [],
): {
    tokens: Record<string, string>;
    hasToken: (cluster: string) => boolean;
    setToken: (cluster: string, token: string) => void;
    clearToken: (cluster: string) => void;
    clearAll: () => void;
    missingClusters: string[];
    markExpired: (cluster: string) => void;
} => {
    const [tokens, setTokens] = useState<Record<string, string>>(() =>
        typeof window !== 'undefined' ? readTokens() : {},
    );

    useEffect(() => {
        setTokens(readTokens());
    }, []);

    const persist = useCallback((next: Record<string, string>) => {
        writeTokens(next);
        setTokens(next);
    }, []);

    const hasToken = useCallback(
        (cluster: string) => !!tokens[cluster],
        [tokens],
    );

    const setToken = useCallback(
        (cluster: string, token: string) => {
            persist({ ...tokens, [cluster]: token.trim() });
        },
        [persist, tokens],
    );

    const clearToken = useCallback(
        (cluster: string) => {
            if (!(cluster in tokens)) return;
            const next = { ...tokens };
            delete next[cluster];
            persist(next);
        },
        [persist, tokens],
    );

    const clearAll = useCallback(() => {
        persist({});
    }, [persist]);

    const markExpired = useCallback(
        (cluster: string) => {
            clearToken(cluster);
        },
        [clearToken],
    );

    const missingClusters = useMemo(
        () => configuredClusterIds.filter(id => !tokens[id]),
        [configuredClusterIds, tokens],
    );

    return {
        tokens,
        hasToken,
        setToken,
        clearToken,
        clearAll,
        missingClusters,
        markExpired,
    };
};
