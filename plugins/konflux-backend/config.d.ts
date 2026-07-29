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
                /** Optional KubeArchive API URL @visibility frontend */
                kubearchiveApiUrl?: string;
            };
        };
    };
}
