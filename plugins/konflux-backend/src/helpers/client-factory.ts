import type { ConfigurationOptions } from '@kubernetes/client-node';
import {
    KonfluxClusterMap,
} from '@internal/backstage-plugin-konflux-common';
import type { CustomObjectsApi, KubeConfig } from '@kubernetes/client-node';
import { StructuredLogger } from './logger';
import { getKubeClient } from './kube-client';

/**
 * Cache for CustomObjectsApi clients keyed by "cluster:apiUrl".
 * Auth headers are injected per-request via middleware, so clients are
 * safe to share across users.
 */
const clientCache = new Map<string, CustomObjectsApi>();

export const createKubeConfig = async (
    konfluxConfig: KonfluxClusterMap | undefined,
    cluster: string,
    konfluxLogger: StructuredLogger,
    useKubearchiveUrl = false,
): Promise<KubeConfig | null> => {
    try {
        if (!konfluxConfig) {
            return null;
        }

        const { KubeConfig } = await getKubeClient();
        const kubeConfig = new KubeConfig();

        const clusterConfig = konfluxConfig.clusters?.[cluster];
        if (!clusterConfig) {
            throw new Error('Cluster config not found.');
        }

        const apiUrl = useKubearchiveUrl
            ? clusterConfig.kubearchiveApiUrl
            : clusterConfig.apiUrl;

        if (!apiUrl) {
            throw new Error(
                useKubearchiveUrl
                    ? 'Cluster config missing kubearchiveApiUrl.'
                    : 'Cluster config missing apiUrl.',
            );
        }

        // Placeholder token — real auth is injected per-request via middleware
        const user = {
            name: 'backstage',
            token: 'placeholder',
        };

        const context = {
            name: cluster,
            user: user.name,
            cluster,
        };

        kubeConfig.loadFromOptions({
            clusters: [
                {
                    server: apiUrl,
                    name: cluster,
                    skipTLSVerify: false,
                },
            ],
            users: [user],
            contexts: [context],
            currentContext: context.name,
        });

        return kubeConfig;
    } catch (e) {
        konfluxLogger.error('Error creating KubeConfig', e, { cluster });
        return null;
    }
};

export const getOrCreateClient = async (
    konfluxConfig: KonfluxClusterMap | undefined,
    cluster: string,
    konfluxLogger: StructuredLogger,
    useKubearchiveUrl = false,
): Promise<CustomObjectsApi | null> => {
    if (!konfluxConfig) {
        return null;
    }

    const clusterConfig = konfluxConfig.clusters?.[cluster];
    const apiUrl = useKubearchiveUrl
        ? clusterConfig?.kubearchiveApiUrl
        : clusterConfig?.apiUrl;

    const cacheKey = `${cluster}:${apiUrl}`;
    const cached = clientCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const kc = await createKubeConfig(
        konfluxConfig,
        cluster,
        konfluxLogger,
        useKubearchiveUrl,
    );

    if (!kc) {
        return null;
    }

    const { CustomObjectsApi } = await getKubeClient();
    const client = kc.makeApiClient(CustomObjectsApi);
    clientCache.set(cacheKey, client);
    return client;
};

/**
 * Build typed request options that inject a Bearer token via the official
 * Kubernetes client header middleware helper.
 */
export async function createBearerAuthOptions(
    token: string,
): Promise<ConfigurationOptions> {
    const { setHeaderOptions } = await getKubeClient();
    return setHeaderOptions('Authorization', `Bearer ${token}`, {
        middlewareMergeStrategy: 'append',
    });
}
