# WAMIRO — PHASE D8
## AI Experience, Contextual Intelligence & AI Assistant
### Frappe-Style Application Discipline + Exact Approved Palette + Existing Wamiro Architecture

**Program:** Wamiro MNC-Grade UI/UX Transformation  
**Phase:** D8 — AI Experience + Contextual Intelligence  
**Prerequisite:** D1–D7 completed  
**Primary goal:** Make AI feel like a native Wamiro capability embedded into the existing product, not a separate AI application.

---

# 1. D8 MISSION

AI should feel like:

```text
Wamiro
↓
Context
↓
AI assistance
↓
Useful result
↓
Normal Wamiro action
```

It should NOT feel like:

```text
purple chatbot
+
floating AI orb
+
gradient interface
+
separate AI product
```

AI is an enhancement layer across:

```text
People
Work
Requests
Knowledge
Documents
Support
Analytics
Administration
```

---

# 2. D8 FINAL DESIGN RULE

Do not create a new AI visual language.

AI must reuse:

```text
same Rail
same Sidebar
same PageHeader
same typography
same tables
same lists
same dialogs
same drawers
same forms
same comments
same activity
same mobile architecture
same palette
same semantic tokens
```

AI is a Wamiro capability, not a separate product.

---

# 3. D8 WORKSPACE ARCHITECTURE

If AI is an existing major Wamiro workspace:

```text
Rail
→ AI
```

Then its sidebar contains only existing AI features.

Example, only where these already exist:

```text
AI
  Home
  Assistant
  Conversations
  Saved
  Activity
  Settings
```

Do not add artificial modules merely to populate the sidebar.

If AI is not currently a standalone workspace, keep AI contextual inside existing workspaces instead of inventing a new navigation domain.

---

# 4. D8 DESIGN TARGET

The AI experience should feel:

```text
Quiet
Fast
Contextual
Trustworthy
Transparent
Useful
Permission-aware
```

Not:

```text
Magical
Glowing
Futuristic
Neon
Purple
Decorative
```

---

# 5. EXACT APPROVED PALETTE

Use only:

```text
#7A7A7A
#F8F8F8
#242424
#D9D9D9
#999999
#BD660E
#171717
#383838
#AFAFAF
#C23838
```

No new Wamiro application theme colors.

No:

```text
AI purple
AI blue
neon
glow
rainbow
gradients
```

External model/provider branding must not change Wamiro's application theme.

---

# 6. SEMANTIC TOKENS

Use the shared Wamiro semantic structure:

```text
text-ink-*
bg-surface-*
border-outline-*
```

Do not scatter raw hex values through AI components.

Do not use raw palette utilities when a Wamiro semantic token exists.

---

# 7. LIGHT + DARK MODE

Use one semantic token system for both themes.

Theme switch:

```text
[data-theme="dark"]
```

or the existing Wamiro equivalent.

AI must use the same light/dark surfaces as every other Wamiro workspace.

Do not create an AI-only dark palette.

---

# 8. TYPOGRAPHY

Use:

```text
InterVar
```

Only.

Use the established Frappe-inspired distinction:

```text
tight UI text
→ labels, headings, buttons, timestamps, metadata

paragraph text
→ explanations, summaries, multi-line AI output
```

Do not make AI answers oversized.

---

# 9. NO AI VISUAL EXCEPTION

Never add:

```text
glowing AI borders
gradient response cards
sparkle icons as decoration
floating robot avatars
purple chat bubbles
neon loading effects
large AI hero areas
```

Use normal Wamiro surfaces and typography.

---

# 10. CONTEXTUAL AI

The most important D8 UX rule:

> **AI should know where the user is.**

Examples:

People:

```text
Summarize this employee
```

Work:

```text
Summarize this project
Explain the current project status
```

Requests:

```text
Summarize this request
Explain the approval history
```

Knowledge:

```text
Summarize this article
Find the relevant policy
```

Documents:

```text
Summarize this document
Extract key points
```

Support:

```text
Summarize this ticket
Find related knowledge
Draft a reply
```

Analytics:

```text
Explain this trend
Summarize what changed
```

Only expose actions that actually exist in Wamiro.

---

# 11. NO GIANT AI BUTTON

Do not put a large AI button on every screen.

Use small contextual actions:

```text
Ask
Explain
Summarize
Draft
Suggest
Find
Compare
```

where useful.

---

# 12. GLOBAL ASSISTANT

If a global assistant already exists, open it through the existing Wamiro interaction model:

```text
Ctrl/Cmd + K
drawer
side panel
dedicated existing workspace
```

Use the actual current implementation.

Do not introduce a floating chatbot bubble over the application.

---

# 13. AI RESPONSE STRUCTURE

Structure AI output as:

```text
Answer
↓
Key points
↓
Sources/context
↓
Suggested actions
```

For longer answers:

```text
Summary
Details
Sources
Actions
```

Avoid giant uninterrupted paragraphs.

---

# 14. CONVERSATION UI

If an assistant conversation screen already exists, use the D1 Two-pane archetype.

Desktop:

```text
Conversation list
+
Conversation detail
```

Mobile:

```text
Conversation list
↓
Conversation detail
```

Do not create a separate AI application shell.

---

# 15. AI LOADING / ERROR

Use normal Wamiro loading:

```text
LoadingText
Skeleton
Spinner
```

Never use glowing dots, rainbow spinners or animated AI orbs.

Human-readable error:

```text
The assistant couldn't complete this request.

[Retry]
```

Never expose raw provider errors.

---

# 16. AI PERMISSION MODEL

AI must inherit:

```text
tenant
+
user identity
+
effective permissions
+
resource scope
```

AI must never have unrestricted database access.

Required retrieval flow:

```text
User request
↓
Authorization
↓
Search/retrieval
↓
Permission filtering
↓
Context assembly
↓
Model
↓
Answer
```

---

# 17. AI CITATIONS

Where retrieval exists, show source context:

```text
Based on:

Employee Leave Policy
Updated 21 Aug 2026

Open source →
```

Use normal Wamiro link styling.

Do not create colorful source cards.

---

# 18. NO FAKE CONFIDENCE

Do not show percentages such as:

```text
Confidence: 94%
```

unless the system provides a meaningful calibrated confidence measure.

Prefer useful context such as:

```text
Sources
Assumptions
Uncertain
```

when appropriate.

---

# 19. AI ACTIONS

AI may suggest existing Wamiro actions.

Example:

```text
3 onboarding tasks are overdue.

[View tasks]
```

The action opens the actual Wamiro workspace.

Do not create AI-only duplicate pages.

---

# 20. AI CANNOT BYPASS WORKFLOWS

If AI suggests an action such as approval, execution must follow:

```text
Authorization
↓
D4 Workflow
↓
Confirmation where required
↓
Audit
↓
Execution
```

AI cannot silently perform privileged actions.

---

# 21. READ VS WRITE

Read assistance:

```text
Summarize
Explain
Find
Compare
```

Write/action assistance:

```text
Create
Edit
Approve
Delete
Send
```

Write operations require normal Wamiro authorization.

---

# 22. AI DRAFTING

Where already supported:

```text
Draft announcement
Draft email
Draft reply
Draft article
Draft comment
```

Output remains editable.

AI must not silently publish or send.

---

# 23. CONTEXTUAL INTEGRATIONS

Reuse existing Wamiro phases rather than creating duplicate AI systems.

```text
People     → D2
Work       → D3
Requests   → D4
Knowledge  → D5
Documents  → D5
Support    → D6
Analytics  → D7
```

Examples:

```text
Employee → Summarize authorized information
Project → Summarize project
Request → Explain approval history
Article → Summarize article
Document → Summarize document
Ticket → Summarize ticket
Dashboard → Explain trend
```

Never expose data beyond the user's existing authorization.

---

# 24. ACTION PREVIEW

For write actions:

```text
AI suggestion
↓
Preview changes
↓
User review
↓
Confirmation
↓
Normal Wamiro action
```

Use the shared Wamiro confirmation system.

---

# 25. AI AUDIT

Where appropriate, audit:

```text
ai.requested
ai.completed
ai.failed
ai.source_accessed
ai.draft_created
ai.action_proposed
ai.action_executed
ai.action_rejected
```

Do not retain sensitive prompts/outputs indefinitely without a justified policy.

---

# 26. AI PRIVACY + TENANT ISOLATION

Never expose through AI:

```text
private employee information
private documents
restricted HR data
admin-only configuration
another tenant's data
```

Release-blocking tests:

```text
Tenant A AI cannot retrieve Tenant B data
Tenant A AI cannot search Tenant B documents
Tenant A AI cannot access Tenant B embeddings/indexes
Tenant A AI cannot access Tenant B conversation context
```

---

# 27. AI CONTEXT PRESERVATION

Opening AI from an existing object should preserve context where supported:

```text
Employee
Project
Request
Ticket
Document
Article
Dashboard
```

Example:

```text
Project Phoenix
↓
Ask AI
```

A small context indicator may show:

```text
Context: Project Phoenix
```

Do not create a large contextual banner.

---

# 28. AI SEARCH VS GLOBAL SEARCH

Keep the roles distinct:

```text
Global Search
→ find / navigate

AI
→ interpret / explain / assist
```

AI does not replace normal search.

---

# 29. AI SHOULD NOT HIDE NORMAL UI

Users must still be able to:

```text
Search
Browse
Filter
Open
Edit
Approve
Complete
```

without using AI.

AI is optional assistance.

---

# 30. AI USAGE / PROVIDER UX

If existing Wamiro functionality has AI limits, use the existing Wamiro settings/status components.

Normal users should see:

```text
Wamiro AI
```

Provider/model implementation details belong in Administration for authorized users.

---

# 31. AI MOBILE

Use the normal Wamiro mobile shell:

```text
Context
Conversation
Composer
Sources
Actions
```

Do not create a floating chatbot bubble over content.

---

# 32. ACCESSIBILITY

Ensure:

```text
Keyboard navigation
Focus management
Screen reader support
Accessible source links
Reduced motion
Stable streaming focus/scroll
```

---

# 33. D8 DESIGN DISCIPLINE

Follow D1–D7:

```text
Gray first
Typography before decoration
One primary action
Dense but breathable
Alignment over flow
Semantic color
Minimal borders
Minimal shadows
No gradients
```

AI gets no visual exception.

---

# 34. AI PALETTE / GEOMETRY

AI uses exactly the application system:

```text
#7A7A7A
#F8F8F8
#242424
#D9D9D9
#999999
#BD660E
#171717
#383838
#AFAFAF
#C23838
```

Use the established:

```text
InterVar
8px control radius
10px normal card radius
12px dialog radius
subtle shadows
compact headers
compact sidebar
```

No glowing AI containers.

---

# 35. D8 VALIDATION SCREENS

Validate only AI experiences that already exist or are explicitly approved:

```text
1. Existing AI workspace
2. Existing global assistant
3. Existing People AI
4. Existing Work AI
5. Existing Request AI
6. Existing Knowledge AI
7. Existing Document AI
8. Existing Support AI
9. Existing Analytics AI
10. Existing AI settings
11. Mobile AI
```

Do not invent screens merely to fill the phase.

---

# 36. D8 IMPLEMENTATION ORDER

```text
1. Audit current AI
2. Audit current AI entry points
3. Remove inconsistent AI-only styling
4. Integrate AI into D1 shell
5. Integrate contextual AI into existing workspaces
6. Standardize typography
7. Standardize surfaces
8. Standardize AI actions
9. Standardize sources/citations
10. Standardize loading/errors
11. Verify permission inheritance
12. Verify tenant isolation
13. Verify action authorization
14. Verify audit
15. Verify mobile
16. Verify accessibility
17. Verify performance
18. Verify exact palette
19. Verify light mode
20. Verify dark mode
21. Visual QA
22. Freeze D8
```

---

# 37. D8 DELIVERABLES

```text
01. Redesigned existing AI workspace
02. Redesigned existing AI assistant
03. Contextual AI entry points
04. Conversation UI where already present
05. Source/citation UI where already present
06. Action preview where already present
07. AI loading/error states
08. AI drafting where already supported
09. Knowledge integration where already supported
10. Document integration where already supported
11. Work integration where already supported
12. Request integration where already supported
13. Support integration where already supported
14. Analytics integration where already supported
15. People integration where already supported
16. Admin/settings integration where already supported
17. Permission-aware AI
18. Tenant-isolated AI
19. AI audit
20. Mobile AI
21. Exact palette verification
22. Light mode verification
23. Dark mode verification
24. Accessibility verification
25. Performance verification
26. D9 backlog
```

---

# 38. D8 DEFINITION OF DONE

```text
AI feels like Wamiro.
AI does not look like a separate chatbot product.
AI uses InterVar.
AI uses the exact approved Wamiro palette.
AI uses the same semantic token architecture.
Light mode matches the rest of Wamiro.
Dark mode matches the rest of Wamiro.
No gradients.
No purple/blue AI styling.
No unnecessary AI navigation.
AI respects tenant boundaries.
AI respects permissions.
AI cannot bypass workflows.
AI write actions require normal authorization.
AI activity is auditable where required.
AI sources are transparent where available.
AI is contextual to the current workspace/object.
Normal search and navigation remain available.
Mobile works.
Accessibility is verified.
Performance is preserved.
```

---

# 39. AGENT EXECUTION RULE

The current Wamiro MVP works.

Do not redesign the backend simply to change visuals.

Do not add new AI capabilities unless explicitly approved.

First inspect:

```text
current AI workspace
current assistant
current AI integrations
current search/retrieval
current permissions
current AI actions
```

Then:

```text
Inspect
↓
Map AI onto existing Wamiro workspace
↓
Reuse D1–D7 components
↓
Redesign
↓
Run
↓
Test contextual authorization
↓
Test tenant isolation
↓
Test action authorization
↓
Test light/dark
↓
Check exact palette
↓
Check accessibility
↓
Check performance
↓
Compare visually
↓
Polish
↓
Document
```

Never claim an AI security boundary was verified unless it was actually tested.

---

# 40. FINAL D8 PRINCIPLE

> **AI should make Wamiro easier to use, not make Wamiro look like an AI product.**

The result should be:

```text
Contextual
Quiet
Useful
Fast
Transparent
Permission-aware
Enterprise-grade
```

---

# 41. FINAL D8 TARGET

```text
Open Wamiro object
↓
Ask for help
↓
Understand answer
↓
See source/context
↓
Review proposed action
↓
Execute through normal Wamiro controls
```

without leaving the product's established visual and interaction language.

---

# WAMIRO

> **One workplace. One operating system for your organization.**
