import { Knex } from 'knex';
import {
    ANNOTATION_LOCATION,
    ANNOTATION_ORIGIN_LOCATION,
    Entity,
} from '@backstage/catalog-model';
import {
    CatalogProcessor,
    CatalogProcessorEmit,
    processingResult,
} from '@backstage/plugin-catalog-node';
import { LocationSpec } from '@backstage/plugin-catalog-common';
import { LoggerService } from '@backstage/backend-plugin-api';
import { normalizeRepo } from './normalizeRepo';
import {
    ListingRepoRow,
    ProductSystemRow,
    RepoToKonfluxRow,
    RepoToPyxisRow,
} from './types';
import { parseEntityRef, sanitizePyxisName } from './utils';

const PROCESSOR_NAME = 'ProductMatchingProcessor';

export class ProductMatchingProcessor implements CatalogProcessor {
    constructor(
        private readonly knex: Knex,
        private readonly logger: LoggerService,
    ) {}

    getProcessorName(): string {
        return PROCESSOR_NAME;
    }

    async preProcessEntity(
        entity: Entity,
        _location: LocationSpec,
        emit: CatalogProcessorEmit,
    ): Promise<Entity> {
        const type = (entity.spec as Record<string, unknown> | undefined)
            ?.type as string | undefined;

        if (entity.kind !== 'Component') {
            return entity;
        }

        if (type === 'konflux-application') {
            return this.processKonfluxApplication(entity, emit);
        }

        if (type === 'container-repository') {
            return this.processPyxisContainerRepository(entity, emit);
        }

        if (type === 'product-listing') {
            return this.processPyxisProductListing(entity);
        }

        return entity;
    }

    async postProcessEntity(
        entity: Entity,
        _location: LocationSpec,
        emit: CatalogProcessorEmit,
    ): Promise<Entity> {
        const type = (entity.spec as Record<string, unknown> | undefined)
            ?.type as string | undefined;

        if (entity.kind !== 'Component' || type !== 'product-listing') {
            return entity;
        }

        return this.emitProductSystem(entity, _location, emit);
    }

    // -------------------------------------------------------------------------
    // Case 1: Konflux Application
    // -------------------------------------------------------------------------

    private async processKonfluxApplication(
        entity: Entity,
        emit: CatalogProcessorEmit,
    ): Promise<Entity> {
        const annotations = entity.metadata.annotations ?? {};
        const rawReposJson = annotations['redhat.com/konflux-rpa-target-repos'];

        if (!rawReposJson) {
            return entity;
        }

        let rawRepos: string[];
        try {
            rawRepos = JSON.parse(rawReposJson) as string[];
        } catch {
            this.logger.warn(
                `${PROCESSOR_NAME}: malformed redhat.com/konflux-rpa-target-repos ` +
                    `on ${entity.metadata.name}`,
            );
            return entity;
        }

        const cluster = annotations['redhat.com/konflux-cluster'] ?? '';
        const namespace = annotations['redhat.com/konflux-namespace'] ?? '';
        const appName = annotations['redhat.com/konflux-application'] ?? '';
        const selfRef = `component:default/${entity.metadata.name}`;
        const now = new Date().toISOString();

        const normalizedRepos = [
            ...new Set(rawRepos.map(r => normalizeRepo(r)).filter(Boolean)),
        ];

        if (normalizedRepos.length === 0) {
            return entity;
        }

        // Register each target repo so Pyxis processors can find this app.
        for (const normalized of normalizedRepos) {
            await this.knex<RepoToKonfluxRow>('matching_repo_to_konflux')
                .insert({
                    normalized_repo: normalized,
                    entity_ref: selfRef,
                    cluster,
                    namespace,
                    app_name: appName,
                    updated_at: now,
                })
                .onConflict(['normalized_repo', 'entity_ref'])
                .merge(['cluster', 'namespace', 'app_name', 'updated_at']);
        }

        const pyxisRepoRows = await this.knex<RepoToPyxisRow>(
            'matching_repo_to_pyxis',
        ).whereIn('normalized_repo', normalizedRepos);

        if (pyxisRepoRows.length === 0) {
            return entity;
        }

        const pyxisRepoRefs = [
            ...new Set(pyxisRepoRows.map(r => r.entity_ref)),
        ];

        // Emit dependsOn relation to each matched Pyxis container-repository.
        for (const repoRef of pyxisRepoRefs) {
            emit(
                processingResult.relation({
                    type: 'dependsOn',
                    source: parseEntityRef(selfRef),
                    target: parseEntityRef(repoRef),
                }),
            );
        }

        // Step 2: Pyxis repo entity refs → product listing entity refs.
        const listingRows = await this.knex<ListingRepoRow>(
            'matching_listing_repos',
        ).whereIn('repo_entity_ref', pyxisRepoRefs);

        if (listingRows.length === 0) {
            entity.metadata.annotations = {
                ...annotations,
                'redhat.com/pyxis-matched': 'true',
            };
            return entity;
        }

        const listingRefs = [
            ...new Set(listingRows.map(r => r.listing_entity_ref)),
        ];

        // Step 3: listing entity refs → System entity refs.
        const systemRows = await this.knex<ProductSystemRow>(
            'matching_product_systems',
        ).whereIn('pyxis_listing_entity_ref', listingRefs);

        const systemRefs = [
            ...new Set(systemRows.map(r => r.system_entity_ref)),
        ];

        for (const systemRef of systemRefs) {
            emit(
                processingResult.relation({
                    type: 'partOf',
                    source: parseEntityRef(selfRef),
                    target: parseEntityRef(systemRef),
                }),
            );
            emit(
                processingResult.relation({
                    type: 'hasPart',
                    source: parseEntityRef(systemRef),
                    target: parseEntityRef(selfRef),
                }),
            );
        }

        entity.metadata.annotations = {
            ...annotations,
            'redhat.com/pyxis-matched': 'true',
            ...(systemRefs.length > 0 && {
                'redhat.com/pyxis-product-listing': systemRefs
                    .map(r => r.replace(/^system:default\//, ''))
                    .join(','),
            }),
        };

        return entity;
    }

    private async processPyxisContainerRepository(
        entity: Entity,
        emit: CatalogProcessorEmit,
    ): Promise<Entity> {
        const annotations = entity.metadata.annotations ?? {};
        const rawRepo = annotations['redhat.com/repository'];

        if (!rawRepo) {
            return entity;
        }

        const normalized = normalizeRepo(rawRepo);
        if (!normalized) {
            return entity;
        }

        const pyxisId = annotations['redhat.com/pyxis-id'] ?? '';
        const selfRef = `component:default/${entity.metadata.name}`;
        const now = new Date().toISOString();

        // Register this Pyxis repo so Konflux processors can find it.
        await this.knex<RepoToPyxisRow>('matching_repo_to_pyxis')
            .insert({
                normalized_repo: normalized,
                entity_ref: selfRef,
                pyxis_id: pyxisId,
                updated_at: now,
            })
            .onConflict(['normalized_repo', 'entity_ref'])
            .merge(['pyxis_id', 'updated_at']);

        const konfluxRows = await this.knex<RepoToKonfluxRow>(
            'matching_repo_to_konflux',
        ).where({ normalized_repo: normalized });

        if (konfluxRows.length === 0) {
            return entity;
        }

        for (const row of konfluxRows) {
            emit(
                processingResult.relation({
                    type: 'dependencyOf',
                    source: parseEntityRef(selfRef),
                    target: parseEntityRef(row.entity_ref),
                }),
            );
        }

        entity.metadata.annotations = {
            ...annotations,
            'redhat.com/konflux-matched': 'true',
        };

        return entity;
    }

    private async processPyxisProductListing(entity: Entity): Promise<Entity> {
        const spec = entity.spec as Record<string, unknown> | undefined;
        const dependsOn = (spec?.dependsOn as string[] | undefined) ?? [];

        const listingRef = `component:default/${entity.metadata.name}`;
        const pyxisId =
            entity.metadata.annotations?.['redhat.com/pyxis-id'] ?? '';
        const systemName = `product-${sanitizePyxisName(pyxisId)}`;
        const systemRef = `system:default/${systemName}`;
        const now = new Date().toISOString();

        // Store listing → repo membership so processKonfluxApplication can
        // find which listings a repo belongs to without querying spec.dependsOn.
        const repoRefs = dependsOn.filter(d =>
            d.startsWith('component:default/'),
        );

        if (repoRefs.length > 0) {
            // Delete stale entries before re-inserting to handle repos removed
            // from the listing between provider sync cycles.
            await this.knex<ListingRepoRow>('matching_listing_repos')
                .where({ listing_entity_ref: listingRef })
                .delete();

            const rows: ListingRepoRow[] = repoRefs.map(repoRef => ({
                listing_entity_ref: listingRef,
                repo_entity_ref: repoRef,
            }));
            await this.knex<ListingRepoRow>('matching_listing_repos').insert(
                rows,
            );
        }

        let hasKonfluxMatch = false;

        if (repoRefs.length > 0) {
            // Resolve entity refs → normalized repos via matching_repo_to_pyxis.
            const pyxisRepoRows = await this.knex<RepoToPyxisRow>(
                'matching_repo_to_pyxis',
            ).whereIn('entity_ref', repoRefs);

            if (pyxisRepoRows.length > 0) {
                const normalizedRepos = pyxisRepoRows.map(
                    r => r.normalized_repo,
                );
                const matchCount = await this.knex<RepoToKonfluxRow>(
                    'matching_repo_to_konflux',
                )
                    .whereIn('normalized_repo', normalizedRepos)
                    .count<{ count: string }>('* as count')
                    .first();

                hasKonfluxMatch = parseInt(matchCount?.count ?? '0', 10) > 0;
            }
        }

        await this.knex<ProductSystemRow>('matching_product_systems')
            .insert({
                pyxis_listing_entity_ref: listingRef,
                pyxis_listing_name:
                    (entity.metadata.title as string | undefined) ?? null,
                system_entity_ref: systemRef,
                has_konflux_match: hasKonfluxMatch,
                updated_at: now,
            })
            .onConflict('pyxis_listing_entity_ref')
            .merge([
                'pyxis_listing_name',
                'system_entity_ref',
                'has_konflux_match',
                'updated_at',
            ]);

        return entity;
    }

    private async emitProductSystem(
        entity: Entity,
        location: LocationSpec,
        emit: CatalogProcessorEmit,
    ): Promise<Entity> {
        const listingRef = `component:default/${entity.metadata.name}`;

        const row = await this.knex<ProductSystemRow>(
            'matching_product_systems',
        )
            .where({ pyxis_listing_entity_ref: listingRef })
            .first();

        if (!row) {
            return entity;
        }

        // Only emit system entity if the product listing has assoctiated Konflux apps
        if (!row.has_konflux_match) {
            return entity;
        }

        const systemName = row.system_entity_ref.replace(
            /^system:default\//,
            '',
        );
        const locationString = `product-matching:${listingRef}`;

        emit(
            processingResult.entity(location, {
                apiVersion: 'backstage.io/v1alpha1',
                kind: 'System',
                metadata: {
                    name: systemName,
                    namespace: 'default',
                    title:
                        row.pyxis_listing_name ??
                        entity.metadata.title ??
                        systemName,
                    description: entity.metadata.description,
                    annotations: {
                        [ANNOTATION_LOCATION]: locationString,
                        [ANNOTATION_ORIGIN_LOCATION]: locationString,
                        'redhat.com/pyxis-product-listing': listingRef,
                        'redhat.com/product-matching-source': 'auto',
                        'redhat.com/has-konflux-match': String(
                            row.has_konflux_match,
                        ),
                    },
                },
                spec: {
                    owner: entity.spec?.owner ?? 'group:default/unknown',
                },
            }),
        );

        emit(
            processingResult.relation({
                type: 'partOf',
                source: parseEntityRef(listingRef),
                target: parseEntityRef(row.system_entity_ref),
            }),
        );
        emit(
            processingResult.relation({
                type: 'hasPart',
                source: parseEntityRef(row.system_entity_ref),
                target: parseEntityRef(listingRef),
            }),
        );

        return entity;
    }
}
