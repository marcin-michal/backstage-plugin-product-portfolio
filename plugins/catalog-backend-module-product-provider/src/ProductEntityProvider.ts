import { Knex } from 'knex';
import {
    ANNOTATION_LOCATION,
    ANNOTATION_ORIGIN_LOCATION,
    Entity,
} from '@backstage/catalog-model';
import {
    EntityProvider,
    EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import {
    LoggerService,
    SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';

interface ManualProductRow {
    entity_ref: string;
    name: string;
    namespace: string;
    title: string | null;
    description: string | null;
    owner: string;
}

/**
 * Emits System entities for manually created products stored in the konflux
 * plugin database (`product_systems` where source = 'manual').
 */
export class ProductEntityProvider implements EntityProvider {
    private connection?: EntityProviderConnection;

    constructor(
        private readonly knex: Knex,
        private readonly logger: LoggerService,
        private readonly taskRunner: SchedulerServiceTaskRunner,
    ) {}

    getProviderName(): string {
        return 'konflux-products';
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
            return;
        }

        let products: ManualProductRow[];
        try {
            products = await this.readManualProducts();
        } catch (error) {
            this.logger.error(
                'Product EntityProvider failed to read product_systems; skipping mutation',
                error instanceof Error ? error : new Error(String(error)),
            );
            return;
        }

        const entities = products.map(toSystemEntity);

        await this.connection.applyMutation({
            type: 'full',
            entities: entities.map(entity => ({
                entity,
                locationKey: `konflux-products:${entity.metadata.namespace}/${entity.metadata.name}`,
            })),
        });

        this.logger.info('Product EntityProvider sync complete', {
            productCount: entities.length,
        });
    }

    private async readManualProducts(): Promise<ManualProductRow[]> {
        return this.knex<ManualProductRow>('product_systems')
            .where('source', 'manual')
            .select(
                'entity_ref',
                'name',
                'namespace',
                'title',
                'description',
                'owner',
            );
    }
}

function toSystemEntity(product: ManualProductRow): Entity {
    const location = `konflux-products:${product.namespace}/${product.name}`;
    return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'System',
        metadata: {
            name: product.name,
            namespace: product.namespace,
            title: product.title ?? undefined,
            description: product.description ?? undefined,
            annotations: {
                [ANNOTATION_LOCATION]: location,
                [ANNOTATION_ORIGIN_LOCATION]: location,
                'redhat.com/product-matching-source': 'manual',
            },
        },
        spec: {
            owner: product.owner,
        },
    };
}
