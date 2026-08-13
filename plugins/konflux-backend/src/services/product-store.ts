import { LoggerService } from '@backstage/backend-plugin-api';
import { ProductDefinition } from '@internal/backstage-plugin-konflux-common';
import { JsonFileStore } from './json-file-store';

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
export class ProductStore extends JsonFileStore<ProductDefinition> {
    constructor(filePath: string, logger: LoggerService) {
        super(filePath, logger);
    }

    async get(entityRef: string): Promise<ProductDefinition | undefined> {
        const data = await this.load();
        return data[entityRef];
    }

    async getByName(
        name: string,
        namespace = 'default',
    ): Promise<ProductDefinition | undefined> {
        return this.get(`system:${namespace}/${name}`);
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
}
