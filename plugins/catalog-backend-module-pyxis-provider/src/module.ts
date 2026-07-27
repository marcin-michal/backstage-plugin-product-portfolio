import {
    coreServices,
    createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { PyxisEntityProvider } from './PyxisEntityProvider';

export const catalogModulePyxisProvider = createBackendModule({
    pluginId: 'catalog',
    moduleId: 'pyxis-provider',
    register(reg) {
        reg.registerInit({
            deps: {
                catalog: catalogProcessingExtensionPoint,
                scheduler: coreServices.scheduler,
                logger: coreServices.logger,
                rootConfig: coreServices.rootConfig,
            },
            async init({ catalog, scheduler, logger, rootConfig }) {
                const config = rootConfig.getConfig('catalog.providers.pyxis');

                const taskRunner = scheduler.createScheduledTaskRunner({
                    frequency: { minutes: 30 },
                    timeout: { minutes: 15 },
                });

                const providerConfig = {
                    url: config.getString('url'),
                    graphqlUrl: config.getString('graphqlUrl'),
                    certPath: config.getString('certPath'),
                    keyPath: config.getString('keyPath'),
                    caPath: config.getOptionalString('caPath'),
                };

                catalog.addEntityProvider(
                    new PyxisEntityProvider(providerConfig, logger, taskRunner),
                );

                logger.info('Pyxis entity provider registered');
            },
        });
    },
});
