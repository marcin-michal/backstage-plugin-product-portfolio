import { HttpAuthService } from '@backstage/backend-plugin-api';
import { KONFLUX_TOKENS_HEADER } from '@internal/backstage-plugin-konflux-common';
import express from 'express';
import Router from 'express-promise-router';
import { StructuredLogger } from '../helpers/logger';
import { KonfluxService } from '../services/konflux-service';
import { parseNamespacesQuery, parseTokensHeader } from './parsers';

export interface KonfluxResourcesRouterOptions {
    logger: StructuredLogger;
    httpAuth: HttpAuthService;
    service: KonfluxService;
}

export function createKonfluxResourcesRouter(
    options: KonfluxResourcesRouterOptions,
): express.Router {
    const { logger, httpAuth, service } = options;
    const router = Router();

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
        const tokens = parseTokensHeader(req.headers);

        if (Object.keys(tokens).length === 0) {
            res.status(401).json({
                error: 'Missing cluster tokens',
                hint: `Provide per-cluster tokens in the ${KONFLUX_TOKENS_HEADER} header`,
                missingClusters: service.listClusters().map(c => c.id),
            });
            return;
        }

        const result = await service.listProjects(tokens);

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
     * Browse ALL Konflux Applications the user can see (resource picker).
     * Requires X-Konflux-Tokens header.
     * Query: cluster, namespace, search, limit, continue
     */
    router.get('/browse/applications', async (req, res) => {
        await httpAuth.credentials(req, { allow: ['user'] });
        const tokens = parseTokensHeader(req.headers);

        if (Object.keys(tokens).length === 0) {
            res.status(401).json({
                error: 'Missing cluster tokens',
                hint: `Provide per-cluster tokens in the ${KONFLUX_TOKENS_HEADER} header`,
                missingClusters: service.listClusters().map(c => c.id),
            });
            return;
        }

        const {
            cluster,
            namespace,
            search,
            limit,
            continue: continueToken,
        } = req.query;

        if (typeof namespace !== 'string' || !namespace.trim()) {
            res.status(400).json({
                error: 'namespace query parameter is required',
                hint: 'Select a tenant namespace before browsing applications. Listing every tenant namespace is not supported.',
            });
            return;
        }

        try {
            const result = await service.fetchResources({
                resourceType: 'applications',
                tokens,
                cluster: typeof cluster === 'string' ? cluster : undefined,
                namespace: namespace.trim(),
                search: typeof search === 'string' ? search : undefined,
                limit:
                    typeof limit === 'string'
                        ? Number.parseInt(limit, 10)
                        : undefined,
                continue:
                    typeof continueToken === 'string'
                        ? continueToken
                        : undefined,
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

            logger.info('Browse applications', {
                itemCount: result.data.length,
                clusterErrorCount: result.clusterErrors?.length ?? 0,
            });

            res.json(result);
        } catch (error) {
            logger.error('Error browsing applications', error);
            res.status(500).json({ error: 'Failed to browse applications' });
        }
    });

    /**
     * Fetch Applications or Components.
     * Query: namespace, cluster, limit, continue, search, namespaces (JSON mappings)
     */
    router.get('/resources/:resourceType', async (req, res) => {
        await httpAuth.credentials(req, { allow: ['user'] });
        const { resourceType } = req.params;
        const tokens = parseTokensHeader(req.headers);

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

            logger.info('Resources fetched', {
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

            logger.error('Error fetching resources', error, {
                resource: resourceType,
            });
            res.status(500).json({ error: 'Failed to fetch resources' });
        }
    });

    return router;
}
