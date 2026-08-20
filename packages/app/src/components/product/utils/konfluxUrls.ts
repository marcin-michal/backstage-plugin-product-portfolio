import { ClusterPublicInfo } from '@internal/backstage-plugin-konflux-common';

export const getKonfluxUIApplicationUrl = (
    uiUrl: string,
    namespace: string,
    applicationName: string,
): string =>
    `${uiUrl.replace(
        /\/+$/,
        '',
    )}/ns/${namespace}/applications/${applicationName}`;

export const getKonfluxUIComponentUrl = (
    uiUrl: string,
    namespace: string,
    applicationName: string,
    componentName: string,
): string =>
    `${getKonfluxUIApplicationUrl(
        uiUrl,
        namespace,
        applicationName,
    )}/components/${componentName}`;

export const getKonfluxUIPipelineRunUrl = (
    uiUrl: string,
    namespace: string,
    applicationName: string,
    pipelineRunName: string,
): string =>
    `${getKonfluxUIApplicationUrl(
        uiUrl,
        namespace,
        applicationName,
    )}/pipelineruns/${pipelineRunName}/`;

export const getKonfluxUIReleaseUrl = (
    uiUrl: string,
    namespace: string,
    applicationName: string,
    releaseName: string,
): string =>
    `${getKonfluxUIApplicationUrl(
        uiUrl,
        namespace,
        applicationName,
    )}/releases/${releaseName}/`;

export const clusterDisplayName = (
    clusters: ClusterPublicInfo[],
    clusterId: string,
): string => clusters.find(c => c.id === clusterId)?.name || clusterId;

export const clusterUiUrl = (
    clusters: ClusterPublicInfo[],
    clusterId: string,
): string | undefined => clusters.find(c => c.id === clusterId)?.uiUrl;
