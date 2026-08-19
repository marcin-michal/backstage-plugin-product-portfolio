import { createHash } from 'crypto';
import { Entity } from '@backstage/catalog-model';
import { K8sResource, RpaIndex } from './types';

/**
 * RPA-discovered target repositories (if any) are embedded as annotations so
 * the processor can match them against Pyxis container repositories
 * without a cross-plugin database lookup.
 */
export function toApplicationEntity(
    app: K8sResource,
    clusterId: string,
    componentCount: number,
    rpaIndex: RpaIndex,
): Entity {
    const ns = app.metadata?.namespace ?? '';
    const name = app.metadata?.name ?? '';
    const entityName = sanitizeEntityName(`${clusterId}-${ns}-${name}`);
    const displayName = (app.spec?.displayName as string) || name;

    const annotations: Record<string, string> = {
        'redhat.com/konflux-cluster': clusterId,
        'redhat.com/konflux-namespace': ns,
        'redhat.com/konflux-application': name,
        'redhat.com/konflux-uid': app.metadata?.uid ?? '',
        'redhat.com/konflux-component-count': String(componentCount),
        'backstage.io/managed-by-location': `konflux-provider:${clusterId}/${ns}/${name}`,
        'backstage.io/managed-by-origin-location': `konflux-provider:${clusterId}/${ns}/${name}`,
    };

    const rpaEntry = rpaIndex.get(`${ns}/${name}`);
    if (rpaEntry && rpaEntry.allRepos.length > 0) {
        annotations['redhat.com/konflux-rpa-target-repos'] = JSON.stringify(
            rpaEntry.allRepos,
        );
    }

    return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
            name: entityName,
            namespace: 'default',
            title: displayName,
            description: `Konflux Application ${name} in ${ns} on ${clusterId}`,
            annotations,
        },
        spec: {
            type: 'konflux-application',
            lifecycle: 'production',
            owner: 'group:default/guests',
        },
    };
}

export function toComponentEntity(
    comp: K8sResource,
    clusterId: string,
    rpaIndex: RpaIndex,
): Entity {
    const ns = comp.metadata?.namespace ?? '';
    const name = comp.metadata?.name ?? '';
    const appName = (comp.spec?.application as string) ?? '';
    const entityName = sanitizeEntityName(`${clusterId}-${ns}-${name}`);
    const parentEntityName = sanitizeEntityName(
        `${clusterId}-${ns}-${appName}`,
    );

    const annotations: Record<string, string> = {
        'redhat.com/konflux-cluster': clusterId,
        'redhat.com/konflux-namespace': ns,
        'redhat.com/konflux-component': name,
        'redhat.com/konflux-application': appName,
        'redhat.com/konflux-uid': comp.metadata?.uid ?? '',
        'backstage.io/managed-by-location': `konflux-provider:${clusterId}/${ns}/${name}`,
        'backstage.io/managed-by-origin-location': `konflux-provider:${clusterId}/${ns}/${name}`,
    };

    const rpaEntry = rpaIndex.get(`${ns}/${appName}`);
    const targetRepos = rpaEntry?.components.get(name);
    if (targetRepos && targetRepos.length > 0) {
        annotations['redhat.com/konflux-rpa-target-repos'] =
            JSON.stringify(targetRepos);
    }

    return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
            name: entityName,
            namespace: 'default',
            title: name,
            description: `Konflux Component ${name} (app: ${appName}) in ${ns} on ${clusterId}`,
            annotations,
        },
        spec: {
            type: 'konflux-component',
            lifecycle: 'production',
            owner: 'group:default/guests',
            subcomponentOf: `component:default/${parentEntityName}`,
        },
    };
}

/**
 * Produce a valid Backstage entity name (max 63 chars, segments of
 * `[a-zA-Z0-9]` separated by `[-_.]`, no leading/trailing separators).
 *
 * When the cleaned name exceeds 63 characters the result is a 54-char
 * prefix + `-` + 8-char SHA-256 hash, keeping it unique after truncation.
 */
export function sanitizeEntityName(raw: string): string {
    const name = raw
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/[-_.]{2,}/g, '-')
        .replace(/^[-_.]|[-_.]$/g, '');

    if (!name) {
        return 'unknown';
    }
    if (name.length <= 63) {
        return name;
    }

    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 8);
    const prefix = name.slice(0, 54).replace(/[-_.]$/g, '');

    return `${prefix}-${hash}`;
}
