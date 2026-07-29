import {
    LoggerService,
    RootConfigService,
    HttpAuthService,
} from '@backstage/backend-plugin-api';
import {
    KONFLUX_TOKENS_HEADER,
    NamespaceMapping,
    parseNamespaceMappings,
} from '@internal/backstage-plugin-konflux-common';
import express from 'express';
import Router from 'express-promise-router';
import {
    ClusterTokens,
    KonfluxService,
} from './services/konflux-service';
import { KonfluxLogger } from './helpers/logger';

/** @public */
export interface RouterOptions {
    logger: LoggerService;
    config: RootConfigService;
    httpAuth: HttpAuthService;
}

/**
 * Parse the X-Konflux-Tokens header (JSON map of clusterId -> token).
 */
function parseTokensHeader(req: express.Request): ClusterTokens {
    const raw = req.headers[KONFLUX_TOKENS_HEADER];
    if (!raw || typeof raw !== 'string') {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const tokens: ClusterTokens = {};
            for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === 'string' && value.trim()) {
                    tokens[key] = value.trim();
                }
            }
            return tokens;
        }
    } catch {
        // fall through
    }
    return {};
}

function parseNamespacesQuery(raw: unknown): NamespaceMapping[] | undefined {
    return typeof raw === 'string' ? parseNamespaceMappings(raw) : undefined;
}

/** @public */
export async function createRouter(
    options: RouterOptions,
): Promise<express.Router> {
    const { logger, config, httpAuth } = options;
    const router = Router();
    const konfluxLogger = new KonfluxLogger(logger);
    const service = KonfluxService.fromConfig(config, logger);

    router.use(express.json());

    /**
     * List configured clusters (public info only — no tokens required).
     */
    router.get('/clusters', async (req, res) => {
        await httpAuth.credentials(req, { allow: ['user'] });
        res.json({ clusters: service.listClusters() });
    });

    /**
     * List OpenShift projects across authenticated clusters.
     * Requires X-Konflux-Tokens header.
     */
    router.get('/projects', async (req, res) => {
        await httpAuth.credentials(req, { allow: ['user'] });
        const tokens = parseTokensHeader(req);

        if (Object.keys(tokens).length === 0) {
            res.status(401).json({
                error: 'Missing cluster tokens',
                hint: `Provide per-cluster tokens in the ${KONFLUX_TOKENS_HEADER} header`,
                missingClusters: service.listClusters().map(c => c.id),
            });
            return;
        }

        const result = await service.listProjects(tokens);

        // Surface 401s so the frontend can prompt re-auth
        const unauthorized = (result.clusterErrors ?? []).filter(
            e => e.statusCode === 401 || e.errorType === 'unauthorized',
        );
        if (
            unauthorized.length > 0 &&
            Object.keys(result.projects).length === 0
        ) {
            res.status(401).json({
                error: 'Token expired or invalid',
                missingClusters: unauthorized.map(e => e.cluster),
                clusterErrors: result.clusterErrors,
            });
            return;
        }

        res.json(result);
    });

    /**
     * Fetch Applications or Components.
     * Query: namespace, cluster, limit, continue, search, namespaces (JSON mappings)
     */
    router.get('/resources/:resourceType', async (req, res) => {
        await httpAuth.credentials(req, { allow: ['user'] });
        const { resourceType } = req.params;
        const tokens = parseTokensHeader(req);

        if (Object.keys(tokens).length === 0) {
            res.status(401).json({
                error: 'Missing cluster tokens',
                hint: `Provide per-cluster tokens in the ${KONFLUX_TOKENS_HEADER} header`,
                missingClusters: service.listClusters().map(c => c.id),
            });
            return;
        }

        const {
            namespace,
            cluster,
            limit,
            continue: continueToken,
            search,
            namespaces,
        } = req.query;

        try {
            const result = await service.fetchResources({
                resourceType,
                tokens,
                cluster: typeof cluster === 'string' ? cluster : undefined,
                namespace:
                    typeof namespace === 'string' ? namespace : undefined,
                search: typeof search === 'string' ? search : undefined,
                limit:
                    typeof limit === 'string'
                        ? Number.parseInt(limit, 10)
                        : undefined,
                continue:
                    typeof continueToken === 'string'
                        ? continueToken
                        : undefined,
                namespaceMappings: parseNamespacesQuery(namespaces),
            });

            const unauthorized = (result.clusterErrors ?? []).filter(
                e => e.statusCode === 401 || e.errorType === 'unauthorized',
            );
            if (unauthorized.length > 0 && result.data.length === 0) {
                res.status(401).json({
                    error: 'Token expired or invalid',
                    missingClusters: unauthorized.map(e => e.cluster),
                    clusterErrors: result.clusterErrors,
                });
                return;
            }

            konfluxLogger.info('Resources fetched', {
                resource: resourceType,
                itemCount: result.data.length,
                clusterErrorCount: result.clusterErrors?.length ?? 0,
            });

            res.json(result);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            if (message.includes('Invalid resource type')) {
                res.status(400).json({ error: message });
                return;
            }

            konfluxLogger.error('Error fetching resources', error, {
                resource: resourceType,
            });
            res.status(500).json({ error: 'Failed to fetch resources' });
        }
    });

    return router;
}
