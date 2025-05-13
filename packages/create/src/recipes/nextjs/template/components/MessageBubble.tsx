import type { ReactNode } from "react";
import { Suspense } from "react";

export function Container({
  children,
  label,
  variant,
}: {
  children: ReactNode;
  label: string;
  variant: "sender" | "receiver";
}) {
  const containerClasses = `flex flex-col w-full ${variant === "sender" ? "items-end" : "items-start"}`;

  const bubblesContainerClasses = `flex flex-col gap-2 ${variant === "sender" ? "items-end" : "items-start"}`;

  return (
    <div className={containerClasses}>
      <span className="text-sm font-semibold text-gray-600 mb-1 mx-2">
        {label}
      </span>
      <div className={bubblesContainerClasses}>{children}</div>
    </div>
  );
}

export function Message({
  variant,
  children,
  className,
}: {
  variant: "sender" | "receiver";
  children: ReactNode;
  className?: string;
}) {
  const isSender = variant === "sender";

  const bubbleClasses = `p-2 rounded-lg shadow-md max-w-xs sm:max-w-sm md:max-w-md text-white ${isSender ? "bg-blue-500" : "bg-gray-400"} ${className}`;

  return (
    <div className={bubbleClasses}>
      <Suspense fallback={<TypingIndicator />}>{children}</Suspense>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-center space-x-1 h-6">
      <div className="w-2 h-2 bg-gray-600 rounded-full animate-pulse"></div>
      <div className="w-2 h-2 bg-gray-600 rounded-full animate-pulse delay-150"></div>
      <div className="w-2 h-2 bg-gray-600 rounded-full animate-pulse delay-300"></div>
    </div>
  );
}
