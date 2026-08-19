import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useKonfluxRequest } from '../api/konfluxApi';
import { managedProductsQueryKey } from './useManagedProducts';
import { productRestBase } from './productPaths';

export const usePinProduct = (): {
    setPinned: (entityRef: string, pinned: boolean) => Promise<void>;
    pending: boolean;
} => {
    const request = useKonfluxRequest();
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: ({
            entityRef,
            pinned,
        }: {
            entityRef: string;
            pinned: boolean;
        }) =>
            request<{ pinned: boolean }>(`${productRestBase(entityRef)}/pin`, {
                method: 'PUT',
                body: { pinned },
            }),
        onSuccess: () =>
            queryClient.invalidateQueries({
                queryKey: managedProductsQueryKey,
            }),
    });

    return {
        setPinned: (entityRef, pinned) =>
            mutation.mutateAsync({ entityRef, pinned }).then(() => undefined),
        pending: mutation.isPending,
    };
};
