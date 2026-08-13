/** Header carrying per-cluster user tokens from frontend to backend. */
/** @public */
export const KONFLUX_TOKENS_HEADER = 'x-konflux-tokens';

/** @public */
export const PAGINATION_CONFIG = {
    DEFAULT_PAGE_SIZE: 25,
} as const;

/** Default relative path for the product composition store. @public */
export const DEFAULT_PRODUCT_CONFIG_PATH = './konflux-product-configs.json';

/** Default relative path for user-created product System definitions. @public */
export const DEFAULT_PRODUCTS_PATH = './konflux-products.json';
