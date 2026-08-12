import { promises as fs } from 'fs';
import * as path from 'path';
import { LoggerService } from '@backstage/backend-plugin-api';
import { ProductDefinition } from '@internal/backstage-plugin-konflux-common';
import { KonfluxLogger } from '../helpers/logger';

type ProductDefinitionMap = Record<string, ProductDefinition>;

export class ProductStoreConflictError extends Error {
    constructor(entityRef: string) {
        super(`Product already exists: ${entityRef}`);
        this.name = 'ProductStoreConflictError';
    }
}

/**
 * File-backed store for user-created product System definitions.
 *
 * The catalog ProductEntityProvider reads the same file to emit System entities.
 */
export class ProductStore {
    private readonly logger: KonfluxLogger;
    private readonly filePath: string;
    private cache: ProductDefinitionMap | undefined;
    private loadPromise: Promise<ProductDefinitionMap> | undefined;

    constructor(filePath: string, logger: LoggerService) {
        this.filePath = path.resolve(filePath);
        this.logger = new KonfluxLogger(logger);
    }

    get path(): string {
        return this.filePath;
    }

    async get(entityRef: string): Promise<ProductDefinition | undefined> {
        const data = await this.load();
        return data[entityRef];
    }

    async getByName(
        name: string,
        namespace = 'default',
    ): Promise<ProductDefinition | undefined> {
        const entityRef = `system:${namespace}/${name}`;
        return this.get(entityRef);
    }

    async list(): Promise<ProductDefinition[]> {
        const data = await this.load();
        return Object.values(data).sort((a, b) =>
            a.name.localeCompare(b.name),
        );
    }

    async create(product: ProductDefinition): Promise<ProductDefinition> {
        const data = await this.load();
        if (data[product.entityRef]) {
            throw new ProductStoreConflictError(product.entityRef);
        }
        data[product.entityRef] = product;
        await this.persist(data);
        this.logger.info('Created product definition', {
            entityRef: product.entityRef,
        });
        return product;
    }

    async delete(entityRef: string): Promise<boolean> {
        const data = await this.load();
        if (!(entityRef in data)) {
            return false;
        }
        delete data[entityRef];
        await this.persist(data);
        this.logger.info('Deleted product definition', { entityRef });
        return true;
    }

    private async load(): Promise<ProductDefinitionMap> {
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

    private async readFromDisk(): Promise<ProductDefinitionMap> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw) as unknown;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                this.logger.warn(
                    'Products file is not a JSON object; starting empty',
                    { path: this.filePath },
                );
                return {};
            }
            return parsed as ProductDefinitionMap;
        } catch (error) {
            const code =
                error && typeof error === 'object' && 'code' in error
                    ? (error as NodeJS.ErrnoException).code
                    : undefined;
            if (code === 'ENOENT') {
                return {};
            }
            this.logger.error(
                'Failed to read products file; starting empty',
                error,
                { path: this.filePath },
            );
            return {};
        }
    }

    private async persist(data: ProductDefinitionMap): Promise<void> {
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
