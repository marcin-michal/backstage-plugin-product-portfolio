import { Entity } from '@backstage/catalog-model';
import { AsyncResult } from '../api/queryTypes';
import { useCatalogQuery } from './useCatalogQuery';

const PYXIS_LISTING_FILTER = {
    kind: 'Component',
    'spec.type': 'product-listing',
} as const;

/** All catalog-synced Pyxis product listings, for the resource picker. */
export const usePyxisListings = (enabled = true): AsyncResult<Entity[]> => {
    const { data, loading, error, refetch } = useCatalogQuery(
        ['catalog', 'pyxis-listings'],
        api =>
            api
                .getEntities({ filter: PYXIS_LISTING_FILTER })
                .then(r => r.items),
        { enabled },
    );

    return { data: data ?? [], loading, error, refetch };
};
