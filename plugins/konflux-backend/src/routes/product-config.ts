import { HttpAuthService } from '@backstage/backend-plugin-api';
import { ProductConfig } from '@internal/backstage-plugin-konflux-common';
import express from 'express';
import Router from 'express-promise-router';
import { ProductConfigStore } from '../services/product-config-store';
import { entityRefFromParams, parseWriteBody } from './parsers';

export interface ProductConfigRouterOptions {
    httpAuth: HttpAuthService;
    productConfigStore: ProductConfigStore;
}

export function createProductConfigRouter(
    options: ProductConfigRouterOptions,
): express.Router {
    const { httpAuth, productConfigStore } = options;
    const router = Router();

    router.get('/product-config/:kind/:namespace/:name', async (req, res) => {
        await httpAuth.credentials(req, { allow: ['user'] });
        const entityRef = entityRefFromParams(req.params);
        const stored = await productConfigStore.get(entityRef);

        if (!stored) {
            res.status(404).json({
                error: 'Product config not found',
                entityRef,
            });
            return;
        }

        res.json(stored);
    });

    router.put('/product-config/:kind/:namespace/:name', async (req, res) => {
        const credentials = await httpAuth.credentials(req, {
            allow: ['user'],
        });
        const entityRef = entityRefFromParams(req.params);
        const parsed = parseWriteBody(req.body);

        if ('error' in parsed) {
            res.status(400).json({ error: parsed.error });
            return;
        }

        const updatedBy =
            credentials.principal.type === 'user'
                ? credentials.principal.userEntityRef
                : undefined;

        const productConfig: ProductConfig = {
            entityRef,
            updatedAt: new Date().toISOString(),
            updatedBy,
            konfluxBindings: parsed.konfluxBindings,
            pyxisBindings: parsed.pyxisBindings,
        };

        await productConfigStore.set(entityRef, productConfig);
        res.json(productConfig);
    });

    router.delete(
        '/product-config/:kind/:namespace/:name',
        async (req, res) => {
            await httpAuth.credentials(req, { allow: ['user'] });
            const entityRef = entityRefFromParams(req.params);
            const deleted = await productConfigStore.delete(entityRef);

            if (!deleted) {
                res.status(404).json({
                    error: 'Product config not found',
                    entityRef,
                });
                return;
            }

            res.status(204).send();
        },
    );

    return router;
}
