import {
    coreServices,
    createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { KonfluxEntityProvider } from './KonfluxEntityProvider';
import { KonfluxClusterProviderConfig } from './types';

export const catalogModuleKonfluxProvider = createBackendModule({
    pluginId: 'catalog',
    moduleId: 'konflux-provider',
    register(reg) {
        reg.registerInit({
            deps: {
                catalog: catalogProcessingExtensionPoint,
                scheduler: coreServices.scheduler,
                logger: coreServices.logger,
                rootConfig: coreServices.rootConfig,
            },
            async init({ catalog, scheduler, logger, rootConfig }) {
                const clustersConfig = rootConfig.getOptionalConfig(
                    'konflux.clusters',
                );
                if (!clustersConfig) {
                    logger.warn(
                        'No konflux.clusters config found; ' +
                            'KonfluxEntityProvider will not start',
                    );
                    return;
                }

                const clusters: KonfluxClusterProviderConfig[] = [];

                for (const clusterId of clustersConfig.keys()) {
                    const cc = clustersConfig.getConfig(clusterId);
                    const apiUrl = cc.getOptionalString('apiUrl');
                    const serviceToken = cc.getOptionalString('serviceToken');

                    if (!apiUrl || !serviceToken) {
                        logger.info(
                            `Skipping cluster ${clusterId}: missing apiUrl or serviceToken`,
                        );
                        continue;
                    }

                    clusters.push({
                        clusterId,
                        apiUrl: apiUrl.replace(/\/+$/, ''),
                        serviceToken,
                        managedNamespaces:
                            cc.getOptionalStringArray('managedNamespaces') ??
                            [],
                    });
                }

                if (clusters.length === 0) {
                    logger.warn(
                        'No clusters with serviceToken configured; ' +
                            'KonfluxEntityProvider will not start',
                    );
                    return;
                }

                const taskRunner = scheduler.createScheduledTaskRunner({
                    frequency: { minutes: 30 },
                    timeout: { minutes: 15 },
                    initialDelay: { seconds: 15 },
                });

                catalog.addEntityProvider(
                    new KonfluxEntityProvider(clusters, logger, taskRunner),
                );

                logger.info(
                    `KonfluxEntityProvider registered for ${clusters.length} cluster(s)`,
                    { clusterIds: clusters.map(c => c.clusterId) },
                );
            },
        });
    },
});
