import { DashboardPageView } from "@/components/dashboard/page-view";
import { getDashboardPage } from "@/lib/dashboard";

export default function DashboardTreasuryPage() {
  return <DashboardPageView page={getDashboardPage("treasury")} />;
}
