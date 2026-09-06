import { PageHeader } from "@/components/page-header";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { DemoSampleCard } from "@/components/demo-sample-card";
import { setupChecklist } from "@/modules/org/service";
import { syncOnboardingState } from "@/modules/org/policies";
import { demoStatus } from "@/modules/onboarding/demo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company Setup" };

/**
 * First-run wizard (Phase A): brand → invite team → publish a welcome note.
 * Each step is completed through the same real APIs the rest of the app uses,
 * so progress is durable and the Home checklist reflects it automatically.
 */
export default async function SetupPage() {
  const ctx = await requireAuthPage();
  const canBrand = can(ctx.access, "settings.manage");
  const canInvite = can(ctx.access, "users.manage");
  const canAnnounce = can(ctx.access, "announcements.manage");

  if (!canBrand && !canInvite && !canAnnounce) {
    return (
      <Card>
        <EmptyState title="Company setup" hint="Ask an administrator to finish the company setup." />
      </Card>
    );
  }

  await syncOnboardingState(ctx);
  const setup = await setupChecklist(ctx);
  const demo = await demoStatus(ctx);
  const wizardSteps = setup.steps.filter((s) => s.key !== "kb");
  const { SetupWizardClient } = await import("@/components/setup-wizard-client");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Set up your workspace"
        subtitle="Three quick steps and your company is ready for its first day on Wamiro."
      />
      <SetupWizardClient
        data={{
          orgName: ctx.org.name,
          primaryColor: ctx.org.primaryColor,
          hasLogo: Boolean(ctx.org.logoUrl),
          canBrand,
          canInvite,
          canAnnounce,
          steps: wizardSteps.map((s) => ({ key: s.key, label: s.label, done: s.done })),
          done: wizardSteps.filter((s) => s.done).length,
          total: wizardSteps.length,
          plan: ctx.org.plan,
        }}
      />
      {canBrand || canInvite ? <DemoSampleCard loaded={demo.loaded} /> : null}
    </div>
  );
}