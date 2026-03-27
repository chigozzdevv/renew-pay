import { DashboardPageView } from "@/components/dashboard/page-view";
import { getDashboardPage } from "@/lib/dashboard";

export default function DashboardTeamsPage() {
  return <DashboardPageView page={getDashboardPage("teams")} />;
}
