/** @public */
export enum PipelineRunLabel {
    APPLICATION = 'appstudio.openshift.io/application',
    COMPONENT = 'appstudio.openshift.io/component',
    PIPELINE_TYPE = 'pipelines.appstudio.openshift.io/type',
}

/**
 * Kubernetes label selector that matches PipelineRuns/Releases for the given
 * Konflux application names.
 *
 * @public
 */
export function buildApplicationLabelSelector(
    applicationNames: string[],
): string | undefined {
    const unique = [
        ...new Set(applicationNames.map(name => name.trim()).filter(Boolean)),
    ];
    if (unique.length === 0) {
        return undefined;
    }
    if (unique.length === 1) {
        return `${PipelineRunLabel.APPLICATION}=${unique[0]}`;
    }
    return `${PipelineRunLabel.APPLICATION} in (${unique.join(', ')})`;
}
