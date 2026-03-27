import { DashboardPageView } from "@/components/dashboard/page-view";
import { getDashboardPage } from "@/lib/dashboard";

export default function DashboardAuditPage() {
  return <DashboardPageView page={getDashboardPage("audit")} />;
}
