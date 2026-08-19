import { parseEntityRef } from '@backstage/catalog-model';

/** REST path prefix for product endpoints: `/products/:namespace/:name`. */
export const productRestBase = (entityRef: string): string => {
    const { namespace, name } = parseEntityRef(entityRef, {
        defaultKind: 'system',
        defaultNamespace: 'default',
    });
    return `/products/${encodeURIComponent(namespace)}/${encodeURIComponent(
        name,
    )}`;
};
