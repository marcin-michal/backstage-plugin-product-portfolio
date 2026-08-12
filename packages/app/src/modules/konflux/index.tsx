import {
    createFrontendModule,
    PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import CategoryIcon from '@material-ui/icons/Category';

/**
 * Product System overview — resource composition (Konflux + Pyxis).
 * Replaces the default catalog Overview for Systems (see app-config filter).
 */
const productOverviewContent = EntityContentBlueprint.make({
    name: 'product-overview',
    params: {
        path: '/product',
        title: 'Product',
        filter: 'kind:system',
        loader: async () => {
            const { ProductCompositionTab } = await import(
                '../../components/product/entity/composition/ProductCompositionTab'
            );
            return <ProductCompositionTab />;
        },
    },
});

/**
 * Standalone Products page — list / create product Systems.
 */
const productsPage = PageBlueprint.make({
    name: 'products',
    params: {
        path: '/products',
        title: 'Products',
        icon: <CategoryIcon fontSize="inherit" />,
        loader: async () => {
            const { ProductsPage } = await import(
                '../../components/product/pages/products/ProductsPage'
            );
            return <ProductsPage />;
        },
    },
});

export const konfluxModule = createFrontendModule({
    pluginId: 'app',
    extensions: [productOverviewContent, productsPage],
});
