import {
  AuthService,
  BackstageCredentials,
  LoggerService,
} from '@backstage/backend-plugin-api';
import {
  Entity,
  isUserEntity,
  stringifyEntityRef,
  UserEntity,
} from '@backstage/catalog-model';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { NotificationService } from '@backstage/plugin-notifications-node';

export interface LdapNotificationTaskOptions {
  catalog: CatalogService;
  notifications: NotificationService;
  auth: AuthService;
  logger: LoggerService;
  dryRun: boolean;
}

interface TeamNotificationBatch {
  teamName: string;
  teamEntityRef: string;
  missingUsers: UserEntity[];
  productListings: Entity[];
}

export class LdapNotificationTask {
  private readonly catalog: CatalogService;
  private readonly notifications: NotificationService;
  private readonly auth: AuthService;
  private readonly logger: LoggerService;
  private readonly dryRun: boolean;

  constructor(options: LdapNotificationTaskOptions) {
    this.catalog = options.catalog;
    this.notifications = options.notifications;
    this.auth = options.auth;
    this.logger = options.logger;
    this.dryRun = options.dryRun;
  }

  async run(): Promise<void> {
    this.logger.info('Starting LDAP missing-user notification scan');

    const credentials = await this.auth.getOwnServiceCredentials();

    const { items: users } = await this.catalog.getEntities(
      {
        filter: {
          kind: 'User',
          'metadata.tags': 'ldap-not-found',
        },
      },
      { credentials },
    );

    const missingUsers = users.filter(isUserEntity);

    if (missingUsers.length === 0) {
      this.logger.info('No users with tag `ldap-not-found` found, nothing to notify');
      return;
    }

    this.logger.info(
      `Found ${missingUsers.length} user(s) not found in LDAP`,
    );

    const batches = await this.buildTeamBatches(missingUsers, credentials);

    for (const batch of batches) {
      await this.notifyTeam(batch);
    }

    this.logger.info(
      `LDAP missing-user notification scan finished (${batches.length} team batch(es))`,
    );
  }

  private async buildTeamBatches(
    missingUsers: UserEntity[],
    credentials: BackstageCredentials,
  ): Promise<TeamNotificationBatch[]> {
    const usersByTeam = new Map<string, UserEntity[]>();

    for (const user of missingUsers) {
      const teams = user.spec?.memberOf ?? [];
      if (teams.length === 0) {
        this.logger.warn(
          `User ${stringifyEntityRef(user)} has no memberOf teams, skipping`,
        );
        continue;
      }

      for (const teamName of teams) {
        const existing = usersByTeam.get(teamName) ?? [];
        existing.push(user);
        usersByTeam.set(teamName, existing);
      }
    }

    const batches: TeamNotificationBatch[] = [];

    for (const [teamName, teamUsers] of usersByTeam.entries()) {
      const teamEntityRef = `group:default/${teamName}`;

      const { items: productListings } = await this.catalog.getEntities(
        {
          filter: {
            kind: 'Component',
            'spec.type': 'product-listing',
            'spec.owner': teamEntityRef,
          },
        },
        { credentials },
      );

      batches.push({
        teamName,
        teamEntityRef,
        missingUsers: teamUsers,
        productListings,
      });
    }

    return batches;
  }

  private async notifyTeam(batch: TeamNotificationBatch): Promise<void> {
    const listings = batch.productListings.map(
      listing => `${listing.metadata.name} (ID: ${listing.metadata.annotations?.['redhat.com/pyxis-id'] ?? '-'})`,
    );

    const title = `${batch.missingUsers.length} team member(s) not found in LDAP`;
    const description = [
      `The following member(s) of team "${batch.teamName}" could not be found in Red Hat LDAP:\n`,
      batch.missingUsers.map(user => `- ${user.spec.profile?.displayName}`).join('\n') || '- (none)',
      '',
      'Affected Pyxis product listing(s):\n',
      listings.map(name => `- ${name}`).join('\n') || '- (none)',
    ].join('\n');

    this.logger.info(
      `Would notify team "${batch.teamName}" (${batch.teamEntityRef}): ` +
        `missing=[${batch.missingUsers.map(user => `${user.spec.profile?.displayName}`).join(', ')}], ` +
        `products=[${listings.join(', ')}]`,
    );

    if (this.dryRun) {
      this.logger.info(
        `dryRun=true — skipping notificationService.send for ${batch.teamEntityRef}`,
      );
      return;
    }

    await this.notifications.send({
      recipients: {
        type: 'entity',
        entityRef: [batch.teamEntityRef, 'user:development/guest'],
      },
      payload: {
        title,
        description,
        link: `/catalog/default/group/${batch.teamName}`,
        severity: 'high',
        topic: 'ldap-user-validation',
      },
    });

    this.logger.info(
      `Sent LDAP missing-user notification to ${batch.teamEntityRef}`,
    );
  }
}
