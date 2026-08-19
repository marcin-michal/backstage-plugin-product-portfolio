import {
    coreServices,
    createBackendModule,
    resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { ProductMatchingProcessor } from './ProductMatchingProcessor';

export const catalogModuleProductMatching = createBackendModule({
    pluginId: 'catalog',
    moduleId: 'product-matching-processor',
    register(reg) {
        reg.registerInit({
            deps: {
                catalog: catalogProcessingExtensionPoint,
                database: coreServices.database,
                logger: coreServices.logger,
            },
            async init({ catalog, database, logger }) {
                const knex = await database.getClient();

                const migrationsDirectory = resolvePackagePath(
                    '@internal/backstage-plugin-catalog-backend-module-product-matching',
                    'migrations',
                );

                await knex.migrate.latest({
                    directory: migrationsDirectory,
                    // Use a dedicated tracking table so migrations don't
                    // collide with the catalog plugin's own knex_migrations table
                    // (both share the same database since pluginId is 'catalog').
                    tableName: 'product_matching_migrations',
                });

                catalog.addProcessor(
                    new ProductMatchingProcessor(knex, logger),
                );

                logger.info('ProductMatchingProcessor registered');
            },
        });
    },
});
