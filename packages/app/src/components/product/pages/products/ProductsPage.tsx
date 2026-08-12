import { useMemo, useState } from 'react';
import {
    Button,
    Chip,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { catalogApiRef, entityRouteRef } from '@backstage/plugin-catalog-react';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
    ManagedProduct,
    ProductDefinition,
} from '@internal/backstage-plugin-konflux-common';
import { useManagedProducts } from '../../hooks/product/useManagedProducts';
import { QueryClientBoundary } from '../../shared/QueryClientBoundary';
import { CreateProductDialog } from './CreateProductDialog';
import { useProductsStyles } from './products.styles';

const ProductsPageContent = () => {
    const classes = useProductsStyles();
    const catalogApi = useApi(catalogApiRef);
    const navigate = useNavigate();
    const entityRoute = useRouteRef(entityRouteRef);

    const {
        products: allProducts,
        loading,
        error,
        refetch,
    } = useManagedProducts();
    const [localError, setLocalError] = useState<string>();
    const [search, setSearch] = useState('');
    const [createOpen, setCreateOpen] = useState(false);

    const products: ManagedProduct[] = useMemo(() => {
        const term = search.trim().toLowerCase();
        return allProducts
            .filter(product => {
                if (!term) {
                    return true;
                }
                const title = (product.title ?? product.name).toLowerCase();
                const name = product.name.toLowerCase();
                const description = (product.description ?? '').toLowerCase();
                return (
                    title.includes(term) ||
                    name.includes(term) ||
                    description.includes(term)
                );
            })
            .sort((a, b) =>
                (a.title ?? a.name).localeCompare(b.title ?? b.name),
            );
    }, [allProducts, search]);

    const displayError = localError ?? error?.message;

    const handleCreated = async (product: ProductDefinition) => {
        setCreateOpen(false);
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 500));
            try {
                const entity = await catalogApi.getEntityByRef(
                    product.entityRef,
                );
                if (entity) {
                    const path = entityRoute({
                        name: entity.metadata.name,
                        kind: entity.kind,
                        namespace: entity.metadata.namespace ?? 'default',
                    });
                    navigate(path);
                    return;
                }
            } catch {
                // not ready yet
            }
        }
        refetch();
        setLocalError(
            `Product "${product.name}" was created but is not in the catalog yet. Refresh in a few seconds.`,
        );
    };

    return (
        <div className={classes.root}>
            <div className={classes.headerRow}>
                <div>
                    <Typography variant="h4">Products</Typography>
                    <Typography variant="body1" color="textSecondary">
                        Product Systems in the catalog. Create a product, then
                        open it to compose Konflux Applications and Pyxis
                        listings on the Product tab.
                    </Typography>
                </div>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setCreateOpen(true)}
                >
                    Create Product
                </Button>
            </div>

            <div className={classes.filters}>
                <TextField
                    label="Search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Filter products…"
                    variant="outlined"
                    size="small"
                />
                <Button variant="text" onClick={() => refetch()}>
                    Refresh
                </Button>
            </div>

            {displayError && (
                <Alert
                    severity="error"
                    onClose={() => setLocalError(undefined)}
                >
                    {displayError}
                </Alert>
            )}

            {loading && <CircularProgress size={28} />}

            {!loading && products.length === 0 && (
                <Alert severity="info">
                    No products found. Create one to get started.
                </Alert>
            )}

            {!loading && products.length > 0 && (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Product</TableCell>
                            <TableCell>Owner</TableCell>
                            <TableCell>Composition</TableCell>
                            <TableCell>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {products.map(product => {
                            const title = product.title ?? product.name;
                            const path = entityRoute({
                                name: product.name,
                                kind: 'System',
                                namespace: product.namespace,
                            });

                            return (
                                <TableRow key={product.entityRef}>
                                    <TableCell>
                                        <Typography variant="subtitle2">
                                            {title}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            color="textSecondary"
                                        >
                                            {product.entityRef}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{product.owner}</TableCell>
                                    <TableCell>
                                        {product.composed ? (
                                            <Chip
                                                size="small"
                                                color="primary"
                                                label="Composed"
                                            />
                                        ) : (
                                            <Chip
                                                size="small"
                                                variant="outlined"
                                                label="Not composed"
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            size="small"
                                            color="primary"
                                            variant={
                                                product.composed
                                                    ? 'outlined'
                                                    : 'contained'
                                            }
                                            component={RouterLink}
                                            to={path}
                                        >
                                            {product.composed
                                                ? 'Open'
                                                : 'Compose'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}

            <CreateProductDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={handleCreated}
            />
        </div>
    );
};

/**
 * Lists product Systems and lets users create new ones.
 * Composition (Konflux/Pyxis bindings) is done on each product's Product tab.
 */
export const ProductsPage = () => {
    return (
        <QueryClientBoundary>
            <ProductsPageContent />
        </QueryClientBoundary>
    );
};
