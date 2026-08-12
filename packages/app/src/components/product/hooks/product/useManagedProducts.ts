import { useQueryClient } from '@tanstack/react-query';
import {
    ManagedProduct,
    ProductsListResponse,
} from '@internal/backstage-plugin-konflux-common';
import { useKonfluxQuery } from '../konflux/useKonfluxQuery';

export const managedProductsQueryKey = [
    'konflux',
    'managed-products',
] as const;

/** Products created via this plugin's "Create Product" flow. */
export const useManagedProducts = (): {
    products: ManagedProduct[];
    loading: boolean;
    error?: Error;
    refetch: () => void;
} => {
    const { data, loading, error, refetch } =
        useKonfluxQuery<ProductsListResponse>(
            managedProductsQueryKey,
            '/products',
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
