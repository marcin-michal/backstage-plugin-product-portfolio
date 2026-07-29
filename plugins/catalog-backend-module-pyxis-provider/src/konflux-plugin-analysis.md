# How the Konflux plugin works (implementation deep-dive)

This document explains, with exact file/line references, how the `konflux` /
`konflux-backend` / `konflux-common` plugins in this workspace fetch and
display data, and answers the specific questions raised while scoping the
["Feature Overview"](../../feature-overview.md) work:

1. Are user identities/ownership handled? Can a logged-in user see "their"
   resources?
2. How are Konflux resources (Kubernetes / Kubearchive) actually fetched? Is
   the set of resources hardcoded, or could it be made to reflect what a
   given user has access to?
3. Is fetching on-demand, or a scheduled catalog `EntityProvider` model?
4. Could Tekton Results also be plugged in as a third archive source?

All line numbers refer to the current state of the files under
`workspaces/konflux/plugins/`.

---

## 0. TL;DR

Konflux is **not** a catalog `EntityProvider`. It is a small **on-demand proxy/aggregator**:

-   The frontend calls a single backend route per Backstage catalog entity +
    resource type (`applications`, `components`, `pipelineruns`, `releases`).
-   The backend reads **which clusters/namespaces to query from an annotation
    on the Backstage entity itself** (`konflux-ci.dev/clusters`), not from a
    hardcoded list — but which _clusters exist at all_ (their URLs/tokens) **is**
    hardcoded in `app-config.yaml`.
-   For every request it fans out to the Kubernetes API (`CustomObjectsApi`) of
    each configured cluster, and — for `pipelineruns`/`releases` only — falls
    back to a Kubearchive REST endpoint once the live cluster's list is
    exhausted.
-   There is **no scheduler, no polling job, no persistent store, and no
    Backstage catalog integration** for these resources — nothing about
    Applications/Components/PipelineRuns/Releases ever becomes a catalog
    `Entity`. Only a thin 30-second in-memory cache exists to avoid duplicate
    catalog lookups within a burst of requests.
-   **There is no per-user ownership/RBAC filtering of _which_ resources are
    returned.** Any Backstage user who can view the catalog entity sees the
    exact same aggregated K8s data; identity is used only for authentication to
    the Kubernetes API (impersonation/OIDC) and for binding pagination tokens,
    not for scoping results.
-   **Tekton Results is not integrated at all.** Only Kubernetes live API +
    Kubearchive are implemented, and only for 2 of the 4 resource kinds.

---

## 1. Package layout

```
workspaces/konflux/plugins/
  konflux-common/     shared types, GVKs, config parsing helpers (isomorphic)
  konflux-backend/    Express router + services (Node-only, talks to K8s)
  konflux/            React frontend (entity page tabs/widgets)
workspaces/konflux/packages/
  app/                Demo Backstage app wiring SignInPage, App.tsx, entity page
  backend/            Demo Backstage backend wiring the konflux backend plugin
```

---

## 2. Request flow, end to end

```
Browser (entity page, e.g. Component "my-service")
   useApplications() / useComponents() / usePipelineruns() / useReleases()
     -> useKonfluxResource(resource)                         [plugins/konflux/src/hooks/useKonfluxResource.ts]
        discoveryApi.getBaseUrl('konflux')                                     (L163)
        GET {baseUrl}/entity/{entityRef}/resource/{resource}?...              (L112-128)
                │
                ▼
router.ts  GET /entity/:entityRef(*)/resource/:resource                       (L163-220)
   httpAuth.credentials(req, { allow: ['user'] })                             (L164)
   userInfo.getUserInfo(credentials) -> userEntityRef                         (L172)
   catalog.getEntityByRef(userEntityRef) -> spec.profile.email                (extractUserEmail, L47-77)
                │
                ▼
KonfluxService.aggregateResources(...)                                        [services/konflux-service.ts L256-451]
   catalog.getEntityByRef(entityRef)              -> Entity  (30s cache)      (L182-199, 281-288)
   getKonfluxConfig(config, entity, ...)          -> clusters+authProvider    (helpers/config.ts L144-178)
   determineClusterNamespaceCombinations(...)     -> [{cluster,namespace,applications}] (helpers/config.ts L180-231)
                │  (this reads the entity annotation `konflux-ci.dev/clusters`)
                ▼
   for each combination, in parallel (Promise.all, L366-385):
     ResourceFetcher.fetchFromSource(...)                                     [services/resource-fetcher.ts L436-490]
        1. fetchFromKubernetes()  -> CustomObjectsApi.listNamespacedCustomObjectWithHttpInfo (L180-191)
        2. if k8s page exhausted AND resource is pipelineruns/releases
           AND cluster has kubearchiveApiUrl configured
           -> fetchFromKubearchive() to fill remaining slots, dedup by name   (mergeKubearchiveResults, L359-419)
                │
                ▼
   aggregate + sort by creationTimestamp desc, encode continuationToken       (L393-420)
                │
                ▼
router.ts -> res.json(result)                                                 (L216)
```

The whole thing happens **synchronously inside the HTTP request** — there is
no background job producing this data ahead of time.

---

## 3. Are user entities/ownership handled? (Question 1)

**Short answer: identity is used for _authentication_, not for _authorization/filtering_. There is no "my resources" view.**

### 3.1 What identity information is captured

`router.ts`:

```163:180:workspaces/konflux/plugins/konflux-backend/src/router.ts
  router.get('/entity/:entityRef(*)/resource/:resource', async (req, res) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const { entityRef, resource } = req.params;
    ...
    try {
      const user = await userInfo.getUserInfo(credentials);
      const { email, userEntityRef } = await extractUserEmail(
        user.userEntityRef,
        catalog,
        credentials,
        konfluxLogger,
        entityRef,
        resource,
      );
```

-   `httpAuth.credentials(req, { allow: ['user'] })` (L164) rejects anonymous/service
    callers — a logged-in Backstage identity is required to hit the endpoint at all.
-   `userInfo.getUserInfo(credentials)` resolves the caller's `userEntityRef`
    (e.g. `user:default/jdoe`).
-   `extractUserEmail` (`router.ts` L47-77) looks up that **User** entity in the
    catalog and reads `spec.profile.email`.

### 3.2 What that identity is actually used for

The extracted `email` / `userEntityRef` flow into
`KonfluxService.aggregateResources(entityRef, resource, credentials, email, filters, oidcToken, userEntityRef)`
and are used for exactly three things — none of which filter _which_
resources come back:

| Use                           | Where                                                                                                                                                                                                     | Purpose                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cache key namespacing         | `konflux-service.ts` `userId = userEntityRef \|\| userEmail \|\| 'unknown'` (L279), used in cache keys `entity:{ref}:{userId}` / `config:{ref}:{userId}` / `combinations:{ref}:{userId}` (L187, 210, 237) | Prevents one user's catalog-read permissions/caches leaking into another user's cached lookups (defense-in-depth for `catalog.getEntityByRef` which is itself credential-scoped)                                                                                                                                                                 |
| Continuation-token binding    | `decodeContinuationToken(token, userId)` / `encodeContinuationToken(state, userId)` (L333-346, 419) in `helpers/pagination.ts`                                                                            | Stops a pagination token issued to user A being replayed by user B                                                                                                                                                                                                                                                                               |
| K8s auth (impersonation/OIDC) | `resource-fetcher.ts` `fetchFromKubernetes` L109-126, 151-157; `helpers/auth.ts` `getAuthToken`                                                                                                           | If `authProvider: impersonationHeaders`, sends `Impersonate-User: <email>` / `Impersonate-Group: system:authenticated` headers to the K8s API instead of the plain service-account token. If the _cluster's RBAC_ is configured to restrict what an impersonated user can `list`, this is the **only** point where per-user access could differ. |

**Nowhere** does the code filter the aggregated Application/Component/PipelineRun/Release list by "resources owned by this user" — there is no concept of ownership on these resource types at all (`K8sResourceCommonWithClusterInfo` in `konflux-common/src/types.ts` has no owner field), and no comparison against `spec.owner`/group membership like the Backstage catalog does for its own entities.

### 3.3 What the frontend shows — no "my resources" surface

Per the explore pass over `plugins/konflux/src`:

-   `KonfluxPage` (Konflux tab) → Applications + Components lists, scoped to
    the **currently viewed catalog entity's** annotated clusters/namespaces.
-   `KonfluxCIPage` (CI/CD tab) → PipelineRuns + derived Commits, same scope.
-   `EntityPage` overview widgets → Latest Releases + Status, same scope.
-   `identityApi` (Backstage's "who am I" frontend API) is **not used** anywhere
    in `plugins/konflux/src`. The only identity-adjacent frontend code is the
    OIDC id-token fetch (`useKonfluxResource.ts` L166-175), used purely as a
    bearer credential forwarded to the backend, not to filter/label data.

**Conclusion:** if you log in as different Backstage users today, and both
users can view the same catalog Component (subject to normal Backstage
catalog permissions), they see byte-for-byte identical Konflux data. There is
no per-user "resources I own" list anywhere in this plugin — everything is
scoped by **catalog entity**, not by **viewer identity**.

### 3.4 What exists in Backstage that this _could_ be built on

For your feature-overview use case (users should only see what they have
access to), the relevant building blocks already used elsewhere in this repo/Backstage are:

-   `coreServices.httpAuth` + `coreServices.userInfo` (already injected into
    `konfluxPlugin`, `plugin.ts` L24-32) — gives you the caller's
    `userEntityRef` for free in any route.
-   Backstage **ownership**: `catalogApi.getEntities` with
    `filter: { 'relations.ownedBy': ownershipEntityRefs }`, or
    `useEntityOwnership`/`EntityListProvider` on the frontend — this is how
    Backstage's own "My items" filters normally work, but konflux resources
    aren't catalog entities so this API doesn't apply to them directly unless
    you catalog them (see §6.3).
-   `@backstage/plugin-permission-node`/`-common` — the konflux backend
    currently registers **zero** permissions (`grep` for `permission` under
    `konflux-backend/src` only turns up the word inside comments/error
    strings). `app-config.yaml` (L109-114 of the demo app) does list
    `permission.rbac.pluginsWithPermission: [kubernetes]`, i.e. RBAC is wired
    for the _stock_ Kubernetes plugin, not for `konflux`.

---

## 4. How are Konflux resources fetched? Hardcoded vs. dynamic (Question 2)

Two different things are configured in two different places — this is the
crux of your question:

### 4.1 Hardcoded in `app-config.yaml`: which clusters exist and how to reach them

`config.d.ts` (backend schema):

```16:39:workspaces/konflux/plugins/konflux-backend/config.d.ts
export interface Config {
  /** @visibility backend */
  konflux?: {
    /** @visibility backend */
    authProvider?: 'serviceAccount' | 'oidc' | 'impersonationHeaders';
    /** @visibility backend */
    clusters?: {
      [key: string]: {
        /** @visibility backend */
        uiUrl?: string;
        /** @visibility backend */
        openshiftConsoleUrl?: string;
        /** @visibility backend */
        kubearchiveApiUrl?: string;
        /** @visibility backend */
        apiUrl?: string;
        /** @visibility secret */
        serviceAccountToken?: string;
      };
    };
  };
}
```

Example from the demo app (`workspaces/konflux/app-config.yaml` ~L95-106):

```yaml
konflux:
    authProvider: serviceAccount
    clusters:
        cluster1:
            apiUrl: ${CLUSTER_1_API_URL}
            uiUrl: ${CLUSTER_1_UI_URL}
            kubearchiveApiUrl: ${CLUSTER_1_KUBEARCHIVE_API_URL}
            serviceAccountToken: ${CLUSTER_1_SA_ACCOUNT_TOKEN}
        cluster2:
            apiUrl: ${CLUSTER_2_API_URL}
            uiUrl: ${CLUSTER_2_UI_URL}
            serviceAccountToken: ${CLUSTER_2_SA_ACCOUNT_TOKEN}
```

So: **the inventory of clusters (name → API URL → auth token) is static
config**, loaded once per backend process via `getKonfluxConfig`
(`helpers/config.ts` L144-178) each request (cheap, no network call — it's
just `config.getOptionalConfig('konflux')`).

Resource **kinds** (GVKs) are also hardcoded, in
`konflux-common/src/models.ts` L20-82 — `applications`, `components`,
`releases` (all `appstudio.redhat.com/v1alpha1`) and `pipelineruns`/`taskruns`
(`tekton.dev/v1`). Adding a new Konflux CRD type means adding a GVK entry
here plus a route/hook wiring — it is compiled into `konfluxResourceModels`
(`models.ts` L76-82) and looked up by string key in
`konflux-service.ts` L355 (`konfluxResourceModels[resource]`).

### 4.2 Dynamic, per catalog entity: which namespace/application to query

This part is **not** hardcoded — it comes from a YAML-in-annotation value on
the Backstage catalog entity (or its `subcomponentOf` children), read by
`getKonfluxConfig`/`determineClusterNamespaceCombinations`:

```81:142:workspaces/konflux/plugins/konflux-backend/src/helpers/config.ts
const extractComponentConfigsFromEntities = async (...) => {
  ...
  subcomponentEntities.forEach(e => {
    const annotations = e?.metadata?.annotations || {};
    const clusterConfigAnnotation = annotations[KONFLUX_CLUSTER_CONFIG];
    const clustersParsedYaml = parseEntityKonfluxConfig<...>(clusterConfigAnnotation);
    if (clustersParsedYaml) {
      const subcomponentName = e.metadata.name;
      clustersParsedYaml.forEach(clusterConfig => {
        if (clusterConfig.cluster && clusterConfig.namespace) {
          subcomponentConfigs.push({
            subcomponent: subcomponentName,
            cluster: clusterConfig.cluster,
            namespace: clusterConfig.namespace,
            applications: clusterConfig.applications || [],
          });
        }
      });
    }
  });
  return subcomponentConfigs;
};
```

The annotation (documented in the README) is `konflux-ci.dev/clusters`, e.g.:

```yaml
metadata:
    annotations:
        konflux-ci.dev/clusters: |
            - cluster: cluster1
              namespace: my-team-tenant
              applications: ["my-app", "my-app-2"]
```

`determineClusterNamespaceCombinations` (`helpers/config.ts` L180-231) then
resolves `subcomponentOf` relations (Backstage auto-generates `hasPart` on
the parent) so a parent Component's Konflux tab can aggregate across all its
subcomponents' cluster/namespace declarations, merging duplicate
`subcomponent:cluster:namespace` keys and unioning their `applications` lists.

**So to directly answer "is it just those hardcoded in the config":**

-   The **cluster connection details** (URL/token) — yes, fully static, from
    `app-config.yaml`.
-   The **namespace(s)/application(s) queried per entity** — no, that's
    per-entity metadata, already dynamic today.
-   What is fetched **within** a namespace — currently `label-selector.ts`
    (`buildLabelSelector`) can narrow by `component`/`application` labels, but
    there's no "give me everything this authenticated user's token/impersonated
    identity can list" mode; it always targets the specific
    `cluster+namespace` pairs declared on the entity.

### 4.3 Could it fetch "everything a given user has access to"?

Given the current architecture, two levels of change get you there, in
increasing order of effort:

1. **Smaller change — rely on K8s RBAC + impersonation, drop the namespace
   allowlist requirement.** Since `authProvider: impersonationHeaders`
   already forwards `Impersonate-User: <email>` to the K8s API
   (`resource-fetcher.ts` L151-157), a user's own K8s RBAC bindings already
   constrain what they can `list` _if you call `list` across all namespaces_
   instead of one. Today the code always calls
   `listNamespacedCustomObjectWithHttpInfo` for a specific namespace (`resource-fetcher.ts`
   L180-191) that's declared on the entity's annotation; K8s's
   `@kubernetes/client-node` also supports the cluster-scoped
   `listClusterCustomObjectWithHttpInfo` equivalent (list across all
   namespaces). You'd add a mode, driven by the entity's config (or a global
   toggle), that skips the namespace filter and instead relies on the
   impersonated user's RBAC to naturally narrow the result set to what they
   can see. You'd still need the cluster's `apiUrl`/token from `app-config.yaml`
   for connection, but the namespace scoping and hardcoded annotation
   requirement would become optional/discoverable rather than mandatory.
2. **Bigger change — a real "get me all Konflux resources I own" endpoint,
   decoupled from any catalog entity.** Add a new backend route (e.g.
   `GET /my-resources/:resource`) that does **not** take an `entityRef` at
   all — it would use `userInfo.getUserInfo` + impersonation to hit each
   configured cluster with `listClusterCustomObjectWithHttpInfo` (or
   namespace-scoped if Konflux tenant namespaces are derivable from the
   user's identity, e.g. `<username>-tenant` naming convention commonly used
   by Konflux/Kubearchive multi-tenant clusters), aggregate across clusters
   the same way `aggregateResources` does today, and skip the
   `catalog.getEntityByRef`/annotation-parsing steps entirely. This reuses
   `ResourceFetcherService`/`KubearchiveService` almost as-is — the part that
   needs replacing is the "how do I know which cluster+namespace to query"
   logic in `helpers/config.ts`, which for the entity-scoped flow reads
   annotations, but for a user-scoped flow would need either (a) K8s
   cluster-wide list + RBAC-driven filtering (option 1), or (b) a
   Konflux-side "which tenant namespaces does this user belong to" API if one
   exists (Konflux's own SSO/tenant model), or (c) a static mapping of
   Pyxis-team → tenant-namespace you maintain yourself, similar to how you
   already join Pyxis teams/products/repos.

For your feature-overview goal (join Konflux data with Pyxis products/teams,
gate visibility by product/team membership), option (c)-flavored approach is
likely most pragmatic short-term: keep using entity/annotation-scoped
aggregation as the data-fetch mechanism (it already works and is generic),
but add an authorization layer on top that checks "is this Pyxis team (or
Konflux RBAC group) that owns product X among the current user's teams?"
before returning/rendering data for that product — i.e., bolt visibility
control onto your new product-centric feature rather than rendering it inside
`konflux-backend`, which doesn't know about Pyxis/products at all.

---

## 5. Is fetching on-demand or scheduled (EntityProvider-style)? (Question 3)

**Purely on-demand, per HTTP request. No `EntityProvider`, no scheduler.**

Evidence:

-   `plugin.ts` (`konfluxPlugin`) only depends on `rootConfig`, `logger`,
    `httpRouter`, `httpAuth`, `catalog`, `userInfo` — **no**
    `coreServices.scheduler` dependency, unlike plugins that run periodic
    ingestion.
-   There is no file implementing Backstage's
    `CatalogEntityProvider`/`EntityProvider` interface anywhere under
    `workspaces/konflux` — the only place `catalog` is used is as a **read**
    client (`getEntityByRef`, `getEntitiesByRefs`), never to `applyMutation`/emit
    entities.
-   Every fetch happens inside the single Express handler
    (`router.ts` L163-220) triggered by the browser's React Query call.
-   The only caching is a 30-second in-process TTL cache
    (`konflux-service.ts` `CatalogCache`, L57-85) for catalog entity/config
    lookups — purely to deduplicate near-simultaneous requests for the _same
    entity_, not a data warehouse. A K8s API client cache also exists in
    `helpers/client-factory.ts` L30 (`clientCache`), but that only avoids
    re-establishing `KubeConfig`/TLS per request — it does not cache resource
    data.
-   Pagination is a stateless encode/decode of an opaque token
    (`helpers/pagination.ts`), not a stored cursor — nothing is persisted
    between requests server-side.

Practical implication: Applications/Components/PipelineRuns/Releases **never
show up as Backstage catalog entities** you could list/search/filter via
`catalogApi.getEntities()`; they only exist as JSON blobs returned from this
one aggregation endpoint, scoped to whatever catalog entity you're currently
viewing. If your feature-overview needs to _search across_ or _join_
Konflux resources independent of "which catalog entity page am I on" (which
sounds likely, given you want a cross-cluster/cross-namespace product view),
the current on-demand model is a poor fit as-is — see §6 for options.

---

## 6. Could Tekton Results also be fetched? (Question 4)

**Not today — Tekton Results has zero references anywhere in `workspaces/konflux`** (confirmed via workspace-wide search for `tekton-results`/`tektonResults`/`TektonResults` — no matches). Only two data sources exist:

1. **Live Kubernetes** (`resource-fetcher.ts` `fetchFromKubernetes`, L105-253) — always tried first, via `@kubernetes/client-node`'s `CustomObjectsApi.listNamespacedCustomObjectWithHttpInfo` (L180-191) against `clusterConfig.apiUrl`.
2. **Kubearchive** (`services/kubearchive-service.ts`, invoked from `resource-fetcher.ts` `fetchFromKubearchive`, L267-297) — used only as a fallback, and only for two resource kinds:

```72:75:workspaces/konflux/plugins/konflux-backend/src/services/resource-fetcher.ts
const AVAILABLE_KUBEARCHIVE_RESOURCES_TO_FETCH = new Set([
  'pipelineruns',
  'releases',
]);
```

and only when the cluster config has `kubearchiveApiUrl` set (`hasKubearchive`, L312-322) — interestingly, Kubearchive is implemented **using the same K8s `CustomObjectsApi` list call**, just pointed at a different base URL
(`client-factory.ts` `getOrCreateClient(..., useKubearchiveUrl = true)`, L120-158, which swaps in `clusterConfig.kubearchiveApiUrl` at L131-133) — Kubearchive exposes a Kubernetes-API-compatible interface for archived resources, so it slots into the exact same client machinery.

### 6.1 What it would take to add Tekton Results as a third source

Tekton Results has a different (REST/gRPC, not K8s-API-shaped) query
interface (`/apis/results.tekton.dev/v1alpha2/parents/{namespace}/results/...`,
supports CEL filters, not label selectors), so it can't reuse
`getOrCreateClient`'s `CustomObjectsApi` the way Kubearchive does. You would:

1. Add `tektonResultsApiUrl` (and possibly a separate token/auth mode) to
   `config.d.ts` (mirroring `kubearchiveApiUrl`, L30 in `config.d.ts`) and to
   the per-cluster config type in `konflux-common`.
2. Create a `TektonResultsService` sibling to `kubearchive-service.ts` that
   speaks Tekton Results' REST API (fetch with the CEL-style filter
   equivalent to the current `labelSelector`, and its own pagination-token
   format).
3. Extend `ResourceFetcherService.fetchFromSource` (`resource-fetcher.ts`
   L436-490) — currently a strict 2-source waterfall (K8s → Kubearchive) — to
   a 3-source waterfall (K8s → Kubearchive → Tekton Results), which means
   extending `SourcePaginationState` (L54-57, currently
   `{k8sToken?, kubearchiveToken?}`) with a third token field, and extending
   `mergeKubearchiveResults`-equivalent logic to also merge/dedupe Tekton
   Results items by name.
4. Extend `AVAILABLE_KUBEARCHIVE_RESOURCES_TO_FETCH`-style allowlist (or a new
   one) so only `pipelineruns` (Tekton Results primarily archives
   PipelineRuns/TaskRuns, not Konflux's `Application`/`Component`/`Release`
   CRDs) attempts the Tekton Results fallback.
5. Update `helpers/error-extraction.ts`'s `ClusterError.source` union
   (`'kubernetes' | 'kubearchive'`) to include `'tekton-results'` so error
   surfacing (`handleFetchError`, `konflux-service.ts` L543-590) stays
   accurate.

This is a moderate, self-contained addition — the existing waterfall pattern
(try live cluster, fall back to an archive once exhausted, dedupe by name)
generalizes cleanly to a third source; the main work is a new HTTP client
service plus widening a couple of type unions and the pagination-state shape.

---

## 7. Summary table: what's configurable vs. hardcoded vs. per-entity

| Aspect                                                                                          | Where it's defined                                                                                                | Static or dynamic                                                                           |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Which clusters exist, their API URL/UI URL/token                                                | `app-config.yaml` `konflux.clusters.*` (`config.d.ts` L16-39)                                                     | Hardcoded, backend-only, requires redeploy/restart to change                                |
| Auth strategy (`serviceAccount`/`oidc`/`impersonationHeaders`)                                  | `app-config.yaml` `konflux.authProvider`                                                                          | Hardcoded per deployment                                                                    |
| Which namespace(s)/app(s) an entity's Konflux tab queries                                       | Entity annotation `konflux-ci.dev/clusters` (`konflux-common` `consts.ts`, parsed in `helpers/config.ts` L81-142) | Dynamic, per catalog entity (and per subcomponent)                                          |
| Resource kinds available (`applications`, `components`, `pipelineruns`, `releases`, `taskruns`) | `konflux-common/src/models.ts` L20-82                                                                             | Hardcoded in code, requires a PR to extend                                                  |
| Data source priority (K8s → Kubearchive)                                                        | `resource-fetcher.ts` `fetchFromSource` L436-490                                                                  | Hardcoded logic, no Tekton Results                                                          |
| Page size                                                                                       | `PAGINATION_CONFIG.DEFAULT_PAGE_SIZE = 25` (`konflux-common`)                                                     | Hardcoded                                                                                   |
| Result scoping by viewer identity                                                               | —                                                                                                                 | **Not implemented** — identity used only for auth/impersonation and cache/token namespacing |
| Refresh model                                                                                   | On-demand per request; React Query `staleTime`/`gcTime` = 5 min (`useKonfluxResource.ts` L190-191)                | No scheduler/EntityProvider; nothing is pre-fetched or persisted                            |

---

## 8. Relevance to `feature-overview.md`

Given the plan in [`feature-overview.md`](../../feature-overview.md) to join
Pyxis products/repos/teams with Konflux data and eventually gate visibility
by access:

-   **Reuse, don't rebuild, the fetch mechanics.** `ResourceFetcherService` +
    `KubearchiveService` + `client-factory.ts` are a solid, already-working
    K8s/Kubearchive client layer; your new "products dashboard" backend can
    call into (or copy the pattern of) these rather than re-implement
    K8s-client-node wiring.
-   **The entity/annotation-scoping model won't directly serve a
    cross-cluster/cross-namespace "everything about product X" view**, since
    today's flow is anchored to one Backstage catalog entity's annotations. You
    likely want a new aggregation entry point keyed by **product** (from
    Pyxis) rather than by **catalog entityRef**, resolving to a set of
    cluster/namespace/application combinations either via (a) entity
    annotations if you model products as catalog entities, or (b) a
    Pyxis-product → Konflux-tenant mapping you maintain, or (c) K8s
    RBAC/impersonation-driven cluster-wide listing (§4.3 option 1).
-   **Access control ("users only see what they have access to") is currently
    absent** from Konflux's own plugin and would need to be added at your new
    feature's layer — either by checking Pyxis team membership (which you
    already fetch) before exposing a product's data, or by relying on
    Konflux/K8s RBAC via impersonation (`Impersonate-User`) so the underlying
    cluster naturally filters `list` results — the impersonation plumbing for
    that already exists in `resource-fetcher.ts` L151-157 and just needs to be
    turned on (`authProvider: impersonationHeaders`) and paired with
    cluster-wide (not namespace-scoped) list calls if you want RBAC to be the
    actual gate rather than the annotation-declared namespace allowlist.
-   **No scheduler/store today** means every product-overview page load would
    cascade into N cluster calls per resource kind per product's
    namespaces/apps; if you aggregate many products at once (e.g. a portfolio
    dashboard) you'll want to add a caching/materialization layer (or a real
    `EntityProvider`/scheduled ingestion job) rather than relying on Konflux's
    current fully-synchronous per-request model.
