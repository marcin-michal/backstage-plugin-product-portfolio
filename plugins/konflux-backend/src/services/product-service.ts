import { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import {
    ConflictError,
    InputError,
    NotAllowedError,
    NotFoundError,
} from '@backstage/errors';
import {
    CreateProductRequest,
    KonfluxAppSummary,
    KonfluxComponentSummary,
    ManualOverrideItem,
    ManualOverrideType,
    ProductComposition,
    ProductDefinition,
    ProductListItem,
    ProductsListResponse,
    PyxisListingSummary,
    PyxisRepositorySummary,
    SyncStatus,
    UnmatchedApp,
} from '@internal/backstage-plugin-konflux-common';
import { KonfluxLogger } from '../helpers/logger';
import {
    KonfluxDatabase,
    ManualOverrideRow,
    ProductSystemRow,
} from './database';

const SOURCE_ANNOTATION = 'redhat.com/product-matching-source';
const PYXIS_LISTING_ANNOTATION = 'redhat.com/pyxis-product-listing';
const HAS_KONFLUX_MATCH_ANNOTATION = 'redhat.com/has-konflux-match';
const KONFLUX_CLUSTER_ANNOTATION = 'redhat.com/konflux-cluster';
const KONFLUX_NAMESPACE_ANNOTATION = 'redhat.com/konflux-namespace';
const KONFLUX_APPLICATION_ANNOTATION = 'redhat.com/konflux-application';
const KONFLUX_COMPONENT_ANNOTATION = 'redhat.com/konflux-component';
const KONFLUX_COMPONENT_COUNT_ANNOTATION = 'redhat.com/konflux-component-count';
const PYXIS_ID_ANNOTATION = 'redhat.com/pyxis-id';
const PYXIS_REPOSITORY_ANNOTATION = 'redhat.com/repository';

const OVERRIDE_TYPES = new Set<ManualOverrideType>([
    'add_konflux',
    'remove_konflux',
    'add_pyxis',
    'remove_pyxis',
]);

const KONFLUX_APP_TYPE = 'konflux-application';
const KONFLUX_COMPONENT_TYPE = 'konflux-component';
const PYXIS_LISTING_TYPE = 'product-listing';
const PYXIS_REPO_TYPE = 'container-repository';

export interface ListProductsOptions {
    pinned?: boolean;
    search?: string;
}

function specType(entity: Entity): string | undefined {
    return (entity.spec as Record<string, unknown> | undefined)?.type as
        | string
        | undefined;
}

function specOwner(entity: Entity): string {
    const owner = (entity.spec as Record<string, unknown> | undefined)?.owner;
    return typeof owner === 'string' && owner.trim()
        ? owner
        : 'group:default/unknown';
}

function specSubcomponentOf(entity: Entity): string {
    const value = (entity.spec as Record<string, unknown> | undefined)
        ?.subcomponentOf;
    return typeof value === 'string' ? value : '';
}

function specDependsOn(entity: Entity): string[] {
    const value = (entity.spec as Record<string, unknown> | undefined)
        ?.dependsOn;
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
}

function matchingSource(annotationValue: string): 'auto_discovered' | 'manual' {
    return annotationValue === 'manual' ? 'manual' : 'auto_discovered';
}

function compositionSource(
    annotationValue: string,
    dbSource?: ProductSystemRow['source'],
): 'auto' | 'manual' {
    if (annotationValue === 'manual' || dbSource === 'manual') {
        return 'manual';
    }
    return 'auto';
}

function annotation(entity: Entity, key: string): string {
    return entity.metadata.annotations?.[key] ?? '';
}

function toManualOverrideItem(row: ManualOverrideRow): ManualOverrideItem {
    return {
        id: row.id,
        overrideType: row.override_type,
        resourceKey: row.resource_key,
        createdBy: row.created_by ?? undefined,
        createdAt: row.created_at,
    };
}

function toProductDefinition(row: ProductSystemRow): ProductDefinition {
    return {
        entityRef: row.entity_ref,
        name: row.name,
        namespace: row.namespace,
        title: row.title ?? undefined,
        description: row.description ?? undefined,
        owner: row.owner,
        createdAt: row.created_at,
        createdBy: row.created_by ?? undefined,
    };
}

function toKonfluxAppSummary(
    entity: Entity,
    matchSource: 'auto' | 'manual',
): KonfluxAppSummary {
    const countRaw = annotation(entity, KONFLUX_COMPONENT_COUNT_ANNOTATION);
    const componentCount = Number.parseInt(countRaw, 10);
    return {
        entityRef: stringifyEntityRef(entity),
        name: entity.metadata.name,
        title: entity.metadata.title,
        cluster: annotation(entity, KONFLUX_CLUSTER_ANNOTATION),
        namespace: annotation(entity, KONFLUX_NAMESPACE_ANNOTATION),
        applicationName: annotation(entity, KONFLUX_APPLICATION_ANNOTATION),
        componentCount: Number.isFinite(componentCount) ? componentCount : 0,
        matchSource,
    };
}

function toPyxisListingSummary(
    entity: Entity,
    matchSource: 'auto' | 'manual',
): PyxisListingSummary {
    const pyxisId = annotation(entity, PYXIS_ID_ANNOTATION);
    return {
        entityRef: stringifyEntityRef(entity),
        name: entity.metadata.name,
        title: entity.metadata.title,
        pyxisId: pyxisId || undefined,
        matchSource,
    };
}

function toUnmatchedApp(entity: Entity): UnmatchedApp {
    return {
        entityRef: stringifyEntityRef(entity),
        name: entity.metadata.name,
        title: entity.metadata.title,
        cluster: annotation(entity, KONFLUX_CLUSTER_ANNOTATION),
        namespace: annotation(entity, KONFLUX_NAMESPACE_ANNOTATION),
        applicationName: annotation(entity, KONFLUX_APPLICATION_ANNOTATION),
    };
}

function toKonfluxComponentSummary(
    entity: Entity,
    parentApp: KonfluxAppSummary,
): KonfluxComponentSummary {
    const componentName =
        annotation(entity, KONFLUX_COMPONENT_ANNOTATION) ||
        entity.metadata.title ||
        entity.metadata.name;
    return {
        name: componentName,
        entityRef: stringifyEntityRef(entity),
        applicationEntityRef: parentApp.entityRef,
        cluster: annotation(entity, KONFLUX_CLUSTER_ANNOTATION),
        namespace: annotation(entity, KONFLUX_NAMESPACE_ANNOTATION),
        applicationName: parentApp.applicationName,
        matchSource: parentApp.matchSource,
    };
}

function findParentApp(
    entity: Entity,
    apps: KonfluxAppSummary[],
): KonfluxAppSummary | undefined {
    const subOf = specSubcomponentOf(entity);
    const cluster = annotation(entity, KONFLUX_CLUSTER_ANNOTATION);
    const namespace = annotation(entity, KONFLUX_NAMESPACE_ANNOTATION);
    const applicationName = annotation(entity, KONFLUX_APPLICATION_ANNOTATION);
    return apps.find(
        app =>
            app.entityRef === subOf ||
            (app.applicationName === applicationName &&
                app.namespace === namespace &&
                app.cluster === cluster),
    );
}

function catalogProductToListItem(
    entity: Entity,
    pinned: boolean,
): ProductListItem {
    const pyxisListing = annotation(entity, PYXIS_LISTING_ANNOTATION);
    return {
        entityRef: stringifyEntityRef(entity),
        name: entity.metadata.name,
        namespace: entity.metadata.namespace ?? 'default',
        title: entity.metadata.title,
        description: entity.metadata.description,
        owner: specOwner(entity),
        source: matchingSource(annotation(entity, SOURCE_ANNOTATION)),
        pinned,
        hasKonfluxMatch:
            annotation(entity, HAS_KONFLUX_MATCH_ANNOTATION) === 'true',
        pyxisListingEntityRef: pyxisListing || undefined,
    };
}

function dbProductToListItem(
    row: ProductSystemRow,
    pinned: boolean,
    hasKonfluxMatch: boolean,
): ProductListItem {
    return {
        entityRef: row.entity_ref,
        name: row.name,
        namespace: row.namespace,
        title: row.title ?? undefined,
        description: row.description ?? undefined,
        owner: row.owner,
        source: row.source,
        pinned,
        hasKonfluxMatch,
        pyxisListingEntityRef: row.pyxis_product_listing_id ?? undefined,
    };
}

function isManualOverrideType(value: string): value is ManualOverrideType {
    return OVERRIDE_TYPES.has(value as ManualOverrideType);
}

export class ProductService {
    private readonly logger: KonfluxLogger;

    constructor(
        private readonly db: KonfluxDatabase,
        private readonly catalog: CatalogClient,
        private readonly auth: AuthService,
        logger: LoggerService,
    ) {
        this.logger = new KonfluxLogger(logger);
    }

    async listProducts(
        userEntityRef: string,
        options: ListProductsOptions = {},
    ): Promise<ProductsListResponse> {
        const token = await this.getCatalogToken();
        const [catalogResult, dbProducts, pinnedSet] = await Promise.all([
            this.catalog.getEntities(
                {
                    filter: {
                        kind: 'System',
                        [`metadata.annotations.${SOURCE_ANNOTATION}`]: [
                            'auto',
                            'manual',
                        ],
                    },
                },
                { token },
            ),
            this.db.listProductSystems(),
            this.db.listPinnedProductsSet(userEntityRef),
        ]);

        const byRef = new Map<string, ProductListItem>();

        for (const entity of catalogResult.items) {
            const item = catalogProductToListItem(
                entity,
                pinnedSet.has(stringifyEntityRef(entity)),
            );
            byRef.set(item.entityRef, item);
        }

        const konfluxAdds = await this.productsWithKonfluxAdds(
            dbProducts.map(row => row.entity_ref),
        );

        const dbOnly = dbProducts.filter(row => !byRef.has(row.entity_ref));
        for (const row of dbOnly) {
            byRef.set(
                row.entity_ref,
                dbProductToListItem(
                    row,
                    pinnedSet.has(row.entity_ref),
                    konfluxAdds.has(row.entity_ref),
                ),
            );
        }

        for (const item of byRef.values()) {
            if (!item.hasKonfluxMatch && konfluxAdds.has(item.entityRef)) {
                item.hasKonfluxMatch = true;
            }
        }

        let products = [...byRef.values()];

        if (options.pinned) {
            products = products.filter(p => p.pinned);
        }

        if (options.search?.trim()) {
            const term = options.search.trim().toLowerCase();
            products = products.filter(
                p =>
                    p.name.toLowerCase().includes(term) ||
                    (p.title?.toLowerCase().includes(term) ?? false),
            );
        }

        products.sort((a, b) => a.name.localeCompare(b.name));

        return { products, total: products.length };
    }

    async createProduct(
        input: CreateProductRequest,
        userEntityRef: string,
    ): Promise<ProductDefinition> {
        const name = input.name.trim().toLowerCase();
        const namespace = (input.namespace ?? 'default').trim().toLowerCase();
        const entityRef = stringifyEntityRef({
            kind: 'System',
            namespace,
            name,
        });

        if (await this.db.productSystemExists(entityRef)) {
            throw new ConflictError(`Product already exists: ${entityRef}`);
        }

        const token = await this.getCatalogToken();
        const existing = await this.catalog.getEntityByRef(entityRef, {
            token,
        });
        if (existing) {
            throw new ConflictError(`Product already exists: ${entityRef}`);
        }

        const row = await this.db.createProductSystem({
            entity_ref: entityRef,
            name,
            namespace,
            title: input.title?.trim() || null,
            description: input.description?.trim() || null,
            owner: input.owner?.trim() || 'group:default/guests',
            source: 'manual',
            pyxis_product_listing_id: null,
            created_at: new Date().toISOString(),
            created_by: userEntityRef,
        });

        this.logger.info('Created manual product', { entityRef });
        return toProductDefinition(row);
    }

    async deleteProduct(entityRef: string): Promise<void> {
        const existing = await this.db.getProductSystem(entityRef);
        if (!existing) {
            throw new NotFoundError(`Product not found: ${entityRef}`);
        }
        if (existing.source !== 'manual') {
            throw new NotAllowedError(
                `Only manually created products can be deleted: ${entityRef}`,
            );
        }

        await this.db.deleteOverridesByProduct(entityRef);
        await this.db.deletePinsByProduct(entityRef);
        await this.db.deleteProductSystem(entityRef);
        this.logger.info('Deleted manual product', { entityRef });
    }

    async getComposition(systemEntityRef: string): Promise<ProductComposition> {
        const token = await this.getCatalogToken();
        const system = await this.catalog.getEntityByRef(systemEntityRef, {
            token,
        });
        const dbProduct = await this.db.getProductSystem(systemEntityRef);

        if (!system && !dbProduct) {
            throw new NotFoundError(`Product not found: ${systemEntityRef}`);
        }

        const overrides = await this.db.listManualOverrides(systemEntityRef);
        const autoRefs = new Set(
            (system?.relations ?? [])
                .filter(rel => rel.type === 'hasPart')
                .map(rel => rel.targetRef),
        );

        const removedKonflux = new Set(
            overrides
                .filter(o => o.override_type === 'remove_konflux')
                .map(o => o.resource_key),
        );
        const removedPyxis = new Set(
            overrides
                .filter(o => o.override_type === 'remove_pyxis')
                .map(o => o.resource_key),
        );
        const addedKonflux = new Set(
            overrides
                .filter(o => o.override_type === 'add_konflux')
                .map(o => o.resource_key),
        );
        const addedPyxis = new Set(
            overrides
                .filter(o => o.override_type === 'add_pyxis')
                .map(o => o.resource_key),
        );

        const allRefs = [
            ...new Set([...autoRefs, ...addedKonflux, ...addedPyxis]),
        ];
        const related = allRefs.length
            ? (
                  await this.catalog.getEntitiesByRefs(
                      { entityRefs: allRefs },
                      { token },
                  )
              ).items
            : [];

        const byRef = new Map<string, Entity>();
        for (let i = 0; i < allRefs.length; i++) {
            const entity = related[i];
            if (entity) {
                byRef.set(allRefs[i], entity);
            }
        }

        const konfluxApplications: KonfluxAppSummary[] = [];
        const pyxisListings: PyxisListingSummary[] = [];
        const listingEntities: Entity[] = [];

        for (const [entityRef, entity] of byRef) {
            const type = specType(entity);
            if (type === KONFLUX_APP_TYPE) {
                if (removedKonflux.has(entityRef)) {
                    continue;
                }
                konfluxApplications.push(
                    toKonfluxAppSummary(
                        entity,
                        addedKonflux.has(entityRef) && !autoRefs.has(entityRef)
                            ? 'manual'
                            : 'auto',
                    ),
                );
            } else if (type === PYXIS_LISTING_TYPE) {
                if (removedPyxis.has(entityRef)) {
                    continue;
                }
                pyxisListings.push(
                    toPyxisListingSummary(
                        entity,
                        addedPyxis.has(entityRef) && !autoRefs.has(entityRef)
                            ? 'manual'
                            : 'auto',
                    ),
                );
                listingEntities.push(entity);
            }
        }

        konfluxApplications.sort((a, b) => a.name.localeCompare(b.name));
        pyxisListings.sort((a, b) => a.name.localeCompare(b.name));

        const { repositories } = await this.loadRepositories(
            listingEntities,
            byRef,
            token,
        );
        const konfluxComponents = await this.loadComponents(
            konfluxApplications,
            byRef,
            token,
        );

        return {
            entityRef: systemEntityRef,
            title: system?.metadata.title ?? dbProduct?.title ?? undefined,
            description:
                system?.metadata.description ??
                dbProduct?.description ??
                undefined,
            source: compositionSource(
                system ? annotation(system, SOURCE_ANNOTATION) : '',
                dbProduct?.source,
            ),
            konfluxApplications,
            konfluxComponents,
            pyxisListings,
            repositories,
            manualOverrides: overrides.map(toManualOverrideItem),
        };
    }

    async togglePin(
        userEntityRef: string,
        productEntityRef: string,
        pinned: boolean,
    ): Promise<void> {
        if (pinned) {
            await this.assertProductExists(productEntityRef);
            await this.db.pinProduct(userEntityRef, productEntityRef);
        } else {
            await this.db.unpinProduct(userEntityRef, productEntityRef);
        }
    }

    async listPinnedRefs(userEntityRef: string): Promise<string[]> {
        return this.db.listPinnedProducts(userEntityRef);
    }

    async addOverride(
        productEntityRef: string,
        overrideType: string,
        resourceKey: string,
        userEntityRef: string,
    ): Promise<ManualOverrideItem> {
        if (!isManualOverrideType(overrideType)) {
            throw new InputError(
                `overrideType must be one of: ${[...OVERRIDE_TYPES].join(
                    ', ',
                )}`,
            );
        }
        const key = resourceKey.trim();
        if (!key) {
            throw new InputError('resourceKey is required');
        }

        await this.assertProductExists(productEntityRef);

        const existing = await this.db.listManualOverrides(productEntityRef);
        if (
            existing.some(
                row =>
                    row.override_type === overrideType &&
                    row.resource_key === key,
            )
        ) {
            throw new ConflictError(
                `Override already exists for ${overrideType} ${key}`,
            );
        }

        const row = await this.db.createManualOverride({
            product_entity_ref: productEntityRef,
            override_type: overrideType,
            resource_key: key,
            created_by: userEntityRef,
            created_at: new Date().toISOString(),
        });
        return toManualOverrideItem(row);
    }

    async removeOverride(overrideId: string): Promise<void> {
        const deleted = await this.db.deleteManualOverride(overrideId);
        if (!deleted) {
            throw new NotFoundError(`Override not found: ${overrideId}`);
        }
    }

    async listOverrides(
        productEntityRef: string,
    ): Promise<ManualOverrideItem[]> {
        const rows = await this.db.listManualOverrides(productEntityRef);
        return rows.map(toManualOverrideItem);
    }

    async listUnmatched(): Promise<UnmatchedApp[]> {
        const token = await this.getCatalogToken();
        const { items } = await this.catalog.getEntities(
            {
                filter: {
                    kind: 'Component',
                    'spec.type': KONFLUX_APP_TYPE,
                },
            },
            { token },
        );

        return items
            .filter(entity => {
                const relations = entity.relations ?? [];
                return !relations.some(
                    rel =>
                        rel.type === 'partOf' &&
                        rel.targetRef.startsWith('system:'),
                );
            })
            .map(toUnmatchedApp)
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async getSyncStatus(): Promise<SyncStatus> {
        const token = await this.getCatalogToken();
        const [apps, components, autoProducts, dbProducts] = await Promise.all([
            this.catalog.queryEntities(
                {
                    filter: {
                        kind: 'Component',
                        'spec.type': KONFLUX_APP_TYPE,
                    },
                    limit: 1,
                },
                { token },
            ),
            this.catalog.queryEntities(
                {
                    filter: {
                        kind: 'Component',
                        'spec.type': KONFLUX_COMPONENT_TYPE,
                    },
                    limit: 1,
                },
                { token },
            ),
            this.catalog.queryEntities(
                {
                    filter: {
                        kind: 'System',
                        [`metadata.annotations.${SOURCE_ANNOTATION}`]: 'auto',
                    },
                    limit: 1,
                },
                { token },
            ),
            this.db.listProductSystems(),
        ]);

        return {
            konfluxApplicationCount: apps.totalItems,
            konfluxComponentCount: components.totalItems,
            autoDiscoveredProductCount: autoProducts.totalItems,
            manualProductCount: dbProducts.filter(p => p.source === 'manual')
                .length,
        };
    }

    private async getCatalogToken(): Promise<string> {
        const { token } = await this.auth.getPluginRequestToken({
            onBehalfOf: await this.auth.getOwnServiceCredentials(),
            targetPluginId: 'catalog',
        });
        return token;
    }

    private async assertProductExists(entityRef: string): Promise<void> {
        if (await this.db.productSystemExists(entityRef)) {
            return;
        }
        const token = await this.getCatalogToken();
        const entity = await this.catalog.getEntityByRef(entityRef, { token });
        if (!entity) {
            throw new NotFoundError(`Product not found: ${entityRef}`);
        }
    }

    private async loadRepositories(
        listingEntities: Entity[],
        byRef: Map<string, Entity>,
        token: string,
    ): Promise<{ repositories: PyxisRepositorySummary[] }> {
        const repoRefToListing = new Map<string, Entity>();
        const repoRefs = new Set<string>();

        for (const listing of listingEntities) {
            for (const ref of specDependsOn(listing)) {
                repoRefs.add(ref);
                if (!repoRefToListing.has(ref)) {
                    repoRefToListing.set(ref, listing);
                }
            }
        }

        const missing = [...repoRefs].filter(ref => !byRef.has(ref));
        if (missing.length > 0) {
            const extra = (
                await this.catalog.getEntitiesByRefs(
                    { entityRefs: missing },
                    { token },
                )
            ).items;
            for (let i = 0; i < missing.length; i++) {
                const entity = extra[i];
                if (entity) {
                    byRef.set(missing[i], entity);
                }
            }
        }

        const repositories: PyxisRepositorySummary[] = [];
        for (const ref of repoRefs) {
            const entity = byRef.get(ref);
            if (!entity || specType(entity) !== PYXIS_REPO_TYPE) {
                continue;
            }
            const parent = repoRefToListing.get(ref);
            const repository = annotation(entity, PYXIS_REPOSITORY_ANNOTATION);
            repositories.push({
                entityRef: ref,
                name: entity.metadata.name,
                title: entity.metadata.title,
                repository: repository || undefined,
                listingEntityRef: parent
                    ? stringifyEntityRef(parent)
                    : undefined,
                listingTitle: parent?.metadata.title ?? parent?.metadata.name,
            });
        }

        repositories.sort((a, b) =>
            (a.repository ?? a.name).localeCompare(b.repository ?? b.name),
        );
        return { repositories };
    }

    private async loadComponents(
        apps: KonfluxAppSummary[],
        byRef: Map<string, Entity>,
        token: string,
    ): Promise<KonfluxComponentSummary[]> {
        if (apps.length === 0) {
            return [];
        }

        const entitiesByRef = new Map<string, Entity>();

        const relationRefs = [
            ...new Set(
                apps.flatMap(app =>
                    (byRef.get(app.entityRef)?.relations ?? [])
                        .filter(rel => rel.type === 'hasPart')
                        .map(rel => rel.targetRef),
                ),
            ),
        ];

        if (relationRefs.length > 0) {
            const extra = (
                await this.catalog.getEntitiesByRefs(
                    { entityRefs: relationRefs },
                    { token },
                )
            ).items;
            for (let i = 0; i < relationRefs.length; i++) {
                const entity = extra[i];
                if (entity && specType(entity) === KONFLUX_COMPONENT_TYPE) {
                    entitiesByRef.set(relationRefs[i], entity);
                }
            }
        }

        const coveredApps = new Set(
            [...entitiesByRef.values()]
                .map(entity => findParentApp(entity, apps)?.entityRef)
                .filter((ref): ref is string => Boolean(ref)),
        );

        for (const app of apps) {
            if (coveredApps.has(app.entityRef)) {
                continue;
            }
            const fetched = await this.queryComponentsForApp(
                app.entityRef,
                token,
            );
            for (const entity of fetched) {
                entitiesByRef.set(stringifyEntityRef(entity), entity);
            }
        }

        const konfluxComponents: KonfluxComponentSummary[] = [];
        for (const entity of entitiesByRef.values()) {
            const parentApp = findParentApp(entity, apps);
            if (!parentApp) {
                continue;
            }
            konfluxComponents.push(
                toKonfluxComponentSummary(entity, parentApp),
            );
        }

        konfluxComponents.sort((a, b) => a.name.localeCompare(b.name));
        return konfluxComponents;
    }

    private async queryComponentsForApp(
        applicationEntityRef: string,
        token: string,
    ): Promise<Entity[]> {
        const items: Entity[] = [];
        let cursor: string | undefined;
        do {
            const page = await this.catalog.queryEntities(
                cursor
                    ? { cursor }
                    : {
                          filter: {
                              kind: 'Component',
                              'spec.type': KONFLUX_COMPONENT_TYPE,
                              'spec.subcomponentOf': applicationEntityRef,
                          },
                          limit: 500,
                      },
                { token },
            );
            items.push(...page.items);
            cursor = page.pageInfo.nextCursor;
        } while (cursor);
        return items;
    }

    private async productsWithKonfluxAdds(
        entityRefs: string[],
    ): Promise<Set<string>> {
        const matched = new Set<string>();
        await Promise.all(
            entityRefs.map(async ref => {
                const overrides = await this.db.listManualOverrides(ref);
                if (overrides.some(o => o.override_type === 'add_konflux')) {
                    matched.add(ref);
                }
            }),
        );
        return matched;
    }
}
