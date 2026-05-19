import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, LucideIcon } from "lucide-react";

interface StatItem {
  label: string;
  value: string | number;
  variant?: "default" | "success" | "warning" | "destructive";
}

interface OperationalSectionProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  href: string;
  stats?: StatItem[];
  actions?: ReactNode;
  children?: ReactNode;
}

const OperationalSection = ({
  title,
  description,
  icon: Icon,
  href,
  stats,
  actions,
  children,
}: OperationalSectionProps) => {
  const getVariantStyles = (variant?: StatItem["variant"]) => {
    switch (variant) {
      case "success":
        return "bg-accent/10 text-accent border-accent/20";
      case "warning":
        return "bg-warning/10 text-warning border-warning/20";
      case "destructive":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-space-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-3">
            <div className="h-10 w-10 rounded-radius-md bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              {description && (
                <CardDescription className="text-sm">{description}</CardDescription>
              )}
            </div>
          </div>
          <Button asChild variant="tertiary" size="sm">
            <Link to={href}>
              View All
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {stats && stats.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-space-3 mb-space-4">
            {stats.map((stat, i) => (
              <div 
                key={i} 
                className={`p-space-3 rounded-radius-md border ${getVariantStyles(stat.variant)}`}
              >
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
        {children}
        {actions && <div className="mt-space-4">{actions}</div>}
      </CardContent>
    </Card>
  );
};

export default OperationalSection;
