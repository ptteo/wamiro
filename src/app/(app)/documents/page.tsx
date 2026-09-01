export const dynamic = "force-dynamic";

import { DocumentsListClient, type DocumentClientRow } from "@/components/documents-list";
import { Card, EmptyState } from "@/components/ui";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { listVisible } from "@/modules/documents/service";

export const metadata = { title: "Documents" };

const ALLOWED_CATEGORIES = new Set(["company", "policy", "personal"]);

function isCategory(v: string): v is "company" | "policy" | "personal" {
  return ALLOWED_CATEGORIES.has(v);
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; s?: string }>;
}) {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "documents") || !can(ctx.access, "documents.view")) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState
            title="Documents unavailable"
            hint="You don't have access to company documents."
          />
        </Card>
      </Content>
    );
  }

  const sp = await searchParams;
  // viewParam + scope are also reflected in client state — server doesn't enforce them.

  const docs = await listVisible(ctx);

  const rows: DocumentClientRow[] = docs.map((d) => ({
    id: d.id,
    category: isCategory(d.category) ? d.category : "company",
    fileName: d.fileName,
    sizeBytes: d.sizeBytes,
    mimeType: d.mimeType,
    uploaderName: d.uploaderName,
    uploaderAvatar: d.uploaderAvatar,
    createdAt: d.createdAt.toISOString(),
    lastDownloadedAt: d.lastDownloadedAt ? new Date(d.lastDownloadedAt as unknown as string).toISOString() : null,
    downloadCount: d.downloadCount,
    mine: d.uploadedBy === ctx.user.id,
    isOwner: d.ownerUserId === ctx.user.id,
  }));

  void sp; // referenced to keep the searchParams binding in scope for future use

  return (
    <Content width="wide">
      <PageHeader
        title="Documents"
        subtitle="Company files, policies, and your personal documents. Downloads are permission-checked on every request."
      />
      <DocumentsListClient
        documents={rows}
        canUpload={can(ctx.access, "documents.upload")}
        canManage={can(ctx.access, "documents.manage")}
      />
    </Content>
  );
}
