import { InviteAcceptForm } from "@/components/invite-accept-form";

export const metadata = { title: "Accept invite" };
export const dynamic = "force-dynamic";

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <InviteAcceptForm token={token} />
      </div>
    </main>
  );
}
