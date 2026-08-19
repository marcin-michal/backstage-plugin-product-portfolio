import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    ManualOverrideItem,
    ManualOverrideType,
} from '@internal/backstage-plugin-konflux-common';
import { useKonfluxRequest } from '../api/konfluxApi';
import { productCompositionQueryKey } from './useProductComposition';
import { productRestBase } from './productPaths';

export const useManualOverride = (
    entityRef: string,
): {
    addOverride: (
        overrideType: ManualOverrideType,
        resourceKey: string,
    ) => Promise<ManualOverrideItem>;
    removeOverride: (id: string) => Promise<void>;
    pending: boolean;
} => {
    const request = useKonfluxRequest();
    const queryClient = useQueryClient();
    const invalidate = () =>
        queryClient.invalidateQueries({
            queryKey: productCompositionQueryKey(entityRef),
        });

    const addMutation = useMutation({
        mutationFn: (body: {
            overrideType: ManualOverrideType;
            resourceKey: string;
        }) =>
            request<ManualOverrideItem>(
                `${productRestBase(entityRef)}/overrides`,
                { method: 'POST', body },
            ),
        onSuccess: () => invalidate(),
    });

    const removeMutation = useMutation({
        mutationFn: (id: string) =>
            request<void>(`/overrides/${encodeURIComponent(id)}`, {
                method: 'DELETE',
            }),
        onSuccess: () => invalidate(),
    });

    return {
        addOverride: (overrideType, resourceKey) =>
            addMutation.mutateAsync({ overrideType, resourceKey }),
        removeOverride: id => removeMutation.mutateAsync(id),
        pending: addMutation.isPending || removeMutation.isPending,
    };
};
