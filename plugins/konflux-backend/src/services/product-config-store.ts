import { promises as fs } from 'fs';
import * as path from 'path';
import { LoggerService } from '@backstage/backend-plugin-api';
import { ProductConfig } from '@internal/backstage-plugin-konflux-common';
import { KonfluxLogger } from '../helpers/logger';

type ProductConfigMap = Record<string, ProductConfig>;

/**
 * File-backed store for product compositions (System → Konflux/Pyxis bindings).
 *
 * Single JSON file with an in-memory cache. Atomic writes via temp file + rename.
 *
 * NOTE: This is fine for a single-instance PoC. Multi-instance deployments
 * should replace this with a shared database (e.g. Backstage's Knex/PostgreSQL).
 */
export class ProductConfigStore {
    private readonly logger: KonfluxLogger;
    private readonly filePath: string;
    private cache: ProductConfigMap | undefined;
    private loadPromise: Promise<ProductConfigMap> | undefined;

    constructor(filePath: string, logger: LoggerService) {
        this.filePath = path.resolve(filePath);
        this.logger = new KonfluxLogger(logger);
    }

    get path(): string {
        return this.filePath;
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

    private async load(): Promise<ProductConfigMap> {
        if (this.cache) {
            return this.cache;
        }

        if (!this.loadPromise) {
            this.loadPromise = this.readFromDisk();
        }

        try {
            this.cache = await this.loadPromise;
            return this.cache;
        } finally {
            this.loadPromise = undefined;
        }
    }

    private async readFromDisk(): Promise<ProductConfigMap> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw) as unknown;
            if (
                !parsed ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed)
            ) {
                this.logger.warn(
                    'Product config file is not a JSON object; starting empty',
                    { path: this.filePath },
                );
                return {};
            }
            return parsed as ProductConfigMap;
        } catch (error) {
            const code =
                error && typeof error === 'object' && 'code' in error
                    ? (error as NodeJS.ErrnoException).code
                    : undefined;
            if (code === 'ENOENT') {
                return {};
            }
            this.logger.error(
                'Failed to read product config file; starting empty',
                error,
                { path: this.filePath },
            );
            return {};
        }
    }

    private async persist(data: ProductConfigMap): Promise<void> {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });

        const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
        const payload = `${JSON.stringify(data, null, 2)}\n`;

        try {
            await fs.writeFile(tmpPath, payload, 'utf8');
            await fs.rename(tmpPath, this.filePath);
            this.cache = data;
        } catch (error) {
            await fs.unlink(tmpPath).catch(() => undefined);
            throw error;
        }
    }
}
