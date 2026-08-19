/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
    // Reverse index: normalized repo URL -> Konflux Application entity.
    // Populated while processing Konflux Application entities.
    await knex.schema.createTable('matching_repo_to_konflux', table => {
        table.string('normalized_repo').notNullable();
        table.string('entity_ref').notNullable();
        table.string('cluster').notNullable();
        table.string('namespace').notNullable();
        table.string('app_name').notNullable();
        table.string('updated_at').notNullable();
        table.primary(['normalized_repo', 'entity_ref']);
    });

    // Reverse index: normalized repo URL -> Pyxis ContainerRepository entity.
    // Populated while processing Pyxis container-repository entities.
    await knex.schema.createTable('matching_repo_to_pyxis', table => {
        table.string('normalized_repo').notNullable();
        table.string('entity_ref').notNullable();
        table.string('pyxis_id').notNullable();
        table.string('updated_at').notNullable();
        table.primary(['normalized_repo', 'entity_ref']);
    });

    // Listing -> repo membership: which Pyxis repo entity refs belong to each
    // product listing. Populated while processing product-listing entities
    // using spec.dependsOn, so no DB lookups are needed at write time.
    await knex.schema.createTable('matching_listing_repos', table => {
        table.string('listing_entity_ref').notNullable();
        table.string('repo_entity_ref').notNullable();
        table.primary(['listing_entity_ref', 'repo_entity_ref']);
    });

    // One row per Pyxis product listing, tracking the corresponding product
    // System entity ref and whether at least one Konflux app is matched.
    await knex.schema.createTable('matching_product_systems', table => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid());
        table.string('pyxis_listing_entity_ref').notNullable().unique();
        table.string('pyxis_listing_name').nullable();
        table.string('system_entity_ref').notNullable();
        table.boolean('has_konflux_match').notNullable().defaultTo(false);
        table.string('updated_at').notNullable();
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('matching_product_systems');
    await knex.schema.dropTableIfExists('matching_listing_repos');
    await knex.schema.dropTableIfExists('matching_repo_to_pyxis');
    await knex.schema.dropTableIfExists('matching_repo_to_konflux');
};
