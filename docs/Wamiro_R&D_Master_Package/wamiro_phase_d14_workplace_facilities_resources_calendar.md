# WAMIRO — PHASE D14
## Workplace, Facilities, Calendar, Resource Booking & Office Operations

**Prerequisite:** D1–D13  
**Goal:** Add the physical-workplace layer to Wamiro while preserving the existing Wamiro Rail → contextual Sidebar → Page architecture, Frappe-style density, exact approved palette, permissions, tenant isolation, and shared services.

---

# 1. D14 MISSION

Connect the digital and physical workplace:

```text
Calendar
Meetings
Rooms
Desks
Resources
Facilities
Visitors
Locations
Bookings
Events
```

Employees should be able to answer:

> Where do I need to be, what can I book, who is visiting, and what workplace issue needs attention?

Do not create a separate workplace-management application.

---

# 2. WORKSPACE ARCHITECTURE

If enabled, add one major Rail workspace:

```text
Workplace
```

Its contextual Sidebar can contain:

```text
Workplace

Home
Calendar
Meetings
Rooms
Desks
Resources
Facilities
Visitors
Events
Bookings
My Requests
```

Only enabled and authorized items are visible.

Do not put Rooms, Desks, Visitors or Facilities directly on the Rail.

---

# 3. WORKPLACE HOME

Employee-oriented structure:

```text
Today
↓
My meetings
↓
My bookings
↓
Available resources
↓
Open facilities requests
↓
Visitors
```

Keep the layout operational and compact.

No giant cards.

---

# 4. CALENDAR

Reuse the existing Wamiro Calendar system.

Views:

```text
Day
Week
Month
Agenda
```

Where already supported:

```text
Workweek
```

Header:

```text
Previous
Today
Next
Date
View
New event
```

---

# 5. EVENT DETAIL

```text
Event
Participants
Date/time
Location
Room
Description
Attachments
Related request where applicable
```

Use the existing Wamiro Detail architecture.

---

# 6. ROOMS

Room list:

```text
Room
Location
Capacity
Features
Availability
Status
```

Optional existing metadata:

```text
Floor
Building
Equipment
```

Room detail:

```text
Room
Location
Capacity
Equipment
Availability
Upcoming bookings
Facilities issues
```

---

# 7. ROOM SEARCH

Support available filters where the product already has them:

```text
Date
Time
Capacity
Location
Equipment
Availability
```

Example:

```text
4–8 people
Tomorrow
10:00–11:00
Projector
```

Use the shared filter/search components.

---

# 8. ROOM BOOKING

Flow:

```text
Create meeting
↓
Choose date/time
↓
Check room availability
↓
Choose room
↓
Confirm
```

Primary action:

```text
Book room
```

---

# 9. BOOKING CONFLICT

Use a human-readable error:

```text
This room is no longer available.

Try another time or room.

[Find another room]
```

Never expose scheduling-provider errors.

---

# 10. DESKS

Where supported:

```text
Desk
Location
Date
Availability
```

Flow:

```text
Date
↓
Location
↓
Desk
↓
Book
```

If a desk map already exists, keep it simple and operational.

No decorative 3D floor plans.

---

# 11. RESOURCES

Generic resource model for:

```text
Projector
Conference equipment
Shared equipment
Company vehicle where supported
Other workplace resources
```

Resource list:

```text
Resource
Type
Location
Status
Availability
Updated
```

Resource detail:

```text
Resource
Type
Location
Availability
Current booking
History
Facilities request where applicable
```

Do not create separate UI architectures for every resource type.

---

# 12. MY BOOKINGS

One place for:

```text
Rooms
Desks
Resources
Events
```

Views:

```text
Upcoming
Past
Canceled
```

Booking detail:

```text
Resource
Owner
Date
Time
Location
Status
```

Use shared cancel/modify actions where supported.

---

# 13. FACILITIES

Facilities is the workplace support entry point.

Employee:

```text
Facilities
  Report issue
  My requests
  Knowledge
```

Facilities team:

```text
Facilities
  Home
  Requests
  Issues
  Assignments
  Locations
  Resources
  SLA
  Reports
```

---

# 14. FACILITIES REQUESTS

Reuse D4:

```text
Air conditioning
Cleaning
Lighting
Furniture
Access issue
Maintenance
Other workplace issue
```

No separate request/approval engine.

---

# 15. FACILITIES DETAIL

```text
Issue
Location
Requester
Priority
Status
Assignee
Attachments
Activity
```

Reuse D4/D6 operational detail patterns.

---

# 16. FACILITIES PHOTOS

Where supported:

```text
Take photo
Upload photo
Preview
```

Use D5 Documents for storage and access control.

---

# 17. FACILITIES ASSIGNMENT

```text
Request
↓
Assign
↓
Work
↓
Update
↓
Resolve
```

Use D3 Work for tasks where applicable.

---

# 18. FACILITIES SLA

Reuse D4/D6 SLA infrastructure:

```text
Response
Resolution
Due
Breached
```

---

# 19. VISITORS

Views:

```text
Upcoming
Today
Past
```

---

# 20. VISITOR CREATION

Collect only necessary information:

```text
Visitor name
Company
Date
Time
Purpose
Host/contact
```

Optional existing fields:

```text
Vehicle
Access notes
Documents
```

---

# 21. VISITOR INVITATION

```text
Host
↓
Visitor details
↓
Date/time
↓
Invitation
↓
Confirmation
```

---

# 22. VISITOR CHECK-IN/OUT

Where supported:

```text
Visitor
↓
Check in
↓
Host notified
↓
Access/badge where integrated
```

Check-out:

```text
Check out
↓
Time recorded
↓
Visit completed
```

---

# 23. VISITOR DETAIL

```text
Visitor
Host
Company
Purpose
Visit time
Status
```

Visitor information is privacy-controlled.

---

# 24. OFFICE LOCATIONS

Reuse D9 organization concepts.

Possible hierarchy:

```text
Office
↓
Building
↓
Floor
↓
Area
```

Do not create another organizational hierarchy.

Location detail:

```text
Location
Address
Timezone
Floors
Rooms
Desks
Resources
Facilities
```

---

# 25. EVENTS

Where already supported, reuse Calendar/Announcements for:

```text
Company events
Department events
Office events
```

Do not create a second event platform.

---

# 26. EVENT REGISTRATION

Where supported:

```text
Register
Cancel registration
Attendees
Capacity
```

Keep it compact.

---

# 27. WORKPLACE SEARCH

Contextual search:

```text
Rooms
Desks
Resources
Bookings
Visitors
Facilities
Locations
Events
```

Global search may surface them if already supported.

---

# 28. COMMAND PALETTE

Where supported:

```text
Book room
Book desk
Find room
Create facilities request
Invite visitor
Open calendar
```

Only expose real capabilities.

---

# 29. NOTIFICATIONS

Reuse the central system:

```text
Room booked
Booking canceled
Visitor arriving
Visitor checked in
Facilities update
Event reminder
Booking conflict
```

No second notification center.

---

# 30. WORKPLACE INTEGRATIONS

People:

```text
Employee
Office
Team
Manager
Visitor host
```

Requests:

```text
Facilities requests
Workflow
Comments
Attachments
Approval
SLA
Audit
```

Work:

```text
Facilities tasks
```

Documents:

```text
Visitor/facility/event attachments
```

Analytics:

```text
Room utilization
Desk usage
Facilities volume
SLA
Visitor trends
```

AI:

```text
Find available room
Summarize facilities requests
Explain availability
```

Only where those capabilities already exist.

Administration:

```text
Locations
Rooms
Desks
Resources
Visitor policies
Booking rules
Facilities categories
```

No duplicate admin system.

---

# 31. WORKPLACE PERMISSIONS

Support appropriate scopes:

```text
Own
Team
Department
Location
Organization
```

Examples:

```text
Employee → own bookings
Facilities manager → facilities
Office admin → location/resources
Admin → all configuration
```

Backend remains authoritative.

---

# 32. BOOKING RULES

Where supported:

```text
Advance booking window
Maximum duration
Cancellation window
Eligibility
Location restrictions
```

Configuration belongs in D9 Administration.

---

# 33. RESOURCE OWNERSHIP

Resources may have:

```text
Owner
Location
Status
Availability
Booking policy
```

Reuse centralized asset/resource concepts where appropriate.

---

# 34. AUDIT

Audit important actions:

```text
booking.created
booking.updated
booking.canceled

room.created
room.updated

desk.created
desk.updated

resource.created
resource.updated

visitor.created
visitor.checked_in
visitor.checked_out

facility_request.created
facility_request.assigned
facility_request.resolved
```

---

# 35. SECURITY

Test:

```text
Employee cannot modify another user's booking
Restricted bookings remain hidden
Visitor data is protected
Location administration is restricted
Facilities requests respect permissions
Tenant A cannot see Tenant B workplace data
Direct API access cannot bypass controls
```

---

# 36. PRIVACY

Collect only necessary visitor/workplace information.

Protect:

```text
visitor contact
visit details
documents
access information
```

---

# 37. EXACT APPROVED PALETTE

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

No special Facilities palette.

No gradient calendar.

No colorful floor-plan UI.

---

# 38. TYPOGRAPHY

Use:

```text
InterVar
```

and the established Frappe-inspired:

```text
tight UI type
paragraph type
sentence case
compact metadata
```

---

# 39. CALENDAR / BOOKING VISUAL RULES

Use:

```text
structured
dense
quiet
aligned
```

No giant event cards.

Room/resource pages should favor:

```text
table
list
detail
```

over large cards.

---

# 40. MOBILE

Employee:

```text
Calendar
Bookings
Book room
Book desk
Visitors
Facilities
```

Facilities:

```text
My requests
Create request
Request detail
```

Visitors:

```text
Upcoming
Visitor detail
Check-in where authorized
```

Use the D10 mobile architecture.

---

# 41. MOBILE ROOM BOOKING

Flow:

```text
Date
↓
Time
↓
Capacity
↓
Location
↓
Available rooms
↓
Book
```

Keep the flow focused.

---

# 42. MOBILE FACILITIES

```text
Issue
↓
Location
↓
Photo where supported
↓
Submit
```

---

# 43. ACCESSIBILITY

Verify:

```text
keyboard
screen reader
calendar
tables
forms
dialogs
booking controls
status
```

Calendar/resource state must not depend only on color.

---

# 44. PERFORMANCE

Design for:

```text
large calendars
large room inventories
large resource inventories
large visitor history
large facilities history
```

Use:

```text
server-side filtering
date-range loading
pagination
indexed queries
virtualization where appropriate
```

Do not load years of calendar events by default.

---

# 45. PROVIDER ABSTRACTION

If external workplace systems are used:

```text
CalendarService
ResourceBookingService
VisitorService
FacilitiesService
```

with adapters where appropriate.

Frontend remains Wamiro-native.

---

# 46. VISUAL ANTI-PATTERNS

Never create:

```text
gradient calendars
rainbow booking statuses
3D office maps
glowing room indicators
giant event cards
purple workplace panels
```

Prefer:

```text
tables
lists
compact calendar cells
quiet surfaces
```

---

# 47. VALIDATION SCREENS

Validate:

```text
1. Workplace Home
2. Calendar
3. Event Detail
4. Room List
5. Room Detail
6. Room Availability
7. Room Booking
8. Desk Booking
9. Resource List
10. Resource Detail
11. My Bookings
12. Facilities Requests
13. Facilities Detail
14. Visitor List
15. Visitor Detail
16. Office Location
17. Events
18. Mobile Calendar
19. Mobile Booking
20. Mobile Facilities
21. Mobile Visitor
```

---

# 48. IMPLEMENTATION ORDER

```text
1. Workplace Rail workspace
2. Workplace contextual Sidebar
3. Workplace Home
4. Calendar integration
5. Event detail
6. Room directory
7. Room detail
8. Room availability
9. Room booking
10. Desk booking
11. Resource management
12. My Bookings
13. Facilities requests
14. Facilities detail
15. Facilities assignment
16. Facilities SLA integration
17. Visitor management
18. Visitor check-in/out
19. Office locations
20. Events integration
21. People integration
22. Requests integration
23. Work integration
24. Documents integration
25. Analytics integration
26. AI integration
27. Administration integration
28. Search
29. Commands
30. Notifications
31. Mobile Workplace
32. Security
33. Audit
34. Accessibility
35. Performance
36. Exact palette verification
37. Light/dark QA
38. Visual QA
39. D15 backlog
```

---

# 49. DELIVERABLES

```text
01. Workplace Workspace
02. Workplace Contextual Sidebar
03. Workplace Home
04. Calendar Integration
05. Event Detail
06. Room Management
07. Room Detail
08. Room Availability
09. Room Booking
10. Desk Booking
11. Resource Management
12. Resource Detail
13. My Bookings
14. Facilities Requests
15. Facilities Detail
16. Facilities Assignment
17. Facilities SLA Integration
18. Visitor Management
19. Visitor Check-in/out
20. Office Locations
21. Events Integration
22. People Integration
23. Requests Integration
24. Work Integration
25. Document Integration
26. Analytics Integration
27. AI Integration
28. Administration Integration
29. Workplace Search
30. Workplace Commands
31. Workplace Notifications
32. Mobile Workplace
33. Permission UX
34. Security Verification
35. Audit
36. Accessibility Verification
37. Performance Verification
38. Exact Palette Verification
39. Light Mode Verification
40. Dark Mode Verification
41. D15 Backlog
```

---

# 50. DEFINITION OF DONE

D14 is complete only when:

```text
Workplace is a major Wamiro workspace.

The Rail switches into Workplace.

The Sidebar shows only permitted Workplace features.

Calendar remains one shared system.

Rooms are bookable where supported.

Desks are bookable where supported.

Resources are bookable where supported.

My bookings are centralized.

Facilities uses D4 Requests.

Facilities can use D6-style operational support where appropriate.

Visitors are controlled and auditable.

Locations reuse D9 organization concepts.

Documents reuse D5.

People reuse D2.

Work reuse D3.

Analytics reuse D7.

AI respects Workplace permissions.

Tenant isolation is verified.

Visitor/workplace personal data is protected.

Mobile works.

Accessibility is verified.

Performance is acceptable.

Light mode uses only the approved palette.

Dark mode uses only the approved palette.

No gradients exist.

No unrelated colors exist.

No separate workplace-management visual language exists.

Everything feels native to Wamiro.
```

---

# 51. AGENT EXECUTION RULE

Before implementation:

```text
Inspect D2 People
↓
Inspect D3 Work
↓
Inspect D4 Requests
↓
Inspect D5 Documents
↓
Inspect D6 Support/Assets
↓
Inspect D7 Analytics
↓
Inspect D8 AI
↓
Inspect D9 Administration
↓
Inspect D10 responsive/quality system
```

Then:

```text
Implement
↓
Run
↓
Test booking conflicts
↓
Test facilities permissions
↓
Test visitor privacy
↓
Test tenant isolation
↓
Test API authorization
↓
Test mobile
↓
Test light/dark
↓
Check palette
↓
Accessibility
↓
Performance
↓
Audit
↓
Visual comparison
↓
Polish
↓
Document
```

---

# 52. FINAL D14 PRINCIPLE

> **Wamiro should connect the digital employee experience with the physical workplace without becoming a separate facilities application.**

Ideal flow:

```text
Employee
↓
Calendar
↓
Book room
↓
Invite visitor
↓
Use desk
↓
Report facility issue
↓
Track request
↓
Return to Work
```

all from one Wamiro environment.

---

# 53. FINAL D14 TARGET

The Workplace experience should feel:

```text
Practical
Fast
Structured
Quiet
Connected
Permission-aware
Auditable
Enterprise-grade
```

with the same:

```text
Rail
Sidebar
Typography
Palette
Tables
Calendar
Forms
Dialogs
Requests
Permissions
```

used throughout Wamiro.

---

# WAMIRO

> **One workplace. One operating system for your organization.**
