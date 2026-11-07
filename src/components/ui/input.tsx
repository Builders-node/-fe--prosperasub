import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One field look for the whole app (DESIGN.md §6, Fields).
 *
 * A filled grey surface — the same `muted` fill as a secondary button — with
 * NO border. The old field was a fill darker than the card under it plus a
 * 1px rim the same colour as the card, so in dark mode it all but vanished
 * and an error's red border could not be seen. Focus and error are rings.
 *
 * Heights: 48 for a form (md/lg) · 40 inside a row, toolbar or filter (sm).
 * Radius 16 everywhere; a toolbar search may be a pill. Text is 15 (the
 * global iOS rule raises it to 16 on phones so Safari does not zoom).
 * `color-scheme` follows the theme so native date/time/select glyphs are
 * visible in dark.
 */
export const FIELD_SURFACE =
  "w-full rounded-radius-md border-0 bg-muted text-body text-foreground transition-shadow placeholder:text-muted-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 [&:read-only:not(select)]:cursor-default [&:read-only:not(select)]:text-muted-foreground [color-scheme:light] dark:[color-scheme:dark]";

/** For a hand-made <select>/<input>/<textarea> that cannot use the components. 40 tall. */
export const fieldClass = `${FIELD_SURFACE} h-10 px-4`;

const STATE = {
  default: "",
  error: "ring-2 ring-destructive/70 focus-visible:ring-destructive/70",
  success: "ring-2 ring-positive/60 focus-visible:ring-positive/60",
  loading: "",
};

const inputVariants = cva(
  `peer flex ${FIELD_SURFACE}`,
  {
    variants: {
      inputSize: {
        sm: "h-10 px-4",
        md: "h-12 px-4",
        /** Retired 56: renders as md. */
        lg: "h-12 px-4",
        search: "h-12 rounded-full px-5",
      },
      state: STATE,
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
      { inputSize: "sm", hasLeftIcon: true, className: "pl-10" },
      { inputSize: "md", hasLeftIcon: true, className: "pl-11" },
      { inputSize: "lg", hasLeftIcon: true, className: "pl-11" },
      { inputSize: "search", hasLeftIcon: true, className: "pl-12" },
      { inputSize: "sm", hasRightIcon: true, className: "pr-10" },
      { inputSize: "md", hasRightIcon: true, className: "pr-11" },
      { inputSize: "lg", hasRightIcon: true, className: "pr-11" },
      { inputSize: "search", hasRightIcon: true, className: "pr-12" },
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
          <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">
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
          <span className="absolute right-3.5 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">
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
