import { DashboardPageView } from "@/components/dashboard/page-view";
import { getDashboardPage } from "@/lib/dashboard";

export default function GovernancePage() {
  return <DashboardPageView page={getDashboardPage("governance")} />;
}
