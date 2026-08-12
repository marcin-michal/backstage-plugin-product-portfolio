import {
    Sidebar,
    SidebarDivider,
    SidebarGroup,
    SidebarItem,
    SidebarScrollWrapper,
    SidebarSpace,
} from '@backstage/core-components';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { SidebarLogo } from './SidebarLogo';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import CategoryIcon from '@material-ui/icons/Category';
import { SidebarSearchModal } from '@backstage/plugin-search';
import { UserSettingsSignInAvatar } from '@backstage/plugin-user-settings';
import { NotificationsSidebarItem } from '@backstage/plugin-notifications';

export const SidebarContent = NavContentBlueprint.make({
    params: {
        component: ({ navItems }) => {
            const nav = navItems.withComponent(item => (
                <SidebarItem
                    icon={() => item.icon}
                    to={item.href}
                    text={item.title}
                />
            ));

            // Skipped items
            nav.take('page:search'); // Using search modal instead
            // Prefer an explicit Products link; consume the page extension if present
            // so it does not also appear under "rest".
            nav.take('page:app/products');
            nav.take('page:products');

            return (
                <Sidebar>
                    <SidebarLogo />
                    <SidebarGroup
                        label="Search"
                        icon={<SearchIcon />}
                        to="/search"
                    >
                        <SidebarSearchModal />
                    </SidebarGroup>
                    <SidebarDivider />
                    <SidebarGroup label="Menu" icon={<MenuIcon />}>
                        {nav.take('page:catalog')}
                        <SidebarItem
                            icon={CategoryIcon}
                            to="/products"
                            text="Products"
                        />
                        {nav.take('page:scaffolder')}
                        <SidebarDivider />
                        <SidebarScrollWrapper>
                            {nav.rest({ sortBy: 'title' })}
                        </SidebarScrollWrapper>
                    </SidebarGroup>
                    <SidebarSpace />
                    <SidebarDivider />
                    <NotificationsSidebarItem />
                    <SidebarDivider />
                    <SidebarGroup
                        label="Settings"
                        icon={<UserSettingsSignInAvatar />}
                        to="/settings"
                    >
                        {nav.take('page:app-visualizer')}
                        {nav.take('page:user-settings')}
                    </SidebarGroup>
                </Sidebar>
            );
        },
    },
});
