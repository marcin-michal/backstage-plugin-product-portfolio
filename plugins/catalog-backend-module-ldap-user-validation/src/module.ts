import {
    coreServices,
    createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { LdapUserValidationProcessor } from './LdapUserValidationProcessor';

export const catalogModuleLdapUserValidation = createBackendModule({
    pluginId: 'catalog',
    moduleId: 'ldap-user-validation',
    register(reg) {
        reg.registerInit({
            deps: {
                catalog: catalogProcessingExtensionPoint,
                logger: coreServices.logger,
                rootConfig: coreServices.rootConfig,
            },
            async init({ catalog, logger, rootConfig }) {
                const ldapUrl =
                    rootConfig.getOptionalString('pyxis.ldap.url') ??
                    'ldap://ldap.corp.redhat.com';
                const ldapUserBase =
                    rootConfig.getOptionalString('pyxis.ldap.userBase') ??
                    'ou=users,dc=redhat,dc=com';

                catalog.addProcessor(
                    new LdapUserValidationProcessor(
                        { ldapUrl, ldapUserBase },
                        logger,
                    ),
                );

                logger.info('LDAP user validation processor registered');
            },
        });
    },
});
