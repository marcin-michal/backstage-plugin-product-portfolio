import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseEntityRef } from '@backstage/catalog-model';
import {
    KonfluxResourceBinding,
    ProductConfig,
    ProductConfigWriteRequest,
    PyxisBinding,
} from '@internal/backstage-plugin-konflux-common';
import {
    BackendApiError,
    backendRequestOrUndefined,
    useBackendRequest,
} from '../api/backendApi';

export type ProductConfigSaveInput = {
    konfluxBindings: KonfluxResourceBinding[];
    pyxisBindings: PyxisBinding[];
};

const productConfigPath = (entityRef: string): string => {
    const { kind, namespace, name } = parseEntityRef(entityRef, {
        defaultKind: 'system',
        defaultNamespace: 'default',
    });
    return `/product-config/${encodeURIComponent(kind)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
};

const productConfigQueryKey = (entityRef: string) =>
    ['konflux', 'product-config', entityRef] as const;

/** Fetch / save / remove the persisted product composition for a System entity. */
export const useProductConfig = (
    entityRef: string,
): {
    config: ProductConfig | undefined;
    loading: boolean;
    error?: Error;
    save: (bindings: ProductConfigSaveInput) => Promise<ProductConfig>;
    remove: () => Promise<void>;
    refetch: () => void;
    configured: boolean;
} => {
    const request = useBackendRequest();
    const queryClient = useQueryClient();
    const queryKey = productConfigQueryKey(entityRef);

    const query = useQuery({
        queryKey,
        queryFn: () =>
            backendRequestOrUndefined<ProductConfig>(
                request,
                productConfigPath(entityRef),
            ).then(result => result ?? null),
    });

    const saveMutation = useMutation({
        mutationFn: (bindings: ProductConfigSaveInput) => {
            const body: ProductConfigWriteRequest = {
                konfluxBindings: bindings.konfluxBindings,
                pyxisBindings: bindings.pyxisBindings,
            };
            return request<ProductConfig>(productConfigPath(entityRef), {
                method: 'PUT',
                body,
            });
        },
        onSuccess: saved => queryClient.setQueryData(queryKey, saved),
    });

    const removeMutation = useMutation({
        mutationFn: () =>
            backendRequestOrUndefined<void>(
                request,
                productConfigPath(entityRef),
                { method: 'DELETE' },
            ),
        onSuccess: () => queryClient.setQueryData(queryKey, null),
    });

    const error: Error | undefined =
        (query.error as BackendApiError) ??
        saveMutation.error ??
        removeMutation.error ??
        undefined;

    return {
        config: query.data ?? undefined,
        loading: query.isLoading,
        error,
        save: bindings => saveMutation.mutateAsync(bindings),
        remove: async () => {
            await removeMutation.mutateAsync();
        },
        refetch: () => void query.refetch(),
        configured: query.data !== null,
    };
};
