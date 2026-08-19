import {
    coreServices,
    createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { createRouter } from './router';
import { KonfluxDatabase } from './services/database';

/** @public */
export const konfluxPlugin = createBackendPlugin({
    pluginId: 'konflux',
    register(env) {
        env.registerInit({
            deps: {
                config: coreServices.rootConfig,
                logger: coreServices.logger,
                httpRouter: coreServices.httpRouter,
                httpAuth: coreServices.httpAuth,
                database: coreServices.database,
                discovery: coreServices.discovery,
                auth: coreServices.auth,
            },
            async init({
                config,
                logger,
                httpRouter,
                httpAuth,
                database,
                discovery,
                auth,
            }) {
                const knex = await KonfluxDatabase.runMigrations(database);
                const db = new KonfluxDatabase(knex);
                const catalog = new CatalogClient({ discoveryApi: discovery });

                httpRouter.use(
                    await createRouter({
                        logger,
                        config,
                        httpAuth,
                        auth,
                        db,
                        catalog,
                    }),
                );
            },
        });
    },
});
