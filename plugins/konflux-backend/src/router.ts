import {
    LoggerService,
    RootConfigService,
    HttpAuthService,
} from '@backstage/backend-plugin-api';
import {
    DEFAULT_PRODUCT_CONFIG_PATH,
    DEFAULT_PRODUCTS_PATH,
} from '@internal/backstage-plugin-konflux-common';
import express from 'express';
import Router from 'express-promise-router';
import { getKonfluxConfig } from './helpers/config';
import { StructuredLogger } from './helpers/logger';
import { createKonfluxResourcesRouter } from './routes/konflux-resources';
import { createProductConfigRouter } from './routes/product-config';
import { createProductsRouter } from './routes/products';
import { KonfluxService } from './services/konflux-service';
import { ProductConfigStore } from './services/product-config-store';
import { ProductStore } from './services/product-store';

/** @public */
export interface RouterOptions {
    logger: LoggerService;
    config: RootConfigService;
    httpAuth: HttpAuthService;
}

/** @public */
export async function createRouter(
    options: RouterOptions,
): Promise<express.Router> {
    const { logger, config, httpAuth } = options;
    const router = Router();
    const konfluxLogger = new StructuredLogger(logger);
    const service = KonfluxService.fromConfig(config, logger);

    const parsedConfig = getKonfluxConfig(config, konfluxLogger);
    const productConfigPath =
        parsedConfig?.productConfigPath ?? DEFAULT_PRODUCT_CONFIG_PATH;
    const productsPath = parsedConfig?.productsPath ?? DEFAULT_PRODUCTS_PATH;

    const productConfigStore = new ProductConfigStore(productConfigPath, logger);
    const productStore = new ProductStore(productsPath, logger);

    konfluxLogger.info('Product config store ready', {
        path: productConfigStore.path,
    });
    konfluxLogger.info('Product definitions store ready', {
        path: productStore.path,
    });

    router.use(express.json());
    router.use(createKonfluxResourcesRouter({ logger: konfluxLogger, httpAuth, service }));
    router.use(createProductsRouter({ httpAuth, productStore, productConfigStore }));
    router.use(createProductConfigRouter({ httpAuth, productConfigStore }));

    return router;
}
