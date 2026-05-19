import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const { t } = useI18n();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-space-5">
      <div className="text-center">
        <h1 className="mb-space-4 type-page-title">404</h1>
        <p className="mb-space-6 type-body-large text-muted-foreground">{t("notFound.message")}</p>
        <Button asChild>
          <a href="/">
          {t("notFound.home")}
          </a>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
