"use client";

import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";

const MotionA = motion.create(Link);

export function MotionLink({
  href,
  className,
  children,
  download
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  download?: boolean;
}) {
  return (
    <MotionA
      href={href}
      className={className}
      {...(download ? { download: true } : {})}
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.97, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </MotionA>
  );
}
