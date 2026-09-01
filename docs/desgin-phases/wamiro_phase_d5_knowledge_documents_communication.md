# WAMIRO — PHASE D5
## Knowledge, Documents, Communication & Company Information
### Strict Wamiro Workspace Grammar + Exact Approved Palette

**Program:** Wamiro MNC-Grade UI/UX Transformation  
**Phase:** D5 — Knowledge + Documents + Communication  
**Prerequisite:** D1 + D2 + D3 + D4 completed  
**Primary goal:** Build a unified company information layer where employees can find, understand, create, share and discuss company knowledge and documents without feeling that they are moving between different products.

---

# 1. PHASE D5 MISSION

D5 creates Wamiro's organizational memory.

The workspace should connect:

```text
Knowledge
+
Documents
+
Policies
+
SOPs
+
Announcements
+
Discussions
+
Internal Communication
+
Search
+
Activity
```

The experience should answer:

> **Where is the information I need, what does it mean, and what should I do with it?**

---

# 2. CORE D5 PRINCIPLE

Knowledge should not behave like a file dump.

Documents should not behave like a disconnected drive.

Communication should not behave like a social-media feed.

Wamiro should connect:

```text
Information
↓
Context
↓
People
↓
Work
↓
Action
```

Example:

```text
Company policy
↓
Policy article
↓
Related request
↓
Employee
↓
Approval
```

---

# 3. D5 SCOPE

D5 includes:

```text
Knowledge Base
Knowledge Home
Categories
Articles
Policies
SOPs
FAQs
Company Handbook
Documents
Folders
Shared Files
File Search
File Preview
Document Detail
Document Versions
Document Permissions
Document Sharing
Document Favorites
Recent Documents
Announcements
Company News
Department News
Discussions
Comments
Mentions
Internal Communication
Company Feed
Activity
Composer
Editor
Templates
Global Knowledge Search
Document Search
Knowledge Search
Saved Items
Mobile Knowledge
Mobile Documents
Mobile Communication
Permission-aware information architecture
```

Do not build advanced enterprise content-governance automation in D5 unless already required.

---

# 4. DESIGN SOURCE

D5 uses:

```text
D1 Wamiro Design System
+
D2 People grammar
+
D3 Work grammar
+
D4 Request/Workflow grammar
+
Frappe Files archetype
+
Frappe Discussions archetype
+
Frappe Compose archetype
+
Frappe-style compact List/Table/Detail patterns
+
Wamiro-specific knowledge requirements
```

Frappe recipes are reference archetypes, not the complete Wamiro product.

---

# 5. APPROVED PALETTE — MANDATORY

D5 must use the same exact approved application palette established in D4:

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

No new application colors.

No gradients.

No purple/blue AI palette.

No rainbow categories.

No arbitrary semantic green/yellow/blue palette.

Use typography, icons, spacing, borders, structure and the approved colors for hierarchy.

---

# 6. PALETTE TOKENS

Use semantic Wamiro tokens mapped only to the approved palette:

```css
--w-muted: #7A7A7A;
--w-light: #F8F8F8;
--w-border: #242424;
--w-surface-light: #D9D9D9;
--w-muted-mid: #999999;
--w-accent-secondary: #BD660E;
--w-surface-dark: #171717;
--w-surface: #383838;
--w-surface-mid: #AFAFAF;
--w-accent: #C23838;
```

Do not scatter raw hex values through components.

---

# 7. KNOWLEDGE INFORMATION ARCHITECTURE

Recommended:

```text
Knowledge

Home
All Knowledge
Policies
SOPs
FAQs
Handbook
Department Knowledge
My Saved
Recently Viewed
```

Categories must be configurable by the organization.

Prefer shallow hierarchy plus strong search over deeply nested structures.

---

# 8. KNOWLEDGE HOME

Knowledge Home should answer:

```text
What information is important?
What is new?
What should I read?
Where should I search?
```

Structure:

```text
Search
↓
Important / featured information
↓
Categories
↓
Recently updated
↓
Recently viewed
↓
Saved
```

Do not create a wall of giant cards.

---

# 9. KNOWLEDGE SEARCH

Search:

```text
Titles
Content
Tags
Categories
Authors
Departments
Documents
Policies
FAQs
```

Every result must respect:

```text
tenant
+
permission
+
audience
```

Search is not allowed to bypass authorization.

---

# 10. KNOWLEDGE SEARCH RESULT

Use:

```text
Title
Type
Context
Updated
Relevant excerpt
```

Example:

```text
Leave Policy — Engineering

Knowledge · HR

Updated 2 days ago

A short relevant excerpt...
```

---

# 11. KNOWLEDGE CATEGORY

Default archetype:

> Compact List / Table

Example:

```text
Policies

12 articles

[Search] [Filter]

Article list
```

Columns:

```text
Article
Owner
Updated
Status
```

---

# 12. ARTICLE DETAIL

Use the D1 Detail/Reading archetype:

```text
Breadcrumb
Title
Metadata
Content
Related knowledge
Attachments
Comments
Activity
```

Use a focused reading width of approximately:

```text
720–800px
```

for long-form prose.

---

# 13. ARTICLE HEADER

Example:

```text
Engineering Leave Policy

HR · Policies
Updated 2 days ago

[Edit]
```

Only authorized users see editing/publishing actions.

---

# 14. ARTICLE METADATA

Keep metadata compact:

```text
Owner
Department
Category
Updated
Status
Audience
Review date
```

Do not overload the header.

---

# 15. ARTICLE LIFECYCLE

Support only the states actually needed:

```text
Draft
In Review
Published
Archived
```

If a simple tenant only needs:

```text
Draft
Published
Archived
```

do not force additional steps.

---

# 16. ARTICLE EDITOR

Reuse the D4 Composer architecture:

```text
Breadcrumb
Title
Focused editor
Formatting
Attachments
Publishing controls
```

Do not create a second editor system.

---

# 17. EDITOR PRINCIPLE

Long-form writing should feel calm.

Use:

```text
focused width
comfortable line height
restrained controls
progressive disclosure
```

Avoid a permanently huge toolbar.

---

# 18. ARTICLE CONTENT BLOCKS

Where useful:

```text
Heading
Paragraph
List
Checklist
Quote
Code
Table
Link
Image
File
Callout
Divider
```

Do not turn Knowledge into a full website builder.

---

# 19. DOCUMENTS WORKSPACE

Use the Frappe Files archetype as the reference:

```text
Sidebar
Home
Recents
Favorites
Shared with me
Trash

Main
Breadcrumb
Search
Sort
Upload
List
```

---

# 20. DOCUMENT LIST

Default archetype:

> Compact List / Table

Columns:

```text
Name
Type
Owner
Modified
Size
```

Optional:

```text
Shared
Status
```

Do not make oversized file tiles the default.

---

# 21. DOCUMENT ROW

Example:

```text
[file icon] Employee Handbook.pdf
            PDF · 4.2 MB
            Updated yesterday
```

Keep trailing metadata aligned.

---

# 22. DOCUMENT FOLDERS

Support:

```text
Folder
Subfolder
Breadcrumb
Recents
Favorites
Shared
Trash
```

Navigation must remain compact and predictable.

---

# 23. DOCUMENT BREADCRUMBS

Example:

```text
Documents / HR / Policies / Leave
```

Every navigation step must preserve context.

---

# 24. DOCUMENT PREVIEW

Preview supported formats where practical.

Structure:

```text
Toolbar
↓
Preview
↓
Metadata / side panel
```

Do not create a separate visual system for previews.

---

# 25. DOCUMENT DETAIL

Use:

```text
Header
Preview
Metadata
Versions
Permissions
Activity
Related
```

---

# 26. DOCUMENT VERSIONING

Show:

```text
Current version
Previous versions
Changed by
Changed at
```

Example:

```text
v4 · Current
Sarah Khan
24 Aug 2026

v3
Rahul Sharma
18 Aug 2026
```

Keep version history compact.

---

# 27. DOCUMENT PERMISSIONS

Show:

```text
Who has access
Role
Scope
Inherited
Direct
Temporary
```

Reuse the D1/D2 authorization model.

Do not create document-specific permissions logic.

---

# 28. DOCUMENT SHARING

Flow:

```text
Share
↓
Person / Team
↓
Permission
↓
Scope
↓
Expiry if temporary
↓
Share
```

Use the centralized permission engine.

---

# 29. SHARED WITH ME

Display:

```text
Shared with me
```

Metadata:

```text
Shared by
Permission
Date
Location
```

---

# 30. FAVORITES

Support:

```text
Favorite
Unfavorite
```

Provide a unified:

```text
Saved
```

area where useful.

---

# 31. RECENTS

Support:

```text
Recently viewed
Recently edited
Recently shared
```

Do not retain unnecessary sensitive metadata.

---

# 32. TRASH

Use soft deletion where appropriate.

Show:

```text
Deleted by
Deleted at
Restore
Permanent delete
```

Permanent deletion must be permission-controlled.

---

# 33. DOCUMENT SEARCH

Search:

```text
Filename
Title
Content where indexed
Type
Owner
Folder
Tags
```

Results must be permission-filtered before they reach the user.

---

# 34. DOCUMENT UPLOAD

Support:

```text
Upload
Drag and drop
Paste where practical
```

States:

```text
Uploading
Processing
Uploaded
Failed
```

No giant upload animations.

---

# 35. DOCUMENT UPLOAD ERROR

Example:

```text
Couldn't upload handbook.pdf.

The file exceeds the allowed size.

[Try another file]
```

Never expose raw storage/provider errors.

---

# 36. DOCUMENT SECURITY

Test:

```text
Unauthorized user cannot discover document
Unauthorized user cannot search document
Unauthorized user cannot preview document
Unauthorized user cannot download document
Unauthorized user cannot access versions
Tenant A cannot access Tenant B documents
```

---

# 37. COMPANY ANNOUNCEMENTS

Create:

```text
Announcements
```

Structure:

```text
Pinned
All
Department
Important
```

Use the D1 Feed archetype.

---

# 38. ANNOUNCEMENT FEED

Row:

```text
Avatar
Title
Author
Excerpt
Published
```

Keep rows compact.

---

# 39. ANNOUNCEMENT DETAIL

Structure:

```text
Header
Published metadata
Content
Attachments
Audience
Comments
Activity
```

---

# 40. ANNOUNCEMENT COMPOSER

Use the shared D4 Composer:

```text
Title
Content
Audience
Publish date
Optional expiry
Attachments
```

Primary action:

```text
Publish
```

---

# 41. ANNOUNCEMENT AUDIENCE

Support:

```text
Entire organization
Department
Team
Location
Specific users
```

Audience selection is authorization-controlled.

---

# 42. PINNED ANNOUNCEMENTS

Authorized users may:

```text
Pin
Unpin
Set expiry
```

Make pinned content distinct through:

```text
spacing
weight
border
icon
```

not huge colored cards.

---

# 43. DISCUSSIONS

Use the Frappe Discussions archetype:

```text
Sidebar
Pinned
All
Unread
Feed
Detail
Composer
```

Wamiro discussion use cases:

```text
Team discussions
Project discussions
Department discussions
Company discussions
```

---

# 44. DISCUSSION ROW

Example:

```text
[Avatar] Product roadmap update
         Sarah Khan
         Let's discuss the Q4 priorities...

         12 replies              2h
```

Unread uses a restrained indicator.

---

# 45. DISCUSSION DETAIL

Structure:

```text
Title
Author
Content
Replies
Attachments
Activity
```

Keep the conversation readable and focused.

---

# 46. DISCUSSION COMPOSER

Use:

```text
Focused editor
Mention
Attachment
Post
```

Primary action:

```text
Post
```

---

# 47. COMMENTS

Create one shared Wamiro Comment component for:

```text
Articles
Documents
Projects
Tasks
Requests
Discussions
Announcements
Tickets
```

Do not create per-module comment components.

---

# 48. MENTIONS

Support:

```text
@person
```

Use the same picker everywhere.

Mention behavior must respect:
- tenant
- visibility
- permissions

---

# 49. NOTIFICATION INTEGRATION

Central notifications:

```text
New announcement
Mention
Document shared
Comment
Article updated
Discussion reply
```

Do not create a second D5 notification system.

---

# 50. COMPANY FEED

Future unified feed may combine:

```text
Announcements
Discussions
Important updates
Knowledge
Work highlights
```

D5 should create the reusable components without turning the product into a social network.

---

# 51. ACTIVITY

Use one shared timeline:

```text
Article published
Document uploaded
Announcement published
Comment added
Discussion created
Document shared
```

All activity remains permission-aware.

---

# 52. KNOWLEDGE TAXONOMY

Support:

```text
Category
Subcategory
Tags
Owner
Audience
Department
```

Prefer:

```text
small hierarchy
+
strong search
+
tags
```

over extremely deep navigation trees.

---

# 53. KNOWLEDGE OWNERSHIP

Each important article should have:

```text
Owner
Department
Status
Review date where appropriate
```

This prepares Wamiro for future knowledge governance.

---

# 54. REVIEW DATES

For policies/SOPs:

```text
Next review:
30 Sep 2026
```

If overdue:

```text
Review overdue
```

Do not rely on color alone.

---

# 55. KNOWLEDGE APPROVAL

Use D4 workflow infrastructure:

```text
Draft
↓
Review
↓
Approval
↓
Publish
```

Do not create a second approval engine.

---

# 56. DOCUMENT APPROVAL

Same reusable workflow:

```text
Document
↓
Submit
↓
Review
↓
Approve
↓
Finalize / publish
```

---

# 57. KNOWLEDGE ↔ DOCUMENT CONNECTION

A knowledge article can reference:

```text
Document
Policy
SOP
Request
Project
Person
```

Make related information easy to open.

This creates the connected Company OS experience.

---

# 58. GLOBAL SEARCH

D5 adds these search types:

```text
Article
Policy
Document
Discussion
Announcement
```

while retaining:

```text
People
Work
Requests
```

from previous phases.

---

# 59. SEARCH RESULT DESIGN

Use one consistent result anatomy:

```text
Title
Type
Context
Updated
Relevant excerpt
```

Do not create a separate search UI for each module.

---

# 60. SEARCH FILTERS

Support:

```text
Type
Department
Owner
Updated
Location
Category
```

Only expose meaningful filters for the active result set.

---

# 61. SEARCH SECURITY

Search must enforce:

```text
Tenant
+
User permissions
+
Knowledge audience
+
Document access
```

Search cannot become an authorization bypass.

---

# 62. KNOWLEDGE PERSONALIZATION

Support:

```text
Recently viewed
Saved
Recommended later
```

Recommendations must be permission-safe.

Do not build AI recommendation logic in D5 unless already required.

---

# 63. DOCUMENT TAGS

Examples:

```text
policy
finance
hr
engineering
security
```

Tenant administrators may customize tags.

Keep tags visually restrained.

---

# 64. DOCUMENT METADATA

Compact metadata:

```text
Type
Size
Owner
Created
Modified
Location
Permissions
```

Do not show backend IDs.

---

# 65. KNOWLEDGE ARTICLE METADATA

```text
Category
Owner
Department
Published
Updated
Review date
```

---

# 66. READING EXPERIENCE

Long-form knowledge should prioritize content.

Use:

```text
focused width
comfortable line height
quiet surfaces
minimal chrome
clear headings
```

---

# 67. PRINT / EXPORT

Where useful:

```text
Print
Export PDF
Copy link
```

Only authorized users should see export actions.

---

# 68. LINK SHARING

Use:

```text
Copy link
```

The link still enforces authorization.

Never create public document links by accident.

---

# 69. EXTERNAL SHARING PREPARATION

If external sharing is implemented later:

```text
Explicit enablement
Expiration
Scope
Audit
Revocation
```

It must never be the default.

---

# 70. KNOWLEDGE VERSIONING

Support:

```text
Version history
Changed by
Changed at
```

Use the same visual treatment as document versions.

---

# 71. CONTENT LIFECYCLE

Use a common lifecycle:

```text
Draft
Review
Published
Archived
```

Do not create incompatible lifecycle vocabularies across content types.

---

# 72. INTERNAL INBOX

Create:

```text
Inbox
Sent
Drafts
Threads
```

Use the Frappe Mail two-pane archetype.

---

# 73. TWO-PANE COMMUNICATION

Desktop:

```text
┌────────────────┬─────────────────────────────┐
│ conversation   │ message thread              │
│ list           │                             │
│                │                             │
└────────────────┴─────────────────────────────┘
```

Mobile:

```text
Inbox
↓
Conversation detail
```

---

# 74. MESSAGE ROW

```text
Avatar
Name
Subject / preview
Time
Unread
```

Keep compact.

---

# 75. MESSAGE DETAIL

```text
Conversation title
Participants
Messages
Attachments
Reply
```

Avoid consumer-chat styling.

---

# 76. MESSAGE ACTIONS

Use:

```text
Reply
Forward
Archive
Mark unread
More
```

One dominant action.

---

# 77. D5 MOBILE

Knowledge:

```text
Search
Categories
Article list
Article detail
```

Documents:

```text
Documents
Search
Folders
Files
Preview
```

Communication:

```text
Inbox
Conversation
Reply
```

Do not squeeze the desktop shell onto mobile.

---

# 78. D5 ACCESSIBILITY

Support:

```text
Keyboard
Focus-visible
Screen readers
Semantic headings
Accessible links
Accessible tables
Accessible dialogs
Accessible editor
Reduced motion
```

Articles must use proper heading hierarchy.

---

# 79. D5 EDITOR ACCESSIBILITY

Ensure:

```text
Keyboard toolbar navigation
Accessible labels
Correct focus management
Alternative text support
Meaningful link labels
No critical visual-only information
```

---

# 80. D5 PERFORMANCE

Support large enterprise data sets through:

```text
server-side search
pagination
virtualization
lazy previews
lazy images
indexed search
streamed content where useful
```

Do not render thousands of documents/articles simultaneously.

---

# 81. DOCUMENT SEARCH INDEX

Prepare indexes for:

```text
filename
title
body
metadata
tags
owner
department
```

Always apply authorization before returning search results.

---

# 82. KNOWLEDGE SEARCH INDEX

Index:

```text
title
body
category
tags
owner
department
status
```

Use permission-filtered search.

---

# 83. STORAGE ABSTRACTION

Use:

```text
FileStorageProvider
```

Possible backends:

```text
OCI Object Storage
S3-compatible storage
MinIO
Future providers
```

Do not couple React UI to storage providers.

---

# 84. DOCUMENT SERVICE

Create a reusable:

```text
DocumentService
```

for:

```text
upload
download
preview
version
share
favorite
trash
restore
```

---

# 85. KNOWLEDGE SERVICE

Create:

```text
KnowledgeService
```

for:

```text
article
category
tag
search
publish
archive
version
related content
```

---

# 86. COMMUNICATION SERVICE

Centralize:

```text
Announcement
Discussion
Message
Comment
Mention
```

Do not couple communication logic to individual page components.

---

# 87. D5 EVENTS

Prepare:

```text
article.created
article.updated
article.published
article.archived

document.uploaded
document.updated
document.shared
document.deleted
document.restored

announcement.published
announcement.updated

discussion.created
discussion.replied

message.sent
message.received

comment.created
mention.created
```

Later consumers:

```text
notifications
analytics
AI
automation
audit
integrations
```

---

# 88. D5 SECURITY TESTS

Test:

```text
Unauthorized user cannot find private article
Unauthorized user cannot search private document
Unauthorized user cannot preview private document
Unauthorized user cannot download private document
Unauthorized user cannot access old document versions
Restricted department content remains hidden
Tenant A cannot access Tenant B knowledge
Tenant A cannot access Tenant B documents
Tenant A cannot access Tenant B discussions
```

---

# 89. D5 AUDIT

Audit important actions:

```text
article.created
article.updated
article.published
article.archived
article.deleted

document.uploaded
document.shared
document.permission_changed
document.deleted
document.restored

announcement.published
announcement.unpublished

discussion.created
comment.created

share_link.created
share_link.revoked
```

Never store unnecessary secrets/content in audit logs.

---

# 90. D5 PALETTE COMPLIANCE

The implementation must contain no unapproved Wamiro application colors.

Scan for:

```text
#hex
rgb()
rgba()
hsl()
hsla()
named colors
```

Approved application palette:

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

Exceptions:

```text
customer-uploaded documents
photos
document content
external media
external provider logos
```

may retain their original colors but must not modify Wamiro's UI theme.

---

# 91. D5 VISUAL ANTI-PATTERNS

Never build:

```text
Giant document cards
Rainbow knowledge categories
Gradient article headers
Glowing discussion cards
Purple AI search panels
Oversized file tiles
Neon status colors
Social-media-style reaction walls
```

Prefer:

```text
structured lists
clean metadata
typography
spacing
quiet surfaces
clear hierarchy
```

---

# 92. D5 VALIDATION WORKSPACES

Validate:

```text
1. Knowledge Home
2. Article List
3. Article Detail
4. Documents
5. Document Detail
6. Announcements
7. Discussions
8. Internal Inbox
9. Mobile Knowledge
10. Mobile Documents
11. Mobile Communication
```

All must visually belong to one Wamiro product.

---

# 93. D5 IMPLEMENTATION ORDER

```text
1. Knowledge navigation
2. Knowledge Home
3. Knowledge Search
4. Categories
5. Article List
6. Article Detail
7. Article Composer
8. Article versioning
9. Documents navigation
10. Document list
11. Folder navigation
12. Document detail
13. Document preview
14. Document version history
15. Document permissions
16. Sharing
17. Favorites / Recents
18. Trash / Restore
19. Announcements
20. Announcement composer
21. Discussions
22. Discussion detail
23. Comments / Mentions
24. Internal Inbox
25. Message detail
26. Global search integration
27. Mobile experiences
28. Accessibility
29. Security
30. Performance
31. Audit
32. Exact palette verification
33. Visual QA
34. D6 backlog
```

---

# 94. D5 DELIVERABLES

```text
01. Knowledge Workspace
02. Knowledge Home
03. Knowledge Categories
04. Knowledge Search
05. Articles
06. Article Detail
07. Article Composer
08. Article Versioning
09. Documents Workspace
10. Folder Navigation
11. Document Search
12. Document Preview
13. Document Detail
14. Document Versioning
15. Document Permissions
16. Document Sharing
17. Favorites
18. Recent Items
19. Trash / Restore
20. Announcements
21. Discussions
22. Comments
23. Mentions
24. Internal Inbox
25. Communication Detail
26. Global Search Integration
27. Mobile Knowledge
28. Mobile Documents
29. Mobile Communication
30. Permission UX
31. Audit
32. Performance verification
33. Accessibility verification
34. Exact palette verification
35. D6 backlog
```

---

# 95. D5 DEFINITION OF DONE

D5 is complete only when:

```text
Knowledge is searchable.

Documents are structured.

Articles are readable.

Communication is connected.

Announcements are centralized.

Discussions are usable.

Comments are shared across modules.

Documents have version history.

Documents use the central permission engine.

Search respects authorization.

Tenant isolation is verified.

Mobile works.

Light mode uses only the approved palette.

Dark mode uses only the approved palette.

No gradients exist in Wamiro application UI.

No unrelated application colors exist.

All D5 screens use the D1 shell.

All D5 screens use D1 workspace archetypes.

All D5 screens feel like one Wamiro product.
```

---

# 96. AGENT EXECUTION RULE

The MVP already works.

Do not rewrite working content/document logic just for visual reasons.

Inspect the current implementation first.

Reuse:

```text
D1 design system
D2 People components
D3 Work components
D4 Request / Workflow components
```

For each D5 workspace:

```text
Inspect
↓
Select archetype
↓
Reuse shared components
↓
Implement
↓
Run
↓
Test permissions
↓
Test tenant isolation
↓
Test search
↓
Test light mode
↓
Test dark mode
↓
Check exact palette
↓
Test accessibility
↓
Test performance
↓
Polish
↓
Document
```

---

# 97. FINAL D5 PRINCIPLE

> **Wamiro should become the place where the organization remembers, communicates and finds information.**

A user should be able to move naturally:

```text
Search
↓
Find article
↓
Open related document
↓
Comment / discuss
↓
Open request
↓
Take action
```

without feeling that these are different products.

---

# 98. FINAL D5 TARGET

The final experience should feel:

```text
Organized
Searchable
Calm
Dense
Readable
Connected
Permission-aware
Secure
Fast
Mature
```

using the exact approved palette and the structured Frappe-inspired workspace discipline.

---

# WAMIRO

> **One workplace. One operating system for your organization.**

## Reference archetypes

Frappe UI:
https://ui.frappe.io/

Frappe Discussions:
https://ui.frappe.io/recipes/demo/discussions-desktop

Frappe Compose:
https://ui.frappe.io/recipes/demo/compose-desktop

Frappe Mail:
https://ui.frappe.io/recipes/demo/mail-desktop

Frappe Files:
https://ui.frappe.io/recipes/demo/files-desktop
