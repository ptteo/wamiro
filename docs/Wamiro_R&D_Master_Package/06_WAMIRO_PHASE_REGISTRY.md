# WAMIRO — MASTER PHASE REGISTRY
## Existing Design/Product Phases + New R&D/Productization Program

The existing phase documents are retained as the baseline. The new research program sits above them and can modify them when current research or repository evidence shows that a previous phase is incomplete.

## Existing phases

| Phase | Domain | Current purpose | Status for new program |
|---|---|---|---|
| D1 | Design foundation | Frappe-inspired visual system | Baseline; re-audit |
| D2 | People | Employee/people experience | Re-audit role/scoped UX |
| D3 | Work | Projects/tasks/goals | Re-audit provider boundaries |
| D4 | Requests | Requests/approvals/workflow | Re-audit orchestration |
| D5 | Knowledge/Documents/Communication | Workspace architecture and knowledge | Re-audit search/governance |
| D6 | Support/IT/Assets | IT/support operations | Re-audit provider abstraction |
| D7 | Analytics/Executive | Analytics and CEO UX | Re-audit role data scopes |
| D8 | AI | Contextual AI | Re-audit authorization and tool use |
| D9 | Administration/Security | Control plane | Re-audit platform vs tenant admin |
| D10 | Finalization | UI/UX/mobile/accessibility/performance | Re-run after architecture changes |
| D11 | Customer readiness | Productization/onboarding/deployment | Expand for 100-tenant readiness |
| D12 | Finance | Finance/procurement/business operations | Re-audit licensing and scopes |
| D13 | People/HR lifecycle | Recruitment/onboarding/performance/learning | Re-audit employee lifecycle |
| D14 | Workplace | Calendar/facilities/resources/visitors | Re-audit booking and privacy |
| D15 | Governance | Compliance/legal/risk | Re-audit governance and evidence |

## New R&D program

```text
R0  Forensics
R1  Product Strategy
R2  Multi-Tenant Identity
R3  Authorization
R4  Role Experiences
R5  Personalization
R6  Platform Services
R7  Domain Integrations
R8  Workflow / Automation
R9  Knowledge / Search
R10 AI / Agents
R11 Performance / Reliability
R12 100-Tenant Simulation
R13 Security / Privacy
R14 Customer Readiness
R15 Release Candidate
```

## Rule

The R-phases are not replacements for D1–D15.

They are the **research, correction and engineering program** that determines whether the existing D-phases are actually production-ready.

If an R-phase finds a D-phase gap:

```text
Gap
↓
Update affected D-phase specification
↓
Implement
↓
Test
↓
Record evidence
```
