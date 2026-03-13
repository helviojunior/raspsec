import React from "react";
import { cn } from "lib/utils";
import { Loader2 } from "lucide-react";

const variantStyles = {
  default:
    "bg-primary text-primary-foreground hover:bg-indigo-600 active:bg-indigo-700 shadow-sm",
  outline:
    "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-red-600 shadow-sm",
};

const sizeStyles = {
  default: "h-10 px-4 py-2 text-sm",
  sm: "h-9 px-3 text-xs rounded-md",
  lg: "h-11 px-8 text-base rounded-md",
};

const Button = React.forwardRef(
  (
    {
      className,
      variant = "default",
      size = "default",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
