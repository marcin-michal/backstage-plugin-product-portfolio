Feature Overview
Product teams, PMs, PgMs and release coordinators face a new problem in the Konflux world. How do they keep track and monitor their product portfolios that are distributed across multiple Konflux tenants and clusters and cross-reference the information from JIRA, Git or Catalog with what is happening in Konflux. How do they easily get answers for questions like:
Who owns a particular product, operator or container image on the Product Management and Engineering side?
What was released in the latest release?
Was this feature released already?
Are CVEs being remediated?
What is the current grade of my images?
In the classical pipeline, there was an Errata Tool or Comet, but there is no official Konflux tooling that would help with this aspect of product management and release planning & tracking.

This feature aims to address this gap by creating spiritual successors to Comet, Errata Tool and other tools. The tooling & dashboards created in this feature should provide a holistic view of the portfolio and abstract the users from the distributed nature of Konflux clusters and connect the data from Konflux with data from JIRA or Catalog.

The abstraction created by the RHDH tooling not only makes the lives of the users easier, but it enables workload distribution and tenant migrations between Konflux clusters.

Note: This feature is focused on PgMs, PMs and release engineers. If you are developer or workflow engineer that wants to have something similar, but catering to your needs, take a look at KONFLUX-8817 - Cross-cluster & cross-namespace high-level portfolio dashboard
Use Cases
Note: As of 8th of July 2026 we are done with the use-case gathering. I will analyze the use-cases and split them into features/sub-features as the scope of the use-cases is beyond one feature.
General
As a release engineer/PgM, I want to have a dashboard similar to the Release Monitor that is currently in the Konflux UI, but I want to see releases across namespaces and clusters.
As a release engineer, I want to group and filter finished or currently happening releases per CDN target (as it was in ET or pub), or more easily per Konflux release pipeline chosen, to see pushes separately to registry.redhat.io (rh-advisories or push-to-registry-redhat-io), quay.io (push-to-external-regisrty), Customer Portal & Content Gateway (push-artifacts-to-cdn), and others.
As a PgM/docs writer, I want visibility into which container images have been added or deprecated in a release.
As a PgM, I want to be able to see the container grade and be able to file a ticket to ENGCMP/affected team
As a PgM, I want to see the package/image owner, similar to how it is displayed in the Errata Tool.
As a PgM, I want to be able to filter the dashboard based on the team/product/image owner/state
As a TPM I want to see that a build has started and have an estimated time of completion.
As a TPM I want to be automatically notified if builds in my program are being delayed because of Outages, Konflux issues or if there is work required by my team to unblock the build.
As a TPM I want to be able to subscribe to notifications of releases that I’m monitoring, similar to how I used to be able to do this in Errata.
As a TPM/image owner I want to be able to see which component build has been released / state of the release pipeline triggered by the build.
As a PgM/release engineer I want to be able to see when the release has started and how long it is until the content is shipped live.
As a CSM/PgM I want to be able to see the release schedule for all RedHat products and I want this schedule to automatically adjust to any changes in the release dates.
As an Operator Portfolio Governance PM , I want the RHDH dashboard to display real-time compliance gate status (e.g., UBI-minimal, TLS profiles, OLMv1 adoption) across all tenants, so I can enforce program standards before major milestones like OpenShift 5.0.
As an Operator Portfolio Governance PM , I want to see an aggregated view of pipeline overrides and exceptions granted to specific BUs, so that I can maintain auditability without chasing down engineering teams in Slack.
As a Component PM delivering an operator shipped with OpenShift, I want to see a clear, automated "Readiness Checklist" on my component's RHDH page, so I know exactly which mandatory platform requirements (e.g., base image updates) my team still needs to satisfy.
As a Component PM delivering an operator shipped with OpenShift, I want the dashboard to flag precisely which Konflux pipeline gate blocked our build and provide the remediation steps, so my engineering team can quickly unblock our release velocity.
As a release engineer, I want to list specific pipeline jobs by name (from various release pipelines) - or to have succeed/fail statistics per job - to see repeating patterns for failures/outages - why and when they fail - time when started failing, stopped failing, or to see how many are run in parallel to ensure stability of the pipeline
As a Product Security Engineer and Release Engineer, I want to cross-reference image-level CVE data from compliance environment scans (such as monthly ACS ROSA-GovCloud scans) with component-level and operator-level ownership data.
I want to see a complete, aggregated directory of component and operator owners so Product Security can automatically route and file security vulnerability trackers directly to the accountable teams.
As a Product Security Engineer and Release Engineer, I want a visual mapping of shared components across the portfolio to determine the blast radius of a critical and important vulnerability, allowing me to instantly identify which other operators or downstream products are exposed to the same risk.
As a Product Security Engineer and FedRAMP Program Manager, I want to filter security advisories and track remediation progress based on the Development Group and QE Owner to ensure FedRAMP and Vulnerability SLA compliance down to the operator level.
In any of these above, as a Release Engineer (Sylvia Watts), I wish to have some pointers/links/hint to the Konflux configurations and owners
i.e Lets say I see that product shipped to Quay.IO but not to registri.IO, I would expect to see lst of all available portals/end points we have, and have some notes about it in one of the dashaboard, alongside some hint that saying ‘As defined in the Contrat Policy of the XXX product’
As a Project manager I would like to know what work scheduled for a particular release is already ready to be released (merged, tested)
As a Project manager I would like to know what CVEs we plan to remediate in the next release and which of these are ready to be released?
RHEL PgM
Z-Stream
Advisories / Errata
I want to group advisories by release.
I want to filter advisories by release date, release, state, Development Group, and QE Owner.
I want to see whether advisories have documentation approval.
I want to see the advisory type (RHSA, RHEA, RHBA).
Batches (if still applicable)
I want to move advisories into and out of batches.
I want to create, lock/unlock, and remove batches.
I want to change state of an advisory and drop any advisory (also the security ones and restricted ones)
I want to have the same permissions as I have now in the Errata Tool:
Management – Users with this role can view advisories.
PM – Users with this role can manage batches, create and update releases, and block advisories.
Access Embargoed – Users with this role can view embargoed content.
Y-stream
Create, edit and see ga and 0day batches - if applicable
See all the advisories under a major/minor release and their status including documentation approval, type of advisory see a package owner and QE owner
Drop an advisory including security one
Create filters
Operator Portfolio Program PgM
General Governance & Escalation

As an Operator Program Manager / Incident Response Coordinator, I want a centralized dashboard that maps distributed operator components to their designated Engineering, PM, and Product Security contacts.
As an Operator Program Manager, I want to see real-time container grades alongside active vulnerability scan data so I can immediately file a remediation ticket to the affected engineering or component team.
As an Operator Program Manager, I want to filter the portfolio dashboard by image owner, development group, or priority state to track compliance across the entire operator catalog.

Vulnerability Management Planning & Compliance (Product Security Sync)
I want to cross-reference image-level CVE data from compliance environment scans (such as monthly ACS ROSA-GovCloud scans) with component-level and operator-level ownership data.
I want to see a complete, aggregated directory of component and operator owners so Product Security can automatically route and file security vulnerability trackers directly to the accountable teams.
I want a visual mapping of shared components across the portfolio to determine the blast radius of a critical vulnerability, allowing me to instantly identify which other operators or downstream products are exposed to the same risk.
I want to filter security advisories and track remediation progress based on the Development Group and QE Owner to ensure FedRAMP and Vulnerability SLA compliance.
