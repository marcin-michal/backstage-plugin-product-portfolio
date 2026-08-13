export interface Config {
    /** @visibility frontend */
    konflux?: {
        /**
         * Product-portfolio store settings (not cluster-specific).
         * Path to the JSON file storing product compositions.
         * Defaults to `./konflux-product-configs.json` when unset.
         * @visibility backend
         */
        productConfigPath?: string;
        /**
         * Product-portfolio store settings (not cluster-specific).
         * Path to the JSON file storing user-created product System definitions.
         * Defaults to `./konflux-products.json` when unset.
         * @visibility backend
         */
        productsPath?: string;
        /** Konflux cluster connection settings. @visibility frontend */
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
