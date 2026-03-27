import { cn } from "@/lib/utils";

type LogoProps = {
  inverted?: boolean;
  size?: "default" | "compact";
};

export function Logo({ inverted = false, size = "default" }: LogoProps) {
  const sizeClass =
    size === "compact"
      ? "h-6 w-[5.75rem] max-sm:h-5 max-sm:w-[4.75rem]"
      : "h-9 w-[8.5rem] max-sm:h-7 max-sm:w-[6.75rem]";

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        sizeClass,
        inverted ? "opacity-95" : "",
      )}
    >
      <img
        src="/renew-logo.png"
        alt="Renew"
        width={500}
        height={500}
        className="h-full w-full object-contain object-left"
      />
    </div>
  );
}
