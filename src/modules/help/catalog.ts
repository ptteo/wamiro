export interface HelpArticle {
  id: string;
  title: string;
  body: string;
  href: string;
  roles: Array<"employee" | "manager" | "admin" | "all">;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "clock-in",
    title: "Clock in and out",
    body: "Open Attendance (or use the button on Home) and tap Clock in when you start. Clock out when you finish. Your week totals update automatically.",
    href: "/attendance",
    roles: ["all"],
  },
  {
    id: "apply-leave",
    title: "Apply for leave",
    body: "Go to Leave, pick a type and dates, and submit. Your manager is asked to approve. Balances come from the leave types your company set up.",
    href: "/leave",
    roles: ["all"],
  },
  {
    id: "approve-leave",
    title: "Approve a teammate's leave",
    body: "Open Leave or Approvals. Pending items for your team are listed there. Approve or decline with an optional note — it is audited.",
    href: "/leave",
    roles: ["manager", "admin"],
  },
  {
    id: "raise-ticket",
    title: "Raise a support ticket",
    body: "Open Support, describe the issue, and submit. Use Help → Contact support if you need Wamiro itself, not workplace IT.",
    href: "/tickets",
    roles: ["all"],
  },
  {
    id: "invite-team",
    title: "Invite people onto your team",
    body: "From People, send an invite link. Managers can only invite people who will report to them. No password goes out in email.",
    href: "/people",
    roles: ["manager", "admin"],
  },
];

export function helpArticlesFor(roleKeys: string[]): HelpArticle[] {
  const manager = roleKeys.some((k) => k === "manager" || k === "hr_admin" || k === "admin" || k === "ceo");
  const admin = roleKeys.some((k) => k === "admin" || k === "hr_admin");
  return HELP_ARTICLES.filter((a) => {
    if (a.roles.includes("all")) return true;
    if (a.roles.includes("admin") && admin) return true;
    if (a.roles.includes("manager") && manager) return true;
    return false;
  });
}

export function searchHelpArticles(query: string, roleKeys: string[]): HelpArticle[] {
  const q = query.trim().toLowerCase();
  const pool = helpArticlesFor(roleKeys);
  if (!q) return pool;
  return pool.filter((a) => `${a.title} ${a.body}`.toLowerCase().includes(q));
}
