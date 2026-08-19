/**
 * Normalize a container image repository string so that RPA target URLs and
 * Pyxis `repository` field values resolve to the same key for matching.
 *
 * The `create-pyxis-image` Konflux task maps staging repo names to production
 * registry paths when `rhPush=true`. This function reverses that mapping:
 *
 *   quay.io/redhat-prod/product----my-image
 *     -> product/my-image
 *
 *   registry.access.redhat.com/product/my-image
 *     -> product/my-image
 *
 * Pyxis ContainerRepository entities store the production form in the
 * `redhat.com/repository` annotation (e.g. `product/my-image`), so
 * normalizing the RPA target URL should yield the same string.
 */
export function normalizeRepo(repo: string): string {
    let r = repo.trim();

    r = r.replace(
        /^(quay\.io|registry\.access\.redhat\.com|registry\.redhat\.io)\//,
        '',
    );

    r = r.replace(/^redhat-(pending|prod)\//, '');

    // Convert Konflux separator conventions to path separators.
    // Four dashes (----) encode a slash between org and repo name.
    // Three dashes (---) encode a slash within a hierarchical path.
    r = r.replace(/----/g, '/').replace(/---/g, '/');

    return r.toLowerCase();
}
