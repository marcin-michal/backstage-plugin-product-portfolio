import {
    KonfluxClusterConfig,
    KonfluxClusterMap,
    ProductStoreConfig,
} from '@internal/backstage-plugin-konflux-common';
import { Config } from '@backstage/config';
import { StructuredLogger } from './logger';

export interface ParsedKonfluxConfig extends KonfluxClusterMap, ProductStoreConfig {}

/**
 * Parse konflux config from app-config.yaml.
 *
 * Returns an object that satisfies both KonfluxClusterMap (for the Konflux
 * K8s service) and ProductStoreConfig (for the product/product-config stores).
 * Callers that only need cluster info should type the result as KonfluxClusterMap;
 * callers that only need file paths should type it as ProductStoreConfig.
 */
export function getKonfluxConfig(
    config: Config,
    logger: StructuredLogger,
): ParsedKonfluxConfig | undefined {
    try {
        const konfluxConfig = config.getOptionalConfig('konflux');
        if (!konfluxConfig) {
            return undefined;
        }

        const productConfigPath =
            konfluxConfig.getOptionalString('productConfigPath') ??
            undefined;
        const productsPath =
            konfluxConfig.getOptionalString('productsPath') ??
            undefined;

        const clustersConfig = konfluxConfig.getOptionalConfig('clusters');
        if (!clustersConfig) {
            return { clusters: {}, productConfigPath, productsPath };
        }

        const clusters: Record<string, KonfluxClusterConfig> = {};
        for (const clusterId of clustersConfig.keys()) {
            const cluster = clustersConfig.getConfig(clusterId);
            clusters[clusterId] = {
                name: cluster.getOptionalString('name') ?? clusterId,
                apiUrl: normalizeUrl(cluster.getOptionalString('apiUrl')),
                consoleUrl: normalizeUrl(
                    cluster.getOptionalString('consoleUrl'),
                ),
                kubearchiveApiUrl: normalizeUrl(
                    cluster.getOptionalString('kubearchiveApiUrl'),
                ),
            };
        }

        return { clusters, productConfigPath, productsPath };
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
