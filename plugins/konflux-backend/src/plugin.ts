import {
    coreServices,
    createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

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
            },
            async init({ config, logger, httpRouter, httpAuth }) {
                httpRouter.use(
                    await createRouter({
                        logger,
                        config,
                        httpAuth,
                    }),
                );
            },
        });
    },
});
