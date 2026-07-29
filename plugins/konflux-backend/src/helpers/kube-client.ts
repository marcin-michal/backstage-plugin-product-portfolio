type KubeClientModule = typeof import('@kubernetes/client-node');

let cachedModule: Promise<KubeClientModule> | undefined;

export const getKubeClient = async (): Promise<KubeClientModule> => {
    cachedModule ??= import('@kubernetes/client-node');
    return cachedModule;
};

export type {
    ConfigurationOptions,
    CustomObjectsApi,
    KubeConfig,
    ObservableMiddleware,
} from '@kubernetes/client-node';
