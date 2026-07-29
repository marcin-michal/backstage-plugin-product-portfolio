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
export enum ModelsPlural {
    applications = 'applications',
    components = 'components',
}

/** @public */
export const konfluxResourceModels: Record<string, GroupVersionKind> = {
    [ModelsPlural.applications]: ApplicationGVK,
    [ModelsPlural.components]: ComponentGVK,
};
