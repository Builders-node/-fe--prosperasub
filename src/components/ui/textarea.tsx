import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const textareaVariants = cva(
  "peer flex min-h-[132px] w-full resize-y rounded-radius-md border bg-[hsl(var(--app-control))] px-space-5 py-space-4 text-body text-foreground transition-colors placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 read-only:cursor-default read-only:bg-muted/60",
  {
    variants: {
      state: {
        default: "border-border",
        error: "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25",
        success: "border-primary focus-visible:border-primary focus-visible:ring-primary/25",
        loading: "border-border",
      },
    },
    defaultVariants: {
      state: "default",
    },
  },
);

type TextareaState = NonNullable<VariantProps<typeof textareaVariants>["state"]>;

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  errorText?: React.ReactNode;
  successText?: React.ReactNode;
  wrapperClassName?: string;
  loading?: boolean;
  showCount?: boolean;
}

const getTextareaState = (
  state?: TextareaState | null,
  errorText?: React.ReactNode,
  successText?: React.ReactNode,
  loading?: boolean,
): TextareaState => {
  if (loading) return "loading";
  if (errorText) return "error";
  if (successText) return "success";
  return state ?? "default";
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      state,
      label,
      helperText,
      errorText,
      successText,
      wrapperClassName,
      loading = false,
      showCount = false,
      id,
      required,
      disabled,
      readOnly,
      maxLength,
      value,
      defaultValue,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;
    const resolvedState = getTextareaState(state, errorText, successText, loading);
    const descriptionId = `${textareaId}-description`;
    const countId = `${textareaId}-count`;
    const hasDescription = Boolean(errorText || successText || helperText);
    const describedBy = [hasDescription ? descriptionId : null, showCount && maxLength ? countId : null]
      .filter(Boolean)
      .join(" ");
    const length =
      typeof value === "string"
        ? value.length
        : typeof defaultValue === "string"
          ? defaultValue.length
          : undefined;

    const control = (
      <div className="relative">
        <textarea
          id={textareaId}
          className={cn(textareaVariants({ state: resolvedState }), loading && "pr-space-12", className)}
          ref={ref}
          required={required}
          disabled={disabled || loading}
          readOnly={readOnly}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          aria-invalid={resolvedState === "error" || undefined}
          aria-describedby={describedBy || undefined}
          {...props}
        />
        {loading && (
          <Loader2
            className="absolute right-4 top-4 h-4 w-4 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>
    );

    if (!label && !helperText && !errorText && !successText && !showCount) {
      return control;
    }

    return (
      <div className={cn("space-y-space-2", wrapperClassName)}>
        {label && (
          <label htmlFor={textareaId} className="block text-label text-foreground">
            {label}
            {required && (
              <span className="ml-1 text-primary" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        {control}
        {(hasDescription || (showCount && maxLength)) && (
          <div className="flex items-center justify-between gap-space-3">
            {hasDescription ? (
              <p
                id={descriptionId}
                className={cn(
                  "text-caption",
                  errorText ? "text-destructive" : successText ? "text-primary" : "text-muted-foreground",
                )}
              >
                {errorText || successText || helperText}
              </p>
            ) : (
              <span />
            )}
            {showCount && maxLength && (
              <p id={countId} className="text-caption text-muted-foreground">
                {length ?? 0}/{maxLength}
              </p>
            )}
          </div>
        )}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea, textareaVariants };
