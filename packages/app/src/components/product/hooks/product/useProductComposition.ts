import { ProductComposition } from '@internal/backstage-plugin-konflux-common';
import { AsyncResult } from '../api/queryTypes';
import { useKonfluxQuery } from '../konflux/useKonfluxQuery';
import { productRestBase } from './productPaths';

export const productCompositionQueryKey = (entityRef: string) =>
    ['konflux', 'composition', entityRef] as const;

export const useProductComposition = (
    entityRef: string,
): AsyncResult<ProductComposition | undefined> => {
    return useKonfluxQuery<ProductComposition>(
        productCompositionQueryKey(entityRef),
        `${productRestBase(entityRef)}/composition`,
    );
};
