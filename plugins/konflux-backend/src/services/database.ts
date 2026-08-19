import { Knex } from 'knex';
import {
    DatabaseService,
    resolvePackagePath,
} from '@backstage/backend-plugin-api';

export interface ProductSystemRow {
    id: string;
    entity_ref: string;
    name: string;
    namespace: string;
    title: string | null;
    description: string | null;
    owner: string;
    source: 'auto_discovered' | 'manual';
    pyxis_product_listing_id: string | null;
    created_at: string;
    created_by: string | null;
}

export interface UserPinRow {
    user_entity_ref: string;
    product_entity_ref: string;
    pinned_at: string;
}

export interface ManualOverrideRow {
    id: string;
    product_entity_ref: string;
    override_type:
        | 'add_konflux'
        | 'remove_konflux'
        | 'add_pyxis'
        | 'remove_pyxis';
    resource_key: string;
    created_by: string | null;
    created_at: string;
}

export class KonfluxDatabase {
    constructor(private readonly knex: Knex) {}

    static async runMigrations(database: DatabaseService): Promise<Knex> {
        const knex = await database.getClient();

        const migrationsDirectory = resolvePackagePath(
            '@internal/backstage-plugin-konflux-backend',
            'migrations',
        );

        await knex.migrate.latest({
            directory: migrationsDirectory,
        });

        return knex;
    }

    async createProductSystem(
        row: Omit<ProductSystemRow, 'id'>,
    ): Promise<ProductSystemRow> {
        const [inserted] = await this.knex<ProductSystemRow>('product_systems')
            .insert(row)
            .returning('*');
        return inserted;
    }

    async getProductSystem(
        entityRef: string,
    ): Promise<ProductSystemRow | undefined> {
        return this.knex<ProductSystemRow>('product_systems')
            .where({ entity_ref: entityRef })
            .first();
    }

    async listProductSystems(): Promise<ProductSystemRow[]> {
        return this.knex<ProductSystemRow>('product_systems')
            .select('*')
            .orderBy('name', 'asc');
    }

    async productSystemExists(entityRef: string): Promise<boolean> {
        const row = await this.knex<ProductSystemRow>('product_systems')
            .where({ entity_ref: entityRef })
            .first();
        return row !== undefined;
    }

    async pinProduct(
        userEntityRef: string,
        productEntityRef: string,
    ): Promise<void> {
        await this.knex<UserPinRow>('user_pins')
            .insert({
                user_entity_ref: userEntityRef,
                product_entity_ref: productEntityRef,
                pinned_at: new Date().toISOString(),
            })
            .onConflict(['user_entity_ref', 'product_entity_ref'])
            .ignore();
    }

    async unpinProduct(
        userEntityRef: string,
        productEntityRef: string,
    ): Promise<void> {
        await this.knex<UserPinRow>('user_pins')
            .where({
                user_entity_ref: userEntityRef,
                product_entity_ref: productEntityRef,
            })
            .delete();
    }

    async listPinnedProducts(userEntityRef: string): Promise<string[]> {
        const rows = await this.knex<UserPinRow>('user_pins')
            .where({ user_entity_ref: userEntityRef })
            .select('product_entity_ref')
            .orderBy('pinned_at', 'desc');
        return rows.map(r => r.product_entity_ref);
    }

    async createManualOverride(
        row: Omit<ManualOverrideRow, 'id'>,
    ): Promise<ManualOverrideRow> {
        const [inserted] = await this.knex<ManualOverrideRow>(
            'manual_overrides',
        )
            .insert(row)
            .returning('*');
        return inserted;
    }

    async listManualOverrides(
        productEntityRef: string,
    ): Promise<ManualOverrideRow[]> {
        return this.knex<ManualOverrideRow>('manual_overrides')
            .where({ product_entity_ref: productEntityRef })
            .orderBy('created_at', 'asc');
    }

    async deleteManualOverride(id: string): Promise<boolean> {
        const count = await this.knex<ManualOverrideRow>('manual_overrides')
            .where({ id })
            .delete();
        return count > 0;
    }

    async deleteProductSystem(entityRef: string): Promise<boolean> {
        const count = await this.knex<ProductSystemRow>('product_systems')
            .where({ entity_ref: entityRef })
            .delete();
        return count > 0;
    }

    async updateProductSystem(
        entityRef: string,
        updates: Partial<
            Pick<ProductSystemRow, 'title' | 'description' | 'owner'>
        >,
    ): Promise<boolean> {
        if (Object.keys(updates).length === 0) {
            return this.productSystemExists(entityRef);
        }
        const count = await this.knex<ProductSystemRow>('product_systems')
            .where({ entity_ref: entityRef })
            .update(updates);
        return count > 0;
    }

    async listPinnedProductsSet(userEntityRef: string): Promise<Set<string>> {
        const refs = await this.listPinnedProducts(userEntityRef);
        return new Set(refs);
    }

    async deleteOverridesByProduct(productEntityRef: string): Promise<void> {
        await this.knex<ManualOverrideRow>('manual_overrides')
            .where({ product_entity_ref: productEntityRef })
            .delete();
    }

    async deletePinsByProduct(productEntityRef: string): Promise<void> {
        await this.knex<UserPinRow>('user_pins')
            .where({ product_entity_ref: productEntityRef })
            .delete();
    }
}
