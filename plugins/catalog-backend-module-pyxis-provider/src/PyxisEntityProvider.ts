import { Entity } from '@backstage/catalog-model';
import {
    EntityProvider,
    EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import {
    LoggerService,
    SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { PyxisClient } from './pyxisClient.ts';
import { PyxisContainerRepository, PyxisProviderConfig } from './types';
import {
    toProductListingEntity,
    toGroupEntity,
    toUserEntity,
    collectUniqueUsers,
    toRepositoryEntity,
    isPyxisObjectId,
} from './entityHelpers';

export class PyxisEntityProvider implements EntityProvider {
    private connection?: EntityProviderConnection;
    private readonly client: PyxisClient;

    constructor(
        private readonly config: PyxisProviderConfig,
        private readonly logger: LoggerService,
        private readonly taskRunner: SchedulerServiceTaskRunner,
    ) {
        this.client = new PyxisClient(config, logger);
        this.config = config;
    }

    getProviderName(): string {
        return 'pyxis-product-listings';
    }

    async connect(connection: EntityProviderConnection): Promise<void> {
        this.connection = connection;

        await this.taskRunner.run({
            id: this.getProviderName(),
            fn: async () => {
                await this.run();
            },
        });
    }

    async run(): Promise<void> {
        if (!this.connection) {
            throw new Error('Not initialized');
        }

        this.logger.info('Starting Pyxis entity sync...');

        const productListings = await this.client.fetchAllProductListings();
        this.logger.info(`Fetched ${productListings.length} product listings`);

        const repositoryResults = await Promise.all(
            productListings.map(listing =>
                this.client.fetchRepositoriesByProductListing(listing._id),
            ),
        );
        const repositoryById = new Map<string, PyxisContainerRepository>();
        for (const repos of repositoryResults) {
            for (const repo of repos) {
                repositoryById.set(repo._id, repo);
            }
        }
        const repositories = Array.from(repositoryById.values());
        this.logger.info(`Fetched ${repositories.length} unique repositories`);

        const rawTeamIds = [
            ...new Set(
                [
                    ...productListings.map(pl => pl.team_id),
                    ...repositories.map(r => r.team_id),
                ].filter((id): id is string => Boolean(id)),
            ),
        ];
        const invalidTeamIds = rawTeamIds.filter(id => !isPyxisObjectId(id));
        if (invalidTeamIds.length > 0) {
            this.logger.warn(
                `Found ${invalidTeamIds.length} non-ObjectID team_id value(s) ` +
                    `(likely team names): ${invalidTeamIds.join(', ')}`,
            );
        }
        const teamIds = rawTeamIds.filter(isPyxisObjectId);
        this.logger.info(`Found ${teamIds.length} unique team ObjectIDs`);

        const teams = await this.client.fetchTeams(teamIds);
        this.logger.info(`Fetched ${teams.length} teams`);

        const teamNameById = new Map(teams.map(t => [t._id, t.name]));
        for (const name of invalidTeamIds) {
            teamNameById.set(name, name);
        }

        const userMap = collectUniqueUsers(teams);
        this.logger.info(`Found ${userMap.size} unique users`);

        const entities: Entity[] = [
            ...productListings.map(pl =>
                toProductListingEntity(pl, teamNameById, this.config.url),
            ),
            ...repositories.map(rep =>
                toRepositoryEntity(rep, teamNameById, this.config.url),
            ),
            ...teams.map(t => toGroupEntity(t)),
            ...invalidTeamIds.map(name =>
                toGroupEntity({
                    _id: name,
                    name,
                    vendor_label: null,
                    jira_group_key: null,
                    members: [],
                    creation_date: '',
                    last_update_date: '',
                }),
            ),
            ...Array.from(userMap.values()).map(u => toUserEntity(u)),
        ];

        await this.connection.applyMutation({
            type: 'full',
            entities: entities.map(entity => ({
                entity,
                locationKey: `pyxis-provider:${this.getProviderName()}`,
            })),
        });

        this.logger.info(
            `Pyxis sync complete: ${productListings.length} products, ` +
                `${repositories.length} repositories, ${teams.length} teams, ` +
                `${userMap.size} users`,
        );
    }
}
