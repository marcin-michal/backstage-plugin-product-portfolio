import {
    KonfluxClusterConfig,
    KonfluxConfig,
} from '@internal/backstage-plugin-konflux-common';
import { Config } from '@backstage/config';
import { KonfluxLogger } from './logger';

/**
 * Parse konflux config from app-config.yaml.
 */
export function getKonfluxConfig(
    config: Config,
    logger: KonfluxLogger,
): KonfluxConfig | undefined {
    try {
        const konfluxConfig = config.getOptionalConfig('konflux');
        if (!konfluxConfig) {
            return undefined;
        }

        const clustersConfig = konfluxConfig.getOptionalConfig('clusters');
        if (!clustersConfig) {
            return { clusters: {} };
        }

        const clusters: Record<string, KonfluxClusterConfig> = {};
        for (const clusterId of clustersConfig.keys()) {
            const cluster = clustersConfig.getConfig(clusterId);
            const managedNs =
                cluster.getOptionalStringArray('managedNamespaces');
            clusters[clusterId] = {
                name: cluster.getOptionalString('name') ?? clusterId,
                apiUrl: normalizeUrl(cluster.getOptionalString('apiUrl')),
                consoleUrl: normalizeUrl(
                    cluster.getOptionalString('consoleUrl'),
                ),
                uiUrl: normalizeUrl(cluster.getOptionalString('uiUrl')),
                kubearchiveApiUrl: normalizeUrl(
                    cluster.getOptionalString('kubearchiveApiUrl'),
                ),
                serviceToken: cluster.getOptionalString('serviceToken'),
                managedNamespaces: managedNs ?? [],
            };
        }

        return { clusters };
    } catch (error) {
        logger.error('Error parsing Konflux configuration', error);
        return undefined;
    }
}

/** Strip trailing slashes so K8s client paths do not become `//apis/...`. */
function normalizeUrl(url: string | undefined): string | undefined {
    if (!url) {
        return undefined;
    }
    return url.replace(/\/+$/, '');
}
