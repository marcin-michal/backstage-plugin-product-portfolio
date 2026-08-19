import {
    coreServices,
    createBackendModule,
} from '@backstage/backend-plugin-api';
import { DatabaseManager } from '@backstage/backend-defaults/database';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { ProductEntityProvider } from './ProductEntityProvider';

export const catalogModuleProductProvider = createBackendModule({
    pluginId: 'catalog',
    moduleId: 'product-provider',
    register(reg) {
        reg.registerInit({
            deps: {
                catalog: catalogProcessingExtensionPoint,
                logger: coreServices.logger,
                rootConfig: coreServices.rootConfig,
                scheduler: coreServices.scheduler,
                lifecycle: coreServices.lifecycle,
            },
            async init({ catalog, logger, rootConfig, scheduler, lifecycle }) {
                const databaseManager = DatabaseManager.fromConfig(rootConfig);
                const knex = await databaseManager
                    .forPlugin('konflux', { logger, lifecycle })
                    .getClient();

                const taskRunner = scheduler.createScheduledTaskRunner({
                    frequency: { seconds: 10 },
                    timeout: { seconds: 30 },
                    initialDelay: { seconds: 1 },
                });

                catalog.addEntityProvider(
                    new ProductEntityProvider(knex, logger, taskRunner),
                );

                logger.info(
                    'Product EntityProvider registered (manual product_systems)',
                );
            },
        });
    },
});
