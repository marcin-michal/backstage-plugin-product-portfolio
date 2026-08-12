import { watch, promises as fs } from 'fs';
import * as path from 'path';
import {
    ANNOTATION_LOCATION,
    ANNOTATION_ORIGIN_LOCATION,
    Entity,
} from '@backstage/catalog-model';
import {
    EntityProvider,
    EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { LoggerService } from '@backstage/backend-plugin-api';
import { ProductDefinition } from '@internal/backstage-plugin-konflux-common';

/**
 * Emits System entities from the shared konflux-products.json file written by
 * the konflux-backend Products API.
 */
export class ProductEntityProvider implements EntityProvider {
    private connection?: EntityProviderConnection;
    private readonly filePath: string;
    private readonly logger: LoggerService;
    private watcher?: ReturnType<typeof watch>;
    private refreshTimer?: NodeJS.Timeout;

    constructor(filePath: string, logger: LoggerService) {
        this.filePath = path.resolve(filePath);
        this.logger = logger;
    }

    getProviderName(): string {
        return 'konflux-products';
    }

    async connect(connection: EntityProviderConnection): Promise<void> {
        this.connection = connection;
        await this.run();
        this.startWatching();
    }

    async run(): Promise<void> {
        if (!this.connection) {
            return;
        }

        const products = await this.readProducts();
        const entities = products.map(product =>
            toSystemEntity(product, this.filePath),
        );

        await this.connection.applyMutation({
            type: 'full',
            entities: entities.map(entity => ({
                entity,
                locationKey: `konflux-products:${entity.metadata.namespace}/${entity.metadata.name}`,
            })),
        });

        this.logger.info('Product EntityProvider sync complete', {
            productCount: entities.length,
            path: this.filePath,
        });
    }

    private startWatching(): void {
        const scheduleRefresh = () => {
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
            }
            // Debounce rapid fs events from atomic write (tmp + rename)
            this.refreshTimer = setTimeout(() => {
                void this.run().catch(error => {
                    this.logger.error(
                        'Product EntityProvider refresh failed',
                        error instanceof Error
                            ? error
                            : new Error(String(error)),
                    );
                });
            }, 300);
        };

        try {
            this.watcher = watch(
                path.dirname(this.filePath),
                { persistent: true },
                (_eventType, filename) => {
                    if (
                        !filename ||
                        filename === path.basename(this.filePath) ||
                        String(filename).startsWith(
                            path.basename(this.filePath),
                        )
                    ) {
                        scheduleRefresh();
                    }
                },
            );
            this.watcher.on('error', error => {
                this.logger.warn(
                    `Product EntityProvider file watch error: ${error}`,
                );
            });
        } catch (error) {
            this.logger.warn(
                `Could not watch products file; relying on initial sync only: ${error}`,
            );
            // Fallback: periodic poll
            this.refreshTimer = setInterval(() => {
                void this.run().catch(() => undefined);
            }, 10_000) as unknown as NodeJS.Timeout;
        }
    }

    private async readProducts(): Promise<ProductDefinition[]> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw) as unknown;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return [];
            }
            return Object.values(parsed as Record<string, ProductDefinition>);
        } catch (error) {
            const code =
                error && typeof error === 'object' && 'code' in error
                    ? (error as NodeJS.ErrnoException).code
                    : undefined;
            if (code === 'ENOENT') {
                return [];
            }
            this.logger.error(
                'Failed to read products file',
                error instanceof Error ? error : new Error(String(error)),
            );
            return [];
        }
    }
}

function toSystemEntity(
    product: ProductDefinition,
    filePath: string,
): Entity {
    const location = `file:${filePath}`;
    return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'System',
        metadata: {
            name: product.name,
            namespace: product.namespace,
            title: product.title,
            description: product.description,
            annotations: {
                [ANNOTATION_LOCATION]: location,
                [ANNOTATION_ORIGIN_LOCATION]: location,
                'redhat.com/product-source': 'konflux-products',
            },
        },
        spec: {
            owner: product.owner,
        },
    };
}
