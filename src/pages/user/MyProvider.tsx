import { useParams } from "react-router-dom";
import { UserLayout } from "@/components/layout/UserLayout";
import { ProviderWorkspace } from "@/components/provider/ProviderWorkspace";

/**
 * Owner/manager provider portal — the single provider view wrapped in the user
 * layout. The actual header + tabs live in ProviderWorkspace, shared with the
 * admin detail page so both look and behave identically.
 */
export default function MyProvider() {
  const { providerId } = useParams<{ providerId: string }>();
  return (
    <UserLayout title="My Business">
      <ProviderWorkspace providerId={providerId ?? ""} backHref="/my-business" />
    </UserLayout>
  );
}
