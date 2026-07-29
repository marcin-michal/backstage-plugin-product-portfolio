import yaml from 'js-yaml';
import type { K8sResourceCommon, NamespaceMapping } from './types';

/**
 * Parse a `konflux-ci.dev/namespaces` annotation value (YAML or JSON list).
 */
export function parseNamespaceMappings(
    annotation: string | undefined,
): NamespaceMapping[] | undefined {
    if (!annotation?.trim()) {
        return undefined;
    }

    const tryParse = (value: unknown): NamespaceMapping[] | undefined => {
        if (!Array.isArray(value)) {
            return undefined;
        }
        const mappings = value.filter(
            (item): item is NamespaceMapping =>
                !!item &&
                typeof item === 'object' &&
                typeof (item as NamespaceMapping).cluster === 'string' &&
                typeof (item as NamespaceMapping).namespace === 'string',
        );
        return mappings.length > 0 ? mappings : undefined;
    };

    try {
        const fromJson = tryParse(JSON.parse(annotation));
        if (fromJson) {
            return fromJson;
        }
    } catch {
        // not JSON — try YAML
    }

    try {
        return tryParse(yaml.load(annotation));
    } catch {
        return undefined;
    }
}

function readSpecString(
    resource: K8sResourceCommon,
    key: string,
): string | undefined {
    const value = resource.spec?.[key];
    return typeof value === 'string' ? value : undefined;
}

/** @public */
export function getResourceDisplayName(
    resource: K8sResourceCommon,
): string | undefined {
    return readSpecString(resource, 'displayName');
}

/** @public */
export function getComponentApplication(
    resource: K8sResourceCommon,
): string | undefined {
    return readSpecString(resource, 'application');
}

/** @public */
export function getComponentGitUrl(
    resource: K8sResourceCommon,
): string | undefined {
    const source = resource.spec?.source;
    if (!source || typeof source !== 'object') {
        return undefined;
    }
    const git = (source as { git?: unknown }).git;
    if (!git || typeof git !== 'object') {
        return undefined;
    }
    const url = (git as { url?: unknown }).url;
    return typeof url === 'string' ? url : undefined;
}
