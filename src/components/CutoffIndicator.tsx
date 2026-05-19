import { Clock, AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface CutoffIndicatorProps {
  /** Hours remaining until cutoff, or null if already locked */
  hoursRemaining: number | null;
  /** Compact display for inline use */
  compact?: boolean;
  className?: string;
}

export function CutoffIndicator({ hoursRemaining, compact = false, className }: CutoffIndicatorProps) {
  // Already locked
  if (hoursRemaining === null || hoursRemaining <= 0) {
    return (
      <div className={cn(
        "flex items-center gap-space-2 text-muted-foreground",
        compact ? "text-xs" : "text-sm",
        className
      )}>
        <Lock className={cn(compact ? "h-3 w-3" : "h-4 w-4")} />
        {!compact && <span>Locked</span>}
        {compact && <span>locked</span>}
      </div>
    );
  }

  // Urgent - less than 3 hours
  if (hoursRemaining <= 3) {
    return (
      <div className={cn(
        "flex items-center gap-space-2 text-destructive",
        compact ? "text-xs" : "text-sm",
        className
      )}>
        <AlertTriangle className={cn(compact ? "h-3 w-3" : "h-4 w-4")} />
        <span>
          {compact 
            ? `${hoursRemaining}h left` 
            : `Only ${hoursRemaining}h left to change`
          }
        </span>
      </div>
    );
  }

  // Moderate urgency - less than 24 hours
  if (hoursRemaining <= 24) {
    return (
      <div className={cn(
        "flex items-center gap-space-2 text-warning",
        compact ? "text-xs" : "text-sm",
        className
      )}>
        <Clock className={cn(compact ? "h-3 w-3" : "h-4 w-4")} />
        <span>
          {compact 
            ? `${hoursRemaining}h left` 
            : `${hoursRemaining}h left to change`
          }
        </span>
      </div>
    );
  }

  // Plenty of time
  const days = Math.floor(hoursRemaining / 24);
  const hours = hoursRemaining % 24;
  
  return (
    <div className={cn(
      "flex items-center gap-space-2 text-muted-foreground",
      compact ? "text-xs" : "text-sm",
      className
    )}>
      <Clock className={cn(compact ? "h-3 w-3" : "h-4 w-4")} />
      <span>
        {compact 
          ? `${days}d ${hours}h left` 
          : `${days}d ${hours}h left to change`
        }
      </span>
    </div>
  );
}

interface MealDeadlineBannerProps {
  cutoffHours: number;
  mealTime: string;
  className?: string;
}

export function MealDeadlineBanner({ cutoffHours, mealTime, className }: MealDeadlineBannerProps) {
  return (
    <div className={cn(
      "p-space-3 bg-muted/50 border border-border/50 rounded-radius-md text-sm",
      className
    )}>
      <div className="flex items-start gap-space-2">
        <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium text-foreground">Change meals up to {cutoffHours}h before</p>
          <p className="text-muted-foreground">
            For {mealTime} meals, last change is {cutoffHours} hours before service time.
          </p>
        </div>
      </div>
    </div>
  );
}
