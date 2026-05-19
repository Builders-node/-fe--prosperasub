import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "peer flex w-full border bg-[hsl(var(--app-control))] text-foreground transition-colors placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 read-only:cursor-default read-only:bg-muted/60",
  {
    variants: {
      inputSize: {
        sm: "h-10 rounded-radius-sm px-space-4 text-control",
        md: "h-12 rounded-radius-md px-space-4 text-body",
        lg: "h-14 rounded-radius-md px-space-5 text-body",
        search: "h-[52px] rounded-radius-lg px-space-5 text-body",
      },
      state: {
        default: "border-border",
        error: "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25",
        success: "border-primary focus-visible:border-primary focus-visible:ring-primary/25",
        loading: "border-border",
      },
      hasLeftIcon: {
        true: "",
        false: "",
      },
      hasRightIcon: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      { inputSize: "sm", hasLeftIcon: true, className: "pl-space-10" },
      { inputSize: "md", hasLeftIcon: true, className: "pl-space-12" },
      { inputSize: "lg", hasLeftIcon: true, className: "pl-space-12" },
      { inputSize: "search", hasLeftIcon: true, className: "pl-space-12" },
      { inputSize: "sm", hasRightIcon: true, className: "pr-space-10" },
      { inputSize: "md", hasRightIcon: true, className: "pr-space-12" },
      { inputSize: "lg", hasRightIcon: true, className: "pr-space-12" },
      { inputSize: "search", hasRightIcon: true, className: "pr-space-12" },
    ],
    defaultVariants: {
      inputSize: "lg",
      state: "default",
      hasLeftIcon: false,
      hasRightIcon: false,
    },
  },
);

type InputState = NonNullable<VariantProps<typeof inputVariants>["state"]>;

export interface InputProps
  extends Omit<React.ComponentProps<"input">, "size">,
    Omit<VariantProps<typeof inputVariants>, "hasLeftIcon" | "hasRightIcon"> {
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  errorText?: React.ReactNode;
  successText?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  wrapperClassName?: string;
  loading?: boolean;
  passwordToggle?: boolean;
}

const getInputState = (
  state?: InputState | null,
  errorText?: React.ReactNode,
  successText?: React.ReactNode,
  loading?: boolean,
): InputState => {
  if (loading) return "loading";
  if (errorText) return "error";
  if (successText) return "success";
  return state ?? "default";
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      inputSize,
      state,
      label,
      helperText,
      errorText,
      successText,
      leftIcon,
      rightIcon,
      wrapperClassName,
      loading = false,
      passwordToggle = false,
      id,
      required,
      disabled,
      readOnly,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const [showPassword, setShowPassword] = React.useState(false);
    const resolvedState = getInputState(state, errorText, successText, loading);
    const descriptionId = `${inputId}-description`;
    const hasDescription = Boolean(errorText || successText || helperText);
    const resolvedType = passwordToggle && type === "password" && showPassword ? "text" : type;
    const endIcon = loading ? (
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    ) : passwordToggle && type === "password" ? (
      <button
        type="button"
        className="rounded-radius-full p-space-1 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
        onClick={() => setShowPassword((value) => !value)}
        disabled={disabled}
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    ) : (
      rightIcon
    );

    const control = (
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          type={resolvedType}
          className={cn(
            inputVariants({
              inputSize,
              state: resolvedState,
              hasLeftIcon: Boolean(leftIcon),
              hasRightIcon: Boolean(endIcon),
            }),
            className,
          )}
          ref={ref}
          required={required}
          disabled={disabled || loading}
          readOnly={readOnly}
          aria-invalid={resolvedState === "error" || undefined}
          aria-describedby={hasDescription ? descriptionId : undefined}
          {...props}
        />
        {endIcon && (
          <span className="absolute right-4 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">
            {endIcon}
          </span>
        )}
      </div>
    );

    if (!label && !helperText && !errorText && !successText) {
      return control;
    }

    return (
      <div className={cn("space-y-space-2", wrapperClassName)}>
        {label && (
          <label htmlFor={inputId} className="block text-label text-foreground">
            {label}
            {required && (
              <span className="ml-1 text-primary" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        {control}
        {hasDescription && (
          <p
            id={descriptionId}
            className={cn(
              "text-caption",
              errorText ? "text-destructive" : successText ? "text-primary" : "text-muted-foreground",
            )}
          >
            {errorText || successText || helperText}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input, inputVariants };
