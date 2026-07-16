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
import { PyxisProviderConfig } from './types';
import {
  toComponentEntity,
  toGroupEntity,
  toUserEntity,
  collectUniqueUsers,
} from './entityHelpers';

export class PyxisEntityProvider implements EntityProvider {
    private connection?: EntityProviderConnection;
    private readonly client: PyxisClient;

    constructor(
        config: PyxisProviderConfig,
        private readonly logger: LoggerService,
        private readonly taskRunner: SchedulerServiceTaskRunner,
    ) {
        this.client = new PyxisClient(config, logger);
    }

    getProviderName(): string {
        return 'pyxis-product-listings';
    }

    async connect(connection: EntityProviderConnection): Promise<void> {
        this.connection = connection;

        await this.taskRunner.run({
            id: this.getProviderName(),
            fn: async () => { await this.run(); },
        });
    }

    async run(): Promise<void> {
        if (!this.connection) {
            throw new Error('Not initialized');
        }

        this.logger.info('Starting Pyxis entity sync...');

        const productListings = await this.client.fetchAllProductListings();
        this.logger.info(`Fetched ${productListings.length} product listings`);

        // unique team IDs from the product listings
        const teamIds = [
            ...new Set(
                productListings
                .map(pl => pl.team_id)
                .filter((id): id is string => Boolean(id)),
            ),
        ];
        this.logger.info(`Found ${teamIds.length} unique team IDs`);

        const teams = await this.client.fetchTeams(teamIds);
        this.logger.info(`Fetched ${teams.length} teams`);

        const teamNameById = new Map(teams.map(t => [t._id, t.name]));

        const userMap = collectUniqueUsers(teams);
        this.logger.info(`Found ${userMap.size} unique users`);

        const entities: Entity[] = [
            ...productListings.map(pl => toComponentEntity(pl, teamNameById)),
            ...teams.map(t => toGroupEntity(t)),
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
            `${teams.length} teams, ${userMap.size} users`,
        );
    }
}