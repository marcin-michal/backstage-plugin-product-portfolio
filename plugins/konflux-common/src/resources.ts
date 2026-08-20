import { PipelineRunLabel } from './pipeline-runs';
import type {
    K8sResourceCommon,
    K8sResourceCommonWithClusterInfo,
} from './types';

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
export function getApplicationFromResource(
    resource: K8sResourceCommonWithClusterInfo | undefined | null,
): string | undefined {
    if (!resource) {
        return undefined;
    }
    if (resource.kind === 'Application') {
        return resource.metadata?.name;
    }
    if (resource.kind === 'PipelineRun' || resource.kind === 'Release') {
        return (
            resource.metadata?.labels?.[PipelineRunLabel.APPLICATION] ||
            readSpecString(resource, 'application')
        );
    }
    return readSpecString(resource, 'application');
}
