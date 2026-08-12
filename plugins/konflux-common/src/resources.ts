import type { K8sResourceCommon } from './types';

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
