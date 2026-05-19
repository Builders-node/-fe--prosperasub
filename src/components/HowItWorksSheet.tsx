import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { HelpCircle, Calendar, Clock, Utensils, Truck, CheckCircle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface Step {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    icon: Calendar,
    title: "Choose a Weekly Plan",
    description: "Subscribe to a meal plan from your favorite restaurant. Plans are weekly and include breakfast, lunch, or dinner.",
  },
  {
    icon: Utensils,
    title: "Daily Meal Selection",
    description: "Each day, choose whether to eat-in at the restaurant, have it delivered, or skip the meal.",
  },
  {
    icon: Clock,
    title: "Respect the Cutoff",
    description: "Changes must be made at least 3 hours before meal time. After that, your choice is locked.",
  },
  {
    icon: Truck,
    title: "Delivery or Eat-in",
    description: "For delivery, set your address once in your profile. Each meal can have a different delivery location.",
  },
  {
    icon: CheckCircle,
    title: "Pay with Lightning",
    description: "Subscribe and pay instantly with Bitcoin Lightning. No recurring charges—you control the duration.",
  },
];

interface HowItWorksSheetProps {
  trigger?: React.ReactNode;
}

export function HowItWorksSheet({ trigger }: HowItWorksSheetProps) {
  const isMobile = useIsMobile();
  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="tertiary" size="sm">
            <HelpCircle className="h-4 w-4" />
            How it works
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "flex flex-col overflow-y-auto",
          isMobile ? "h-screen w-screen max-w-none rounded-none" : "w-full sm:max-w-md h-full"
        )}
      >
        <SheetHeader className="mb-space-6">
          <SheetTitle className="text-xl font-display">How Subscriptions Work</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-space-6 overflow-y-auto pb-space-8">
          {steps.map((step, index) => (
            <div key={index} className="flex gap-space-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-radius-lg bg-primary/10 flex items-center justify-center">
                <step.icon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-space-1">
                  {index + 1}. {step.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
          
          <div className="mt-space-8 p-space-4 bg-muted/50 rounded-radius-lg">
            <h4 className="font-semibold mb-space-2">💡 Quick Tips</h4>
            <ul className="text-sm text-muted-foreground space-y-space-1">
              <li>• Set your delivery address in your profile first</li>
              <li>• Check the meal calendar daily to manage choices</li>
              <li>• Cancelled meals don't get a refund, but save for later</li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
