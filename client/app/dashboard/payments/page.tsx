import { DashboardPageView } from "@/components/dashboard/page-view";
import { getDashboardPage } from "@/lib/dashboard";

export default function DashboardPaymentsPage() {
  return <DashboardPageView page={getDashboardPage("payments")} />;
}
