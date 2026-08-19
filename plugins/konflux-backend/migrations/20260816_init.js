/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
    await knex.schema.createTable('konflux_applications', table => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid());
        table.string('cluster').notNullable();
        table.string('namespace').notNullable();
        table.string('name').notNullable();
        table.string('display_name').nullable();
        table.integer('component_count').notNullable().defaultTo(0);
        table.string('created_at').nullable();
        table.string('synced_at').notNullable();
        // K8s-assigned UID
        table.string('uid').notNullable().unique();
    });

    await knex.schema.createTable('konflux_components', table => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid());
        table.string('cluster').notNullable();
        table.string('namespace').notNullable();
        table.string('name').notNullable();
        table.string('application_name').notNullable();
        table.string('container_image').nullable();
        table.string('source_url').nullable();
        table.string('synced_at').notNullable();
        // K8s-assigned UID
        table.string('uid').notNullable().unique();
    });

    await knex.schema.createTable('rpa_mappings', table => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid());
        table.string('cluster').notNullable();
        table.string('managed_namespace').notNullable();
        table.string('rpa_name').notNullable();
        table.string('origin_namespace').notNullable();
        table.string('application_name').notNullable();
        table.string('component_name').notNullable();
        table.string('target_repository').notNullable();
        table.string('synced_at').notNullable();
        table.unique([
            'cluster',
            'managed_namespace',
            'rpa_name',
            'component_name',
        ]);
    });

    await knex.schema.createTable('product_systems', table => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid());
        table.string('entity_ref').notNullable().unique();
        table.string('name').notNullable();
        table.string('namespace').notNullable().defaultTo('default');
        table.string('title').nullable();
        table.text('description').nullable();
        table.string('owner').notNullable();
        table
            .enu('source', ['auto_discovered', 'manual'])
            .notNullable()
            .defaultTo('manual');
        table.string('pyxis_product_listing_id').nullable();
        table.string('created_at').notNullable();
        table.string('created_by').nullable();
    });

    await knex.schema.createTable('user_pins', table => {
        table.string('user_entity_ref').notNullable();
        table.string('product_entity_ref').notNullable();
        table.string('pinned_at').notNullable();
        table.primary(['user_entity_ref', 'product_entity_ref']);
    });

    await knex.schema.createTable('manual_overrides', table => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid());
        table.string('product_entity_ref').notNullable();
        table
            .enu('override_type', [
                'add_konflux',
                'remove_konflux',
                'add_pyxis',
                'remove_pyxis',
            ])
            .notNullable();
        table.string('resource_key').notNullable();
        table.string('created_by').nullable();
        table.string('created_at').notNullable();
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('manual_overrides');
    await knex.schema.dropTableIfExists('user_pins');
    await knex.schema.dropTableIfExists('product_systems');
    await knex.schema.dropTableIfExists('rpa_mappings');
    await knex.schema.dropTableIfExists('konflux_components');
    await knex.schema.dropTableIfExists('konflux_applications');
};
