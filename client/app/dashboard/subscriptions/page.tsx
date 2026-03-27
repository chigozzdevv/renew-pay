import { DashboardPageView } from "@/components/dashboard/page-view";
import { getDashboardPage } from "@/lib/dashboard";

export default function DashboardSubscriptionsPage() {
  return <DashboardPageView page={getDashboardPage("subscriptions")} />;
}
