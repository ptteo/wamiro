export const dynamic = "force-dynamic";

import { ActionButton } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState, btn } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listCourses, myEnrollments } from "@/modules/people-ops/service";

export const metadata = { title: "Learning" };

export default async function LearningPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "learning.view")) {
    return <Card><EmptyState title="Learning" hint="No learning access." /></Card>;
  }
  const [coursesList, mine] = await Promise.all([listCourses(ctx), myEnrollments(ctx)]);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Learning</h1>
        <p className="mt-1 text-sm text-secondary">Courses, required training and progress.</p>
      </header>

      <Card>
        <CardHeader title="My learning" />
        {mine.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">Nothing assigned yet.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {mine.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="font-medium">{m.courseTitle}{m.required ? " · required" : ""}</p>
                  {m.dueAt ? <p className="text-xs text-tertiary">Due {new Date(m.dueAt).toLocaleDateString()}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={m.status === "completed" ? "green" : m.status === "in_progress" ? "amber" : "neutral"}>
                    {m.status.replace("_", " ")}
                  </Badge>
                  {m.status !== "completed" ? (
                    <>
                      <ActionButton label="Start" path={`/api/v1/people-ops/learning/${m.id}`} body={{ status: "in_progress" }}
                        className={`${btn.secondary} ${btn.small}`} />
                      <ActionButton label="Complete" path={`/api/v1/people-ops/learning/${m.id}`} body={{ status: "completed" }}
                        confirm="Mark this course completed?" className={`${btn.secondary} ${btn.small}`} />
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Course catalog" />
        {coursesList.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">No courses published.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {coursesList.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-tertiary">{c.category ?? "general"}{c.required ? " · required" : ""}{c.durationMins ? ` · ${c.durationMins} min` : ""}</p>
                </div>
                {can(ctx.access, "learning.manage") ? (
                  <ActionButton label={`Enroll me`} path="/api/v1/people-ops/learning"
                    body={{ courseId: c.id, userIds: [ctx.user.id] }} className={`${btn.secondary} ${btn.small}`} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
