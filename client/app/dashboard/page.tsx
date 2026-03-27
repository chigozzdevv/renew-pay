import { DashboardPageView } from "@/components/dashboard/page-view";
import { getDashboardPage } from "@/lib/dashboard";

export default function DashboardOverviewPage() {
  return <DashboardPageView page={getDashboardPage("overview")} />;
}
