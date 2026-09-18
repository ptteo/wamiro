export const dynamic = "force-dynamic";

import Link from "next/link";

import { AdminNav, AdminSection } from "@/components/admin-ui";
import { Badge, Card, EmptyState, Table, THead, Th, Tr, Td } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { adminTabsFor } from "@/lib/admin-nav";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listRolesWithCounts } from "@/modules/admin/service";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "admin") || !can(ctx.access, "roles.manage")) {
    return (
      <>
        <PageHeader title="Roles" />
        <Card>
          <EmptyState title="Roles" hint="You don't have role management permissions." />
        </Card>
      </>
    );
  }

  const tabs = adminTabsFor(
    (p) => can(ctx.access, p),
    ctx.org.modules
  );

  const roles = await listRolesWithCounts(ctx);
  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Roles"
        subtitle="Permission bundles. Open a role to see grants and holders."
      />

      <AdminNav items={tabs} />

      <AdminSection title="System roles" subtitle={`${systemRoles.length} seeded per tenant`}>
        {systemRoles.length === 0 ? (
          <p className="py-6 text-center text-sm text-tertiary">No system roles.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Role</Th>
                <Th>Key</Th>
                <Th align="right">Members</Th>
              </tr>
            </THead>
            <tbody>
              {systemRoles.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/admin/roles/${r.id}`} className="font-medium text-primary hover:underline">
                      {r.name}
                    </Link>
                    {r.description ? (
                      <p className="text-xs text-tertiary">{r.description}</p>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone="brand">{r.key}</Badge>
                  </Td>
                  <Td align="right">
                    {r.members}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </AdminSection>

      <AdminSection
        title="Custom roles"
        subtitle={
          customRoles.length > 0
            ? `${customRoles.length} defined — assign from Access control`
            : "None yet. System roles are seeded per tenant and cover most needs."
        }
      >
        {customRoles.length === 0 ? (
          <p className="py-6 text-center text-sm text-tertiary">
            No custom roles. Assign system roles from Access control.
          </p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Role</Th>
                <Th>Key</Th>
                <Th align="right">Members</Th>
              </tr>
            </THead>
            <tbody>
              {customRoles.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/admin/roles/${r.id}`} className="font-medium text-primary hover:underline">
                      {r.name}
                    </Link>
                    {r.description ? (
                      <p className="text-xs text-tertiary">{r.description}</p>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone="amber">custom</Badge>
                  </Td>
                  <Td align="right">{r.members}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </AdminSection>
    </div>
  );
}
