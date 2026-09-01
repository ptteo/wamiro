
# WAMIRO — OPEN-SOURCE PROVIDER REGISTRY
## Free-Forever / Self-Hosted-First Selection Rules

---

# 1. HARD COST RULE

For the core platform:

```text
No required paid API
No required SaaS subscription
No required free trial
No required vendor free tier
```

The expected recurring cost is:

```text
deployment/infrastructure
```

plus optional support/commercial costs chosen later.

---

# 2. LICENSE RULE

For every dependency record:

```text
Name
Repository
Exact version
License
Deployment model
Integration model
Commercial implications
Modification implications
Trademark considerations
Replacement plan
```

Open source is not synonymous with unrestricted commercial redistribution.

---

# 3. PROVIDER CANDIDATES

| Domain | Candidate | Role in Wamiro | Integration style | Must verify before adoption |
|---|---|---|---|---|
| Identity | Keycloak | Identity/SSO/MFA | API/OIDC/SAML | version/license |
| HR | Frappe HR | HR engine | REST/API | GPL obligations |
| ERP/Finance | ERPNext | ERP/finance/procurement | API | GPL/trademark |
| Work | OpenProject | projects/tasks/Gantt | API | license/commercial deployment |
| ITSM | GLPI | ITSM/assets/inventory | API | license/version |
| Helpdesk | Zammad | tickets/support | API | AGPL/license |
| Documents | Paperless-ngx | document archive/OCR | API | GPL/license |
| Files | Nextcloud | collaboration/files | API | license/app ecosystem |
| Knowledge | Wiki.js | wiki/knowledge | API | license/current project status |
| Knowledge | BookStack | documentation | API | license/current status |
| BI | Metabase | analytics/BI | API/embedding | exact edition/license |
| Scheduling | Cal.com | booking/scheduling | API | current license |
| Surveys | Formbricks | surveys/feedback | API | current license |
| Search | Meilisearch | search engine | API | current license/version |
| Storage | MinIO | object storage | S3 API | current license/version |
| Chat | Matrix/Synapse | messaging | API | hosting/ops burden |
| Telemetry | OpenTelemetry | observability | SDK | implementation effort |

---

# 4. DO NOT USE AS CORE DEPENDENCY

Avoid making these required for the self-hosted core:

```text
paid OpenAI API
paid Anthropic API
paid Pinecone
paid Algolia
paid Auth0
paid SendGrid
paid Twilio
paid Resend
paid Sentry
paid Datadog
paid Segment
```

Wamiro must have a self-hosted path.

---

# 5. PROVIDER ABSTRACTION

Every external domain gets:

```text
Wamiro domain service
↓
provider interface
↓
provider adapter
```

Examples:

```text
HrProvider
ProjectProvider
SupportProvider
AssetProvider
DocumentProvider
AnalyticsProvider
CalendarProvider
IdentityProvider
```

The UI never talks directly to provider APIs.

---

# 6. FALLBACK

Every critical provider must have:

```text
health
retry
timeout
fallback
manual reconnect
reconciliation
audit
```

Where total provider replacement is realistic, document the alternative.

---

# 7. FINAL PROVIDER SELECTION CRITERIA

Score:

```text
30% capability
20% license/commercial safety
15% API quality
10% reliability
10% maintenance/community
5% performance
5% deployment simplicity
5% replaceability
```

No provider is accepted solely because it is popular.

