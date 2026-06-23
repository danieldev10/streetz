import Image from "next/image";

type BrandLogoSize = "compact" | "header" | "sidebar" | "hero" | "payment";

const sizeClasses: Record<BrandLogoSize, string> = {
  compact: "h-11 w-11",
  header: "h-14 w-14",
  sidebar: "h-16 w-16",
  hero: "h-36 w-36 md:h-44 md:w-44",
  payment: "h-24 w-24",
};

export function BrandLogo({
  size = "header",
  className = "",
  priority = false,
}: {
  size?: BrandLogoSize;
  className?: string;
  priority?: boolean;
}) {
  const classes = [sizeClasses[size], "object-contain", className].filter(Boolean).join(" ");

  return <Image src="/cclogo.png" alt="Crushclub" width={647} height={647} priority={priority} className={classes} />;
}
