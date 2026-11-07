import { useParams, useSearchParams } from "react-router-dom";
import { Edit } from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { PROFILE_EDIT_PARAM, ProviderWorkspace } from "@/components/provider/ProviderWorkspace";

/**
 * Owner/manager provider portal — the single provider view wrapped in the user
 * layout. The actual header + tabs live in ProviderWorkspace, shared with the
 * admin detail page so both look and behave identically.
 *
 * On a phone the title bar carries Edit where other pages have the bell: the
 * profile is the one thing on this screen every tab shares, and the bell is
 * one tap away on Account anyway.
 */
export default function MyProvider() {
  const { providerId } = useParams<{ providerId: string }>();
  const [, setParams] = useSearchParams();
  const openEditor = () => setParams((prev) => {
    const q = new URLSearchParams(prev);
    q.set(PROFILE_EDIT_PARAM, "profile");
    return q;
  }, { replace: true });

  return (
    <UserLayout
      title="My Business"
      headerAction={
        <button
          type="button"
          aria-label="Edit business"
          onClick={openEditor}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
        >
          <Edit className="h-5 w-5" />
        </button>
      }
    >
      <ProviderWorkspace providerId={providerId ?? ""} backHref="/my-business" editInTitleBar />
    </UserLayout>
  );
}
