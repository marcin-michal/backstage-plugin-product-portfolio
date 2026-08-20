import { GroupVersionKind } from './types';

/** @public */
export const ApplicationGVK: GroupVersionKind = {
    apiVersion: 'v1alpha1',
    apiGroup: 'appstudio.redhat.com',
    kind: 'Application',
    plural: 'applications',
};

/** @public */
export const ComponentGVK: GroupVersionKind = {
    apiVersion: 'v1alpha1',
    apiGroup: 'appstudio.redhat.com',
    kind: 'Component',
    plural: 'components',
};

/** @public */
export const PipelineRunGVK: GroupVersionKind = {
    apiVersion: 'v1',
    apiGroup: 'tekton.dev',
    kind: 'PipelineRun',
    plural: 'pipelineruns',
};

/** @public */
export const ReleaseGVK: GroupVersionKind = {
    apiVersion: 'v1alpha1',
    apiGroup: 'appstudio.redhat.com',
    kind: 'Release',
    plural: 'releases',
};

/** @public */
export enum ModelsPlural {
    applications = 'applications',
    components = 'components',
    pipelineruns = 'pipelineruns',
    releases = 'releases',
}

/** @public */
export const konfluxResourceModels: Record<string, GroupVersionKind> = {
    [ModelsPlural.applications]: ApplicationGVK,
    [ModelsPlural.components]: ComponentGVK,
    [ModelsPlural.pipelineruns]: PipelineRunGVK,
    [ModelsPlural.releases]: ReleaseGVK,
};
