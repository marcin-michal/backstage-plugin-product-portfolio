import { HttpAuthService } from '@backstage/backend-plugin-api';
import {
    ManagedProduct,
    ProductDefinition,
    ProductsListResponse,
} from '@internal/backstage-plugin-konflux-common';
import express from 'express';
import Router from 'express-promise-router';
import { ProductConfigStore } from '../services/product-config-store';
import {
    ProductStore,
    ProductStoreConflictError,
} from '../services/product-store';
import { parseCreateProductBody } from './parsers';

export interface ProductsRouterOptions {
    httpAuth: HttpAuthService;
    productStore: ProductStore;
    productConfigStore: ProductConfigStore;
}

export function createProductsRouter(
    options: ProductsRouterOptions,
): express.Router {
    const { httpAuth, productStore, productConfigStore } = options;
    const router = Router();

    /**
     * List user-created product definitions (Systems managed by this plugin).
     * Also includes composition status from the product-config store.
     */
    router.get('/products', async (req, res) => {
        await httpAuth.credentials(req, { allow: ['user'] });
        const products = await productStore.list();
        const composedEntityRefs = await productConfigStore.listComposedRefs();
        const composedSet = new Set(composedEntityRefs);

        const response: ProductsListResponse = {
            products: products.map(
                (product): ManagedProduct => ({
                    ...product,
                    composed: composedSet.has(product.entityRef),
                }),
            ),
            composedEntityRefs,
        };
        res.json(response);
    });

    /**
     * Create a new product System definition.
     * The catalog ProductEntityProvider picks it up from the shared JSON file.
     */
    router.post('/products', async (req, res) => {
        const credentials = await httpAuth.credentials(req, {
            allow: ['user'],
        });
        const parsed = parseCreateProductBody(req.body);
        if ('error' in parsed) {
            res.status(400).json({ error: parsed.error });
            return;
        }

        const createdBy =
            credentials.principal.type === 'user'
                ? credentials.principal.userEntityRef
                : undefined;

        const product: ProductDefinition = {
            entityRef: `system:${parsed.namespace}/${parsed.name}`,
            name: parsed.name,
            namespace: parsed.namespace,
            title: parsed.title,
            description: parsed.description,
            owner: parsed.owner,
            createdAt: new Date().toISOString(),
            createdBy,
        };

        try {
            const created = await productStore.create(product);
            res.status(201).json(created);
        } catch (error) {
            if (error instanceof ProductStoreConflictError) {
                res.status(409).json({ error: error.message });
                return;
            }
            throw error;
        }
    });

    return router;
}
