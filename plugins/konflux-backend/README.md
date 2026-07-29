# Konflux backend plugin

On-demand fetching of Konflux Applications and Components using per-cluster
user tokens (token-paste auth).

## Namespace discovery

Matches Konflux UI tenancy:

1. `GET /api/v1/namespaces?labelSelector=konflux-ci.dev/type=tenant`
2. Fallback: OpenShift Projects with the same label selector

Only those tenant namespaces are queried for Applications/Components.
`403`/`404` per namespace are skipped quietly. Entity annotation
`konflux-ci.dev/namespaces` can further narrow to a product.

## Endpoints

| Method | Path                                   | Auth                        |
| ------ | -------------------------------------- | --------------------------- |
| GET    | `/api/konflux/clusters`                | Backstage user session      |
| GET    | `/api/konflux/projects`                | + `X-Konflux-Tokens` header |
| GET    | `/api/konflux/resources/:resourceType` | + `X-Konflux-Tokens` header |

`resourceType` is `applications` or `components`. Query params: `cluster`,
`namespace`, `search`, `limit`, `continue`, `namespaces` (JSON mappings).

## Config

```yaml
konflux:
    clusters:
        cluster1:
            name: Production
            apiUrl: https://api.example.com:6443
            consoleUrl: https://console-openshift-console.apps.example.com
            kubearchiveApiUrl: https://kubearchive.apps.example.com # optional
```
