"use client";

import { AddMemberForm } from "./add-member-form";
import { Avatar, Card, CardHeader } from "./ui";

export interface ProjectMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  jobTitle: string | null;
}

export function ProjectMembersPanel({
  members,
  canEdit,
  projectId,
}: {
  members: ProjectMember[];
  canEdit: boolean;
  projectId: string;
}) {
  return (
    <Card>
      <CardHeader title={`Members (${members.length})`} />
      <ul className="divide-y divide-border-subtle">
        {members.map((m) => (
          <li
            key={m.userId}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            <Avatar
              name={m.name}
              src={m.avatarUrl ?? undefined}
              className="!h-8 !w-8 text-[10px] ring-1 ring-border-subtle"
            />
            <div className="min-w-0 flex-1">
              <a
                href={`/people/${m.userId}`}
                className="block truncate text-sm font-medium text-primary hover:underline"
              >
                {m.name}
              </a>
              {m.jobTitle ? (
                <p className="truncate text-[10px] text-tertiary">{m.jobTitle}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {canEdit ? <AddMemberForm projectId={projectId} /> : null}
    </Card>
  );
}
