import {
    coreServices,
    createBackendModule,
    readSchedulerServiceTaskScheduleDefinitionFromConfig,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { notificationService } from '@backstage/plugin-notifications-node';
import { LdapNotificationTask } from './LdapNotificationTask';

export const notificationsModuleLdapAlerts = createBackendModule({
    pluginId: 'notifications',
    moduleId: 'ldap-alerts',
    register(reg) {
        reg.registerInit({
            deps: {
                scheduler: coreServices.scheduler,
                catalog: catalogServiceRef,
                notifications: notificationService,
                auth: coreServices.auth,
                logger: coreServices.logger,
                rootConfig: coreServices.rootConfig,
            },
            async init({
                scheduler,
                catalog,
                notifications,
                auth,
                logger,
                rootConfig,
            }) {
                const config =
                    rootConfig.getOptionalConfig('ldapNotifications');
                const dryRun = config?.getOptionalBoolean('dryRun') ?? true;

                const schedule = config?.has('schedule')
                    ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
                          config.getConfig('schedule'),
                      )
                    : {
                          frequency: { hours: 6 },
                          timeout: { minutes: 5 },
                          initialDelay: { seconds: 30 },
                      };

                const task = new LdapNotificationTask({
                    catalog,
                    notifications,
                    auth,
                    logger,
                    dryRun,
                });

                await scheduler.scheduleTask({
                    id: 'ldap-notifications',
                    ...schedule,
                    fn: async () => {
                        await task.run();
                    },
                });

                logger.info(
                    `LDAP missing-user notification task registered (dryRun=${dryRun})`,
                );
            },
        });
    },
});
