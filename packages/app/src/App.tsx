import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { navModule } from './modules/nav';
import { konfluxModule } from './modules/konflux';

export default createApp({
    features: [catalogPlugin, navModule, konfluxModule],
});
