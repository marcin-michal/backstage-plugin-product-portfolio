import { useQueryClient } from '@tanstack/react-query';
import {
    ProductListItem,
    ProductsListResponse,
} from '@internal/backstage-plugin-konflux-common';
import { useKonfluxQuery } from '../konflux/useKonfluxQuery';

export const managedProductsQueryKey = ['konflux', 'managed-products'] as const;

export const useManagedProducts = (options?: {
    pinned?: boolean;
    search?: string;
}): {
    products: ProductListItem[];
    loading: boolean;
    error?: Error;
    refetch: () => void;
} => {
    const { data, loading, error, refetch } =
        useKonfluxQuery<ProductsListResponse>(
            [...managedProductsQueryKey, options?.pinned, options?.search],
            '/products',
            {
                query: {
                    pinned: options?.pinned ? 'true' : undefined,
                    search: options?.search,
                },
            },
        );

    return { products: data?.products ?? [], loading, error, refetch };
};

export const useInvalidateManagedProducts = (): (() => void) => {
    const queryClient = useQueryClient();
    return () =>
        void queryClient.invalidateQueries({
            queryKey: managedProductsQueryKey,
        });
};
