import { Content, PageHeader } from "@/components/page-header";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { listDocs } from "@/modules/people/hr-documents";
import { can } from "@/modules/iam/engine";

export const dynamic = "force-dynamic";
export const metadata = { title: "HR documents" };

export default async function HrDocumentsPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "documents.view")) {
    return (
      <Content>
        <Card>
          <EmptyState title="Documents unavailable" hint="You don't have access to documents." />
        </Card>
      </Content>
    );
  }

  const { docs, canManageAll } = await listDocs(ctx);
  const { HrDocumentsClient } = await import("@/components/hr-documents-client");

  return (
    <Content width="wide">
      <PageHeader
        title="HR documents"
        subtitle="Offer letters, contracts, ID proofs and certificates — your file is always in reach."
      />
      <HrDocumentsClient
        data={{
          canManageAll,
          viewerId: ctx.user.id,
          docs: docs.map((d) => ({
            id: d.id,
            employeeUserId: d.employeeUserId,
            employeeName: d.employeeName,
            docType: d.docType,
            title: d.title,
            mimeType: d.mimeType,
            sizeBytes: Number(d.sizeBytes),
            expiresAt: d.expiresAt !== null ? String(d.expiresAt) : null,
            uploadedByName: d.uploadedByName,
            createdAt: d.createdAt.toISOString(),
          })),
        }}
      />
    </Content>
  );
}
