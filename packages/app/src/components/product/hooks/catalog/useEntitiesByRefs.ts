import { Entity } from '@backstage/catalog-model';
import { AsyncResult } from '../api/queryTypes';
import { useCatalogQuery } from './useCatalogQuery';

/** Resolves entity refs (e.g. a product's Pyxis bindings) to catalog entities. */
export const useEntitiesByRefs = (
    entityRefs: string[],
): AsyncResult<Entity[]> => {
    const { data, loading, error, refetch } = useCatalogQuery(
        ['catalog', 'entities-by-refs', entityRefs],
        api =>
            api
                .getEntitiesByRefs({ entityRefs })
                .then(r =>
                    r.items.filter((e): e is Entity => e !== undefined),
                ),
        { enabled: entityRefs.length > 0 },
    );

    return {
        data: entityRefs.length > 0 ? (data ?? []) : [],
        loading: entityRefs.length > 0 && loading,
        error,
        refetch,
    };
};
