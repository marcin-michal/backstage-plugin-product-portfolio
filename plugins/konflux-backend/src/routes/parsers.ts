import {
    KonfluxResourceBinding,
    NamespaceMapping,
    ProductConfigWriteRequest,
    PyxisBinding,
} from '@internal/backstage-plugin-konflux-common';
import { ClusterTokens } from '../services/konflux-service';

const KONFLUX_TOKENS_HEADER = 'x-konflux-tokens';

/**
 * Parse the X-Konflux-Tokens header (JSON map of clusterId -> token).
 */
export function parseTokensHeader(
    headers: Record<string, string | string[] | undefined>,
): ClusterTokens {
    const raw = headers[KONFLUX_TOKENS_HEADER];
    if (!raw || typeof raw !== 'string') {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const tokens: ClusterTokens = {};
            for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === 'string' && value.trim()) {
                    tokens[key] = value.trim();
                }
            }
            return tokens;
        }
    } catch {
        // fall through
    }
    return {};
}

export function parseNamespacesQuery(
    raw: unknown,
): NamespaceMapping[] | undefined {
    if (typeof raw !== 'string') {
        return undefined;
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return undefined;
        }

        const mappings = parsed.filter(
            (item): item is NamespaceMapping =>
                !!item &&
                typeof item === 'object' &&
                typeof (item as NamespaceMapping).cluster === 'string' &&
                typeof (item as NamespaceMapping).namespace === 'string',
        );

        return mappings.length > 0 ? mappings : undefined;
    } catch {
        return undefined;
    }
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function parseKonfluxBindings(
    raw: unknown,
): KonfluxResourceBinding[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }

    const bindings: KonfluxResourceBinding[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') {
            return undefined;
        }

        const record = item as Record<string, unknown>;
        if (
            !isNonEmptyString(record.cluster) ||
            !isNonEmptyString(record.namespace) ||
            !isNonEmptyString(record.application)
        ) {
            return undefined;
        }

        const binding: KonfluxResourceBinding = {
            cluster: record.cluster.trim(),
            namespace: record.namespace.trim(),
            application: record.application.trim(),
        };

        if (record.snapshot && typeof record.snapshot === 'object') {
            const snapshot = record.snapshot as Record<string, unknown>;
            if (!isNonEmptyString(snapshot.fetchedAt)) {
                return undefined;
            }

            binding.snapshot = {
                fetchedAt: snapshot.fetchedAt,
                displayName: isNonEmptyString(snapshot.displayName)
                    ? snapshot.displayName
                    : undefined,
                creationTimestamp: isNonEmptyString(snapshot.creationTimestamp)
                    ? snapshot.creationTimestamp
                    : undefined,
                componentCount:
                    typeof snapshot.componentCount === 'number'
                        ? snapshot.componentCount
                        : undefined,
            };
        }

        bindings.push(binding);
    }

    return bindings;
}

function parsePyxisBindings(raw: unknown): PyxisBinding[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }

    const bindings: PyxisBinding[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') {
            return undefined;
        }

        const record = item as Record<string, unknown>;
        if (!isNonEmptyString(record.entityRef)) {
            return undefined;
        }

        bindings.push({
            entityRef: record.entityRef.trim(),
            label: isNonEmptyString(record.label)
                ? record.label.trim()
                : undefined,
        });
    }

    return bindings;
}

export function parseWriteBody(
    body: unknown,
): ProductConfigWriteRequest | { error: string } {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'Request body must be a JSON object' };
    }

    const record = body as Record<string, unknown>;
    const konfluxBindings = parseKonfluxBindings(record.konfluxBindings);
    if (!konfluxBindings) {
        return {
            error: 'konfluxBindings must be an array of { cluster, namespace, application }',
        };
    }

    const pyxisBindings = parsePyxisBindings(record.pyxisBindings);
    if (!pyxisBindings) {
        return {
            error: 'pyxisBindings must be an array of { entityRef, label? }',
        };
    }

    return { konfluxBindings, pyxisBindings };
}

/** Backstage entity name: lowercase alphanumeric with internal hyphens. */
const ENTITY_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function parseCreateProductBody(body: unknown):
    | {
          name: string;
          namespace: string;
          title?: string;
          description?: string;
          owner: string;
      }
    | { error: string } {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'Request body must be a JSON object' };
    }

    const record = body as Record<string, unknown>;
    const name =
        typeof record.name === 'string' ? record.name.trim().toLowerCase() : '';
    if (!name || !ENTITY_NAME_PATTERN.test(name)) {
        return {
            error: 'name is required and must be a lowercase Backstage entity name (e.g. my-product)',
        };
    }

    const namespace =
        typeof record.namespace === 'string' && record.namespace.trim()
            ? record.namespace.trim().toLowerCase()
            : 'default';
    if (!ENTITY_NAME_PATTERN.test(namespace)) {
        return {
            error: 'namespace must be a valid Backstage entity namespace',
        };
    }

    const owner =
        typeof record.owner === 'string' && record.owner.trim()
            ? record.owner.trim()
            : 'group:default/guests';

    return {
        name,
        namespace,
        title:
            typeof record.title === 'string' && record.title.trim()
                ? record.title.trim()
                : undefined,
        description:
            typeof record.description === 'string' && record.description.trim()
                ? record.description.trim()
                : undefined,
        owner,
    };
}

/**
 * Build a canonical entity ref from route params.
 * Matches Backstage's `kind:namespace/name` form (kind lowercased).
 */
export function entityRefFromParams(params: {
    kind: string;
    namespace: string;
    name: string;
}): string {
    return `${params.kind.toLowerCase()}:${params.namespace}/${params.name}`;
}
