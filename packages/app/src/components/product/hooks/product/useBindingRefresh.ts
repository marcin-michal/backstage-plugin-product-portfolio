import { useCallback, useMemo, useState } from 'react';
import { KonfluxResourceBinding } from '@internal/backstage-plugin-konflux-common';
import {
    applicationToBinding,
    bindingsToNamespaceMappings,
    konfluxBindingKey,
} from '../../utils/bindings';
import { filterConfiguredApplications } from '../../utils/filterConfiguredResources';
import { ProductConfigSaveInput } from './useProductConfig';
import { useFetchAllResources } from './useFetchAllResources';

export interface UseBindingRefreshOptions {
    configured: boolean;
    hasAnyToken: boolean;
    konfluxBindings: KonfluxResourceBinding[];
    pyxisBindings: import('@internal/backstage-plugin-konflux-common').PyxisBinding[];
    tokens: Record<string, string>;
    save: (bindings: ProductConfigSaveInput) => Promise<unknown>;
    refetchConfig: () => void;
    /** Called after save to trigger a live-data re-fetch (e.g. refetch from useKonfluxApplications). */
    onLiveRefetch?: () => void;
}

/**
 * Provides a `refresh()` action that re-fetches live Applications for the
 * currently configured bindings, merges updated snapshot data, and persists
 * the result. Owns the `refreshing` / `refreshError` states so they don't
 * clutter the composition tab.
 */
export const useBindingRefresh = ({
    configured,
    hasAnyToken,
    konfluxBindings,
    pyxisBindings,
    tokens,
    save,
    refetchConfig,
    onLiveRefetch,
}: UseBindingRefreshOptions): {
    refreshing: boolean;
    refreshError: string | undefined;
    refresh: () => Promise<void>;
    dismissRefreshError: () => void;
} => {
    const [refreshing, setRefreshing] = useState(false);
    const [refreshError, setRefreshError] = useState<string>();

    const fetchAll = useFetchAllResources(tokens);
    const namespaceMappings = useMemo(
        () => bindingsToNamespaceMappings(konfluxBindings),
        [konfluxBindings],
    );

    const refresh = useCallback(async () => {
        if (!configured) return;
        if (!hasAnyToken) {
            setRefreshError(
                'Connect cluster tokens before refreshing live data.',
            );
            return;
        }
        if (namespaceMappings.length === 0) {
            setRefreshError('No Konflux bindings to refresh.');
            return;
        }

        setRefreshing(true);
        setRefreshError(undefined);
        try {
            const apps = await fetchAll('/resources/applications', {
                namespaceMappings,
            });

            const configuredApps = filterConfiguredApplications(
                apps,
                konfluxBindings,
            );
            const byKey = new Map(
                configuredApps.flatMap(app => {
                    const binding = applicationToBinding(app);
                    return binding
                        ? ([[konfluxBindingKey(binding), binding]] as const)
                        : [];
                }),
            );

            const updatedBindings = konfluxBindings.map(binding => {
                const refreshed = byKey.get(konfluxBindingKey(binding));
                return refreshed ?? binding;
            });

            await save({ konfluxBindings: updatedBindings, pyxisBindings });
            refetchConfig();
            onLiveRefetch?.();
        } catch (e) {
            setRefreshError(e instanceof Error ? e.message : String(e));
        } finally {
            setRefreshing(false);
        }
    }, [
        configured,
        hasAnyToken,
        namespaceMappings,
        fetchAll,
        konfluxBindings,
        pyxisBindings,
        save,
        refetchConfig,
        onLiveRefetch,
    ]);

    return {
        refreshing,
        refreshError,
        refresh,
        dismissRefreshError: () => setRefreshError(undefined),
    };
};
