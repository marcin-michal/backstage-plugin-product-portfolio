import { useMemo, useState } from 'react';
import {
    Button,
    Chip,
    CircularProgress,
    FormControlLabel,
    IconButton,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@material-ui/core';
import BookmarkIcon from '@material-ui/icons/Bookmark';
import BookmarkBorderIcon from '@material-ui/icons/BookmarkBorder';
import { Alert } from '@material-ui/lab';
import { catalogApiRef, entityRouteRef } from '@backstage/plugin-catalog-react';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
    ProductDefinition,
    ProductListItem,
} from '@internal/backstage-plugin-konflux-common';
import { useManagedProducts } from '../../hooks/product/useManagedProducts';
import { usePinProduct } from '../../hooks/product/usePinProduct';
import { useSyncStatus } from '../../hooks/product/useSyncStatus';
import { QueryClientBoundary } from '../../shared/QueryClientBoundary';
import { CreateProductDialog } from './CreateProductDialog';
import { useProductsStyles } from './products.styles';

const ProductsPageContent = () => {
    const classes = useProductsStyles();
    const catalogApi = useApi(catalogApiRef);
    const navigate = useNavigate();
    const entityRoute = useRouteRef(entityRouteRef);

    const [browseAll, setBrowseAll] = useState(false);
    const [search, setSearch] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [localError, setLocalError] = useState<string>();

    const {
        products: allProducts,
        loading,
        error,
        refetch,
    } = useManagedProducts({ pinned: browseAll ? undefined : true });
    const { data: syncStatus } = useSyncStatus();
    const { setPinned, pending: pinPending } = usePinProduct();

    const products: ProductListItem[] = useMemo(() => {
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
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 1000));
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
                    navigate(`${path}/product`);
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

    const handlePin = async (product: ProductListItem) => {
        try {
            await setPinned(product.entityRef, !product.pinned);
        } catch (e) {
            setLocalError(e instanceof Error ? e.message : String(e));
        }
    };

    const emptyMessage = browseAll
        ? 'No products found. Create one to get started.'
        : 'No pinned products. Turn on Browse all to find products and pin the ones you use.';

    return (
        <div className={classes.root}>
            <div className={classes.headerRow}>
                <div>
                    <Typography variant="h4">Products</Typography>
                    <Typography variant="body1" color="textSecondary">
                        Product Systems in the catalog. Create a product, then
                        open its Product tab to add Konflux applications and
                        Pyxis listings.
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
                <FormControlLabel
                    control={
                        <Switch
                            checked={browseAll}
                            onChange={e => setBrowseAll(e.target.checked)}
                            color="primary"
                        />
                    }
                    label="Browse all"
                />
            </div>

            {syncStatus && (
                <Typography variant="caption" color="textSecondary">
                    Catalog sync: {syncStatus.konfluxApplicationCount} Konflux
                    applications, {syncStatus.konfluxComponentCount} components,{' '}
                    {syncStatus.autoDiscoveredProductCount} auto-discovered
                    products, {syncStatus.manualProductCount} manual products
                </Typography>
            )}

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
                <Alert severity="info">{emptyMessage}</Alert>
            )}

            {!loading && products.length > 0 && (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Pin</TableCell>
                            <TableCell>Product</TableCell>
                            <TableCell>Owner</TableCell>
                            <TableCell>Source</TableCell>
                            <TableCell />
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
                                        <Tooltip
                                            title={
                                                product.pinned ? 'Unpin' : 'Pin'
                                            }
                                        >
                                            <IconButton
                                                size="small"
                                                aria-label={
                                                    product.pinned
                                                        ? 'Unpin product'
                                                        : 'Pin product'
                                                }
                                                onClick={() =>
                                                    void handlePin(product)
                                                }
                                                disabled={pinPending}
                                            >
                                                {product.pinned ? (
                                                    <BookmarkIcon fontSize="small" />
                                                ) : (
                                                    <BookmarkBorderIcon fontSize="small" />
                                                )}
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
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
                                        <Chip
                                            size="small"
                                            variant="outlined"
                                            label={
                                                product.source === 'manual'
                                                    ? 'Manual'
                                                    : 'Auto'
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            size="small"
                                            color="primary"
                                            variant="outlined"
                                            component={RouterLink}
                                            to={`${path}/product`}
                                        >
                                            Open
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
 * Lists product Systems and lets users create, pin, and open them.
 * Composition is edited on each product's Product tab.
 */
export const ProductsPage = () => {
    return (
        <QueryClientBoundary>
            <ProductsPageContent />
        </QueryClientBoundary>
    );
};
