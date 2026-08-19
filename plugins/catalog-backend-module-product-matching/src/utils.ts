import { createHash } from 'crypto';

export interface EntityRefParts {
    kind: string;
    namespace: string;
    name: string;
}

/**
 * Parse a full entity ref string such as `component:default/my-entity` into
 * its constituent parts for use in `processingResult.relation`.
 *
 * Falls back to kind=Component, namespace=default when the string does not
 * match the `kind:namespace/name` format.
 */
export function parseEntityRef(ref: string): EntityRefParts {
    const colonIdx = ref.indexOf(':');
    const slashIdx = ref.indexOf('/', colonIdx);

    if (colonIdx < 0 || slashIdx < 0) {
        return { kind: 'Component', namespace: 'default', name: ref };
    }

    return {
        kind: ref.slice(0, colonIdx),
        namespace: ref.slice(colonIdx + 1, slashIdx),
        name: ref.slice(slashIdx + 1),
    };
}

/**
 * Mirrors sanitizeEntityName() in
 * catalog-backend-module-konflux-provider/src/entity-mapper.ts.
 * Must stay in sync with that function.
 */
export function sanitizeEntityName(raw: string): string {
    const name = raw
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/[-_.]{2,}/g, '-')
        .replace(/^[-_.]|[-_.]$/g, '');

    if (!name) return 'unknown';
    if (name.length <= 63) return name;

    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 8);
    const prefix = name.slice(0, 54).replace(/[-_.]$/g, '');
    return `${prefix}-${hash}`;
}

/**
 * Mirrors sanitizeName() in
 * catalog-backend-module-pyxis-provider/src/entityHelpers.ts.
 * Must stay in sync with that function.
 */
export function sanitizePyxisName(input: string): string {
    return (
        input
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 63)
            .replace(/^-+|-+$/g, '') || 'unnamed'
    );
}
