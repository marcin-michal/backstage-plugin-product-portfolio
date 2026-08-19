import {
    LoggerService,
    RootConfigService,
    HttpAuthService,
    AuthService,
} from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { stringifyEntityRef } from '@backstage/catalog-model';
import {
    ConflictError,
    InputError,
    NotAllowedError,
    NotFoundError,
} from '@backstage/errors';
import {
    CreateProductRequest,
    KONFLUX_TOKENS_HEADER,
    NamespaceMapping,
} from '@internal/backstage-plugin-konflux-common';
import express from 'express';
import Router from 'express-promise-router';
import { KonfluxDatabase } from './services/database';
import { KonfluxLogger } from './helpers/logger';
import { ClusterTokens, KonfluxService } from './services/konflux-service';
import { ProductService } from './services/product-service';

/** @public */
export interface RouterOptions {
    logger: LoggerService;
    config: RootConfigService;
    httpAuth: HttpAuthService;
    auth: AuthService;
    db: KonfluxDatabase;
    catalog: CatalogClient;
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
    if (typeof raw !== 'string') return undefined;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return undefined;
        const mappings = parsed.filter(
            (item): item is NamespaceMapping =>
                !!item &&
                typeof item === 'object' &&
                typeof (item as NamespaceMapping).cluster === 'string' &&
                typeof (item as NamespaceMapping).namespace === 'string',
        );
        return mappings.length > 0 ? mappings : undefined;
    } catch {
        return undefined;
    }
}

function productEntityRef(namespace: string, name: string): string {
    return stringifyEntityRef({ kind: 'System', namespace, name });
}

function sendServiceError(res: express.Response, error: unknown): boolean {
    if (error instanceof InputError) {
        res.status(400).json({ error: error.message });
        return true;
    }
    if (error instanceof NotFoundError) {
        res.status(404).json({ error: error.message });
        return true;
    }
    if (error instanceof ConflictError) {
        res.status(409).json({ error: error.message });
        return true;
    }
    if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
        return true;
    }
    return false;
}

/** Backstage entity name: lowercase alphanumeric with internal hyphens. */
const ENTITY_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function parseCreateProductBody(
    body: unknown,
): CreateProductRequest | { error: string } {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'Request body must be a JSON object' };
    }

    const record = body as Record<string, unknown>;
    const name =
        typeof record.name === 'string' ? record.name.trim().toLowerCase() : '';
    if (!name || !ENTITY_NAME_PATTERN.test(name)) {
        return {
            error: 'name is required and must be a lowercase Backstage entity name (e.g. my-product)',
        };
    }

    const namespace =
        typeof record.namespace === 'string' && record.namespace.trim()
            ? record.namespace.trim().toLowerCase()
            : 'default';
    if (!ENTITY_NAME_PATTERN.test(namespace)) {
        return {
            error: 'namespace must be a valid Backstage entity namespace',
        };
    }

    const owner =
        typeof record.owner === 'string' && record.owner.trim()
            ? record.owner.trim()
            : 'group:default/guests';

    return {
        name,
        namespace,
        title:
            typeof record.title === 'string' && record.title.trim()
                ? record.title.trim()
                : undefined,
        description:
            typeof record.description === 'string' && record.description.trim()
                ? record.description.trim()
                : undefined,
        owner,
    };
}

function parsePinBody(body: unknown): { pinned: boolean } | { error: string } {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'Request body must be a JSON object' };
    }
    const pinned = (body as Record<string, unknown>).pinned;
    if (typeof pinned !== 'boolean') {
        return { error: 'pinned must be a boolean' };
    }
    return { pinned };
}

function parseOverrideBody(
    body: unknown,
): { overrideType: string; resourceKey: string } | { error: string } {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'Request body must be a JSON object' };
    }
    const record = body as Record<string, unknown>;
    if (
        typeof record.overrideType !== 'string' ||
        !record.overrideType.trim()
    ) {
        return { error: 'overrideType is required' };
    }
    if (typeof record.resourceKey !== 'string' || !record.resourceKey.trim()) {
        return { error: 'resourceKey is required' };
    }
    return {
        overrideType: record.overrideType.trim(),
        resourceKey: record.resourceKey.trim(),
    };
}

/** @public */
export async function createRouter(
    options: RouterOptions,
): Promise<express.Router> {
    const { logger, config, httpAuth, auth, db, catalog } = options;
    const router = Router();
    const konfluxLogger = new KonfluxLogger(logger);
    const productService = new ProductService(db, catalog, auth, logger);
    const konfluxService = KonfluxService.fromConfig(config, logger);

    router.use(express.json());

    const getUserRef = async (req: express.Request): Promise<string> => {
        const credentials = await httpAuth.credentials(req, {
            allow: ['user'],
        });
        return credentials.principal.type === 'user'
            ? credentials.principal.userEntityRef
            : 'user:default/guest';
    };

    router.get('/products', async (req, res) => {
        const userEntityRef = await getUserRef(req);
        const pinned =
            typeof req.query.pinned === 'string'
                ? req.query.pinned === 'true'
                : undefined;
        const search =
            typeof req.query.search === 'string' ? req.query.search : undefined;

        const result = await productService.listProducts(userEntityRef, {
            pinned,
            search,
        });
        res.json(result);
    });

    router.post('/products', async (req, res) => {
        const userEntityRef = await getUserRef(req);
        const parsed = parseCreateProductBody(req.body);
        if ('error' in parsed) {
            res.status(400).json({ error: parsed.error });
            return;
        }

        try {
            const created = await productService.createProduct(
                parsed,
                userEntityRef,
            );
            res.status(201).json(created);
        } catch (error) {
            if (!sendServiceError(res, error)) {
                throw error;
            }
        }
    });

    router.delete('/products/:namespace/:name', async (req, res) => {
        await getUserRef(req);
        const entityRef = productEntityRef(
            req.params.namespace,
            req.params.name,
        );
        try {
            await productService.deleteProduct(entityRef);
            res.status(204).send();
        } catch (error) {
            if (!sendServiceError(res, error)) {
                throw error;
            }
        }
    });

    router.get('/products/:namespace/:name/composition', async (req, res) => {
        await getUserRef(req);
        const entityRef = productEntityRef(
            req.params.namespace,
            req.params.name,
        );
        try {
            const composition = await productService.getComposition(entityRef);
            res.json(composition);
        } catch (error) {
            if (!sendServiceError(res, error)) {
                throw error;
            }
        }
    });

    router.put('/products/:namespace/:name/pin', async (req, res) => {
        const userEntityRef = await getUserRef(req);
        const parsed = parsePinBody(req.body);
        if ('error' in parsed) {
            res.status(400).json({ error: parsed.error });
            return;
        }

        const entityRef = productEntityRef(
            req.params.namespace,
            req.params.name,
        );
        try {
            await productService.togglePin(
                userEntityRef,
                entityRef,
                parsed.pinned,
            );
            res.json({ pinned: parsed.pinned });
        } catch (error) {
            if (!sendServiceError(res, error)) {
                throw error;
            }
        }
    });

    router.get('/pinned', async (req, res) => {
        const userEntityRef = await getUserRef(req);
        const entityRefs = await productService.listPinnedRefs(userEntityRef);
        res.json({ entityRefs });
    });

    router.post('/products/:namespace/:name/overrides', async (req, res) => {
        const userEntityRef = await getUserRef(req);
        const parsed = parseOverrideBody(req.body);
        if ('error' in parsed) {
            res.status(400).json({ error: parsed.error });
            return;
        }

        const entityRef = productEntityRef(
            req.params.namespace,
            req.params.name,
        );
        try {
            const override = await productService.addOverride(
                entityRef,
                parsed.overrideType,
                parsed.resourceKey,
                userEntityRef,
            );
            res.status(201).json(override);
        } catch (error) {
            if (!sendServiceError(res, error)) {
                throw error;
            }
        }
    });

    router.get('/products/:namespace/:name/overrides', async (req, res) => {
        await getUserRef(req);
        const entityRef = productEntityRef(
            req.params.namespace,
            req.params.name,
        );
        const overrides = await productService.listOverrides(entityRef);
        res.json({ overrides });
    });

    router.delete('/overrides/:id', async (req, res) => {
        await getUserRef(req);
        try {
            await productService.removeOverride(req.params.id);
            res.status(204).send();
        } catch (error) {
            if (!sendServiceError(res, error)) {
                throw error;
            }
        }
    });

    router.get('/unmatched', async (req, res) => {
        await getUserRef(req);
        const unmatched = await productService.listUnmatched();
        res.json({ unmatched });
    });

    router.get('/sync/status', async (req, res) => {
        await getUserRef(req);
        const status = await productService.getSyncStatus();
        res.json(status);
    });

    // ---- Token-based resource fetching (KonfluxService) ----

    /**
     * List configured clusters (public info only — no tokens required).
     */
    router.get('/clusters', async (req, res) => {
        await httpAuth.credentials(req, { allow: ['user'] });
        res.json({ clusters: konfluxService.listClusters() });
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
                missingClusters: konfluxService.listClusters().map(c => c.id),
            });
            return;
        }

        const result = await konfluxService.listProjects(tokens);

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
                missingClusters: konfluxService.listClusters().map(c => c.id),
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
            const result = await konfluxService.fetchResources({
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
