import { LoggerService } from '@backstage/backend-plugin-api';
import { ProductConfig } from '@internal/backstage-plugin-konflux-common';
import { JsonFileStore } from './json-file-store';

/**
 * File-backed store for product compositions (System → Konflux/Pyxis bindings).
 *
 * Atomic writes via temp file + rename.
 *
 * NOTE: This is fine for a single-instance PoC. Multi-instance deployments
 * should replace this with a shared database (e.g. Backstage's Knex/PostgreSQL).
 */
export class ProductConfigStore extends JsonFileStore<ProductConfig> {
    constructor(filePath: string, logger: LoggerService) {
        super(filePath, logger);
    }

    async get(entityRef: string): Promise<ProductConfig | undefined> {
        const data = await this.load();
        return data[entityRef];
    }

    async set(entityRef: string, config: ProductConfig): Promise<void> {
        const data = await this.load();
        data[entityRef] = config;
        await this.persist(data);
        this.logger.info('Saved product config', {
            entityRef,
            konfluxBindingCount: config.konfluxBindings.length,
            pyxisBindingCount: config.pyxisBindings.length,
        });
    }

    async delete(entityRef: string): Promise<boolean> {
        const data = await this.load();
        if (!(entityRef in data)) {
            return false;
        }
        delete data[entityRef];
        await this.persist(data);
        this.logger.info('Deleted product config', { entityRef });
        return true;
    }

    async listAll(): Promise<string[]> {
        const data = await this.load();
        return Object.keys(data).sort((a, b) => a.localeCompare(b));
    }

    /** Entity refs that have at least one Konflux or Pyxis binding. */
    async listComposedRefs(): Promise<string[]> {
        const data = await this.load();
        return Object.entries(data)
            .filter(
                ([, config]) =>
                    config.konfluxBindings.length > 0 ||
                    config.pyxisBindings.length > 0,
            )
            .map(([entityRef]) => entityRef)
            .sort((a, b) => a.localeCompare(b));
    }
}
