# ldap-notifications

Backend module that periodically scans the catalog for users tagged `ldap-not-found`,
groups them by team, resolves affected product listings, and sends one batched
notification per team.

- Defaults to `ldapNotifications.dryRun: true` (logs only, does not call
  `notificationService.send`)
- Pair with the email processor `stream` transport so no real emails are sent
  even when dry-run is disabled
