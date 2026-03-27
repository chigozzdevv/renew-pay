import { DashboardPageView } from "@/components/dashboard/page-view";
import { getDashboardPage } from "@/lib/dashboard";

export default function DashboardPlansPage() {
  return <DashboardPageView page={getDashboardPage("plans")} />;
}
