"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

const CALM_EASE = [0.16, 1, 0.3, 1] as const;

export function PageEntrance({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: CALM_EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SmoothCard({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay, ease: CALM_EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
