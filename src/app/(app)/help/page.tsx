import Link from "next/link";

import { ContactSupportForm, HelpActions } from "@/components/help-client";
import { Card, CardHeader } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { helpPageData } from "@/modules/help/service";
import { can } from "@/modules/iam/engine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help" };

export default async function HelpPage() {
  const ctx = await requireAuthPage();
  const { articles, kb } = await helpPageData(ctx);
  const canAsk = can(ctx.access, "tickets.create");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help"
        subtitle="How to use Wamiro — plus your company’s knowledge base."
      />
      <HelpActions canAsk={canAsk} />

      <Card>
        <CardHeader title="Guides" subtitle="Short answers for the first week" />
        <ul className="divide-y divide-border-subtle">
          {articles.map((a) => (
            <li key={a.id} className="px-5 py-4">
              <Link href={a.href} className="text-sm font-medium text-primary hover:underline">
                {a.title}
              </Link>
              <p className="mt-1 text-sm text-secondary">{a.body}</p>
            </li>
          ))}
        </ul>
      </Card>

      {kb.length > 0 ? (
        <Card>
          <CardHeader title="From your company" subtitle="Knowledge articles" />
          <ul className="divide-y divide-border-subtle">
            {kb.map((a) => (
              <li key={a.id} className="px-5 py-3">
                <Link href={a.href} className="text-sm font-medium text-primary hover:underline">
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Contact Wamiro support" subtitle="For product issues — not workplace IT" />
        <div className="px-5 py-4">
          <ContactSupportForm />
        </div>
      </Card>
    </div>
  );
}
