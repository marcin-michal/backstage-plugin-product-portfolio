import {
    coreServices,
    createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { ProductEntityProvider } from './ProductEntityProvider';

const DEFAULT_PRODUCTS_PATH = './konflux-products.json';

export const catalogModuleProductProvider = createBackendModule({
    pluginId: 'catalog',
    moduleId: 'product-provider',
    register(reg) {
        reg.registerInit({
            deps: {
                catalog: catalogProcessingExtensionPoint,
                logger: coreServices.logger,
                rootConfig: coreServices.rootConfig,
            },
            async init({ catalog, logger, rootConfig }) {
                const productsPath =
                    rootConfig.getOptionalString('konflux.productsPath') ??
                    DEFAULT_PRODUCTS_PATH;

                catalog.addEntityProvider(
                    new ProductEntityProvider(productsPath, logger),
                );

                logger.info('Product EntityProvider registered', {
                    productsPath,
                });
            },
        });
    },
});
