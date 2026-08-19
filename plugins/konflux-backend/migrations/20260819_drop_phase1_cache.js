/**
 * Drop unused Phase 1 cache tables. Catalog providers and the matching
 * processor own this data now.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
    await knex.schema.dropTableIfExists('rpa_mappings');
    await knex.schema.dropTableIfExists('konflux_components');
    await knex.schema.dropTableIfExists('konflux_applications');
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
    await knex.schema.createTable('konflux_applications', table => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid());
        table.string('cluster').notNullable();
        table.string('namespace').notNullable();
        table.string('name').notNullable();
        table.string('display_name').nullable();
        table.integer('component_count').notNullable().defaultTo(0);
        table.string('created_at').nullable();
        table.string('synced_at').notNullable();
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
};
