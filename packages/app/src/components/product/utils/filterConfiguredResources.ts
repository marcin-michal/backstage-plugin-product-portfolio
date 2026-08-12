import {
    KonfluxResource,
    KonfluxResourceBinding,
} from '@internal/backstage-plugin-konflux-common';
import { konfluxBindingKey } from './bindings';

export const filterConfiguredApplications = (
    resources: KonfluxResource[],
    bindings: KonfluxResourceBinding[],
): KonfluxResource[] => {
    const allowed = new Set(bindings.map(konfluxBindingKey));
    return resources.filter(item => {
        const cluster = item.cluster?.name;
        const namespace = item.metadata?.namespace;
        const name = item.metadata?.name;
        if (!cluster || !namespace || !name) return false;
        return allowed.has(
            konfluxBindingKey({ cluster, namespace, application: name }),
        );
    });
};
