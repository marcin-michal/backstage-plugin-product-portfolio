export interface Config {
    /** @visibility frontend */
    konflux?: {
        /** @visibility frontend */
        clusters?: {
            [key: string]: {
                /** Display name shown in the UI @visibility frontend */
                name?: string;
                /** OpenShift API URL @visibility frontend */
                apiUrl?: string;
                /** OpenShift console URL (for token paste link) @visibility frontend */
                consoleUrl?: string;
                /** Konflux UI base URL (for Open-in-Konflux links) @visibility frontend */
                uiUrl?: string;
                /** Optional KubeArchive API URL @visibility frontend */
                kubearchiveApiUrl?: string;
                /**
                 * Long-lived service token for this cluster (server-side only).
                 * Each cluster requires its own token.
                 * @visibility secret
                 */
                serviceToken?: string;
                /**
                 * Managed namespaces where ReleasePlanAdmissions live for this
                 * cluster. Used by KonfluxEntityProvider.
                 * @visibility backend
                 */
                managedNamespaces?: string[];
            };
        };
    };
}
