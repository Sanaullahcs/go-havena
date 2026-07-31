import * as React from "react";

type ContainerProps = {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
};

/**
 * Centered, responsive max-width wrapper used by every section.
 * Mirrors the "gutter" feel of the mobile app.
 */
export function Container({
  children,
  className = "",
  size = "lg",
}: ContainerProps) {
  const sizes = {
    sm: "max-w-4xl",
    md: "max-w-5xl",
    lg: "max-w-6xl",
    xl: "max-w-7xl",
    "2xl": "max-w-screen-2xl",
  } as const;

  return (
    <div className={`mx-auto w-full px-5 sm:px-8 lg:px-10 ${sizes[size]} ${className}`}>
      {children}
    </div>
  );
}

export default Container;
