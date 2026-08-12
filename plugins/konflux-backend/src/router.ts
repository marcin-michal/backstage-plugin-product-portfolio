import {
    LoggerService,
    RootConfigService,
    HttpAuthService,
} from '@backstage/backend-plugin-api';
import {
    KONFLUX_TOKENS_HEADER,
    KonfluxResourceBinding,
    ManagedProduct,
    NamespaceMapping,
    ProductConfig,
    ProductConfigWriteRequest,
    ProductDefinition,
    ProductsListResponse,
    PyxisBinding,
} from '@internal/backstage-plugin-konflux-common';
import express from 'express';
import Router from 'express-promise-router';
import {
    DEFAULT_PRODUCT_CONFIG_PATH,
    DEFAULT_PRODUCTS_PATH,
    getKonfluxConfig,
} from './helpers/config';
import { KonfluxLogger } from './helpers/logger';
import { ClusterTokens, KonfluxService } from './services/konflux-service';
import { ProductConfigStore } from './services/product-config-store';
import {
    ProductStore,
    ProductStoreConflictError,
} from './services/product-store';

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

/**
 * Build a canonical entity ref from route params.
 * Matches Backstage's `kind:namespace/name` form (kind lowercased).
 */
function entityRefFromParams(params: {
    kind: string;
    namespace: string;
    name: string;
}): string {
    return `${params.kind.toLowerCase()}:${params.namespace}/${params.name}`;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function parseKonfluxBindings(
    raw: unknown,
): KonfluxResourceBinding[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }

    const bindings: KonfluxResourceBinding[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') {
            return undefined;
        }
        const record = item as Record<string, unknown>;
        if (
            !isNonEmptyString(record.cluster) ||
            !isNonEmptyString(record.namespace) ||
            !isNonEmptyString(record.application)
        ) {
            return undefined;
        }

        const binding: KonfluxResourceBinding = {
            cluster: record.cluster.trim(),
            namespace: record.namespace.trim(),
            application: record.application.trim(),
        };

        if (record.snapshot && typeof record.snapshot === 'object') {
            const snapshot = record.snapshot as Record<string, unknown>;
            if (!isNonEmptyString(snapshot.fetchedAt)) {
                return undefined;
            }
            binding.snapshot = {
                fetchedAt: snapshot.fetchedAt,
                displayName: isNonEmptyString(snapshot.displayName)
                    ? snapshot.displayName
                    : undefined,
                creationTimestamp: isNonEmptyString(snapshot.creationTimestamp)
                    ? snapshot.creationTimestamp
                    : undefined,
                componentCount:
                    typeof snapshot.componentCount === 'number'
                        ? snapshot.componentCount
                        : undefined,
            };
        }

        bindings.push(binding);
    }

    return bindings;
}

function parsePyxisBindings(raw: unknown): PyxisBinding[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }

    const bindings: PyxisBinding[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') {
            return undefined;
        }
        const record = item as Record<string, unknown>;
        if (!isNonEmptyString(record.entityRef)) {
            return undefined;
        }
        bindings.push({
            entityRef: record.entityRef.trim(),
            label: isNonEmptyString(record.label)
                ? record.label.trim()
                : undefined,
        });
    }

    return bindings;
}

function parseWriteBody(
    body: unknown,
): ProductConfigWriteRequest | { error: string } {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'Request body must be a JSON object' };
    }

    const record = body as Record<string, unknown>;
    const konfluxBindings = parseKonfluxBindings(record.konfluxBindings);
    if (!konfluxBindings) {
        return {
            error: 'konfluxBindings must be an array of { cluster, namespace, application }',
        };
    }

    const pyxisBindings = parsePyxisBindings(record.pyxisBindings);
    if (!pyxisBindings) {
        return {
            error: 'pyxisBindings must be an array of { entityRef, label? }',
        };
    }

    return { konfluxBindings, pyxisBindings };
}

/** Backstage entity name: lowercase alphanumeric with internal hyphens. */
const ENTITY_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function parseCreateProductBody(
    body: unknown,
):
    | {
          name: string;
          namespace: string;
          title?: string;
          description?: string;
          owner: string;
      }
    | { error: string } {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'Request body must be a JSON object' };
    }

    const record = body as Record<string, unknown>;
    const name =
        typeof record.name === 'string' ? record.name.trim().toLowerCase() : '';
    if (!name || !ENTITY_NAME_PATTERN.test(name)) {
        return {
            error:
                'name is required and must be a lowercase Backstage entity name (e.g. my-product)',
        };
    }

    const namespace =
        typeof record.namespace === 'string' && record.namespace.trim()
            ? record.namespace.trim().toLowerCase()
            : 'default';
    if (!ENTITY_NAME_PATTERN.test(namespace)) {
        return { error: 'namespace must be a valid Backstage entity namespace' };
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

/** @public */
export async function createRouter(
    options: RouterOptions,
): Promise<express.Router> {
    const { logger, config, httpAuth } = options;
    const router = Router();
    const konfluxLogger = new KonfluxLogger(logger);
    const service = KonfluxService.fromConfig(config, logger);

    const parsedConfig = getKonfluxConfig(config, konfluxLogger);
    const productConfigPath =
        parsedConfig?.productConfigPath ?? DEFAULT_PRODUCT_CONFIG_PATH;
    const productsPath = parsedConfig?.productsPath ?? DEFAULT_PRODUCTS_PATH;
    const productConfigStore = new ProductConfigStore(
        productConfigPath,
        logger,
    );
    const productStore = new ProductStore(productsPath, logger);

    konfluxLogger.info('Product config store ready', {
        path: productConfigStore.path,
    });
    konfluxLogger.info('Product definitions store ready', {
        path: productStore.path,
    });

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
     * Browse ALL Konflux Applications the user can see (resource picker).
     * Requires X-Konflux-Tokens header.
     * Query: cluster, namespace, search
     */
    router.get('/browse/applications', async (req, res) => {
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

            konfluxLogger.info('Browse applications', {
                itemCount: result.data.length,
                clusterErrorCount: result.clusterErrors?.length ?? 0,
            });

            res.json(result);
        } catch (error) {
            konfluxLogger.error('Error browsing applications', error);
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

    router.get('/product-config/:kind/:namespace/:name', async (req, res) => {
        await httpAuth.credentials(req, { allow: ['user'] });
        const entityRef = entityRefFromParams(req.params);
        const stored = await productConfigStore.get(entityRef);

        if (!stored) {
            res.status(404).json({
                error: 'Product config not found',
                entityRef,
            });
            return;
        }

        res.json(stored);
    });

    router.put('/product-config/:kind/:namespace/:name', async (req, res) => {
        const credentials = await httpAuth.credentials(req, {
            allow: ['user'],
        });
        const entityRef = entityRefFromParams(req.params);
        const parsed = parseWriteBody(req.body);

        if ('error' in parsed) {
            res.status(400).json({ error: parsed.error });
            return;
        }

        const updatedBy =
            credentials.principal.type === 'user'
                ? credentials.principal.userEntityRef
                : undefined;

        const productConfig: ProductConfig = {
            entityRef,
            updatedAt: new Date().toISOString(),
            updatedBy,
            konfluxBindings: parsed.konfluxBindings,
            pyxisBindings: parsed.pyxisBindings,
        };

        await productConfigStore.set(entityRef, productConfig);
        res.json(productConfig);
    });

    router.delete(
        '/product-config/:kind/:namespace/:name',
        async (req, res) => {
            await httpAuth.credentials(req, { allow: ['user'] });
            const entityRef = entityRefFromParams(req.params);
            const deleted = await productConfigStore.delete(entityRef);

            if (!deleted) {
                res.status(404).json({
                    error: 'Product config not found',
                    entityRef,
                });
                return;
            }

            res.status(204).send();
        },
    );

    /**
     * List user-created product definitions (Systems managed by this plugin).
     * Also includes composition status from the product-config store.
     */
    router.get('/products', async (req, res) => {
        await httpAuth.credentials(req, { allow: ['user'] });
        const products = await productStore.list();
        const composedEntityRefs = await productConfigStore.listComposedRefs();
        const composedSet = new Set(composedEntityRefs);

        const response: ProductsListResponse = {
            products: products.map(
                (product): ManagedProduct => ({
                    ...product,
                    composed: composedSet.has(product.entityRef),
                }),
            ),
            composedEntityRefs,
        };
        res.json(response);
    });

    /**
     * Create a new product System definition.
     * The catalog ProductEntityProvider picks it up from the shared JSON file.
     */
    router.post('/products', async (req, res) => {
        const credentials = await httpAuth.credentials(req, {
            allow: ['user'],
        });
        const parsed = parseCreateProductBody(req.body);
        if ('error' in parsed) {
            res.status(400).json({ error: parsed.error });
            return;
        }

        const createdBy =
            credentials.principal.type === 'user'
                ? credentials.principal.userEntityRef
                : undefined;

        const product: ProductDefinition = {
            entityRef: `system:${parsed.namespace}/${parsed.name}`,
            name: parsed.name,
            namespace: parsed.namespace,
            title: parsed.title,
            description: parsed.description,
            owner: parsed.owner,
            createdAt: new Date().toISOString(),
            createdBy,
        };

        try {
            const created = await productStore.create(product);
            res.status(201).json(created);
        } catch (error) {
            if (error instanceof ProductStoreConflictError) {
                res.status(409).json({ error: error.message });
                return;
            }
            throw error;
        }
    });

    return router;
}
