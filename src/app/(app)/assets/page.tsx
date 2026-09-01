import { AssetsListClient, type AssetClientRow } from "@/components/assets-list";
import { Card, EmptyState } from "@/components/ui";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listAll, listMine } from "@/modules/assets/service";

export const dynamic = "force-dynamic";

export const metadata = { title: "Assets" };

const VALID_CATEGORIES = new Set(["laptop", "phone", "monitor", "other"]);

function asCategory(v: string): "laptop" | "phone" | "monitor" | "other" {
  return (VALID_CATEGORIES.has(v) ? v : "other") as "laptop" | "phone" | "monitor" | "other";
}

export default async function AssetsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "assets") || !can(ctx.access, "assets.view_self")) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState title="Assets unavailable" />
        </Card>
      </Content>
    );
  }

  const manage = can(ctx.access, "assets.manage");
  const rows: AssetClientRow[] = manage
    ? (await listAll(ctx)).map((a) => ({
        id: a.id,
        name: a.name,
        category: asCategory(a.category),
        serialNumber: a.serialNumber,
        notes: a.notes,
        assignedToUserId: a.assignedToUserId,
        assignedToName: a.assignedToName,
        assignedToAvatar: a.assignedToAvatar,
        createdAt: a.createdAt.toISOString(),
      }))
    : (await listMine(ctx)).map((a) => ({
        id: a.id,
        name: a.name,
        category: asCategory(a.category),
        serialNumber: a.serialNumber,
        notes: a.notes,
        assignedToUserId: ctx.user.id,
        assignedToName: ctx.user.name,
        assignedToAvatar: a.assignedToAvatar,
        createdAt: a.createdAt.toISOString(),
      }));

  return (
    <Content width="wide">
      <PageHeader
        title="Assets"
        subtitle={
          manage
            ? "Hardware inventory. Add equipment, assign it to teammates, and return it to stock when it's done."
            : "Equipment assigned to you. Reach out to your manager to request hardware or return what you have."
        }
      />
      <AssetsListClient assets={rows} canManage={manage} currentUserId={ctx.user.id} />
    </Content>
  );
}
