import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';

/**
 * System entity "Konflux" tab.
 *
 * Standalone tab (ungrouped): configure via app-config if needed:
 *   - entity-content:app/konflux:
 *       config:
 *         group: false
 */
const konfluxEntityContent = EntityContentBlueprint.make({
    name: 'konflux',
    params: {
        path: 'konflux',
        title: 'Konflux',
        filter: 'kind:system',
        loader: async () => {
            const { KonfluxEntityTab } = await import(
                '../../components/konflux/KonfluxEntityTab'
            );
            return <KonfluxEntityTab />;
        },
    },
});

export const konfluxModule = createFrontendModule({
    pluginId: 'app',
    extensions: [konfluxEntityContent],
});
