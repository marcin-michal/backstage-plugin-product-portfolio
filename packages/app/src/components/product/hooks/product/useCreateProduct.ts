import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    CreateProductRequest,
    ProductDefinition,
} from '@internal/backstage-plugin-konflux-common';
import { useBackendRequest } from '../api/backendApi';
import { managedProductsQueryKey } from './useManagedProducts';

/**
 * Mutation hook for creating a new product System.
 * On success, automatically invalidates the managed-products list.
 */
export const useCreateProduct = (): {
    createProduct: (req: CreateProductRequest) => Promise<ProductDefinition>;
    creating: boolean;
    error?: string;
} => {
    const request = useBackendRequest();
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: (body: CreateProductRequest) =>
            request<ProductDefinition>('/products', { method: 'POST', body }),
        onSuccess: () =>
            queryClient.invalidateQueries({
                queryKey: managedProductsQueryKey,
            }),
    });

    let errorMessage: string | undefined;
    if (mutation.error) {
        errorMessage =
            mutation.error instanceof Error
                ? mutation.error.message
                : String(mutation.error);
    }

    return {
        createProduct: body => mutation.mutateAsync(body),
        creating: mutation.isPending,
        error: errorMessage,
    };
};
