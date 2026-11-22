"use client";

import { useRef, type ReactNode } from "react";
import {
  MotionConfig,
  motion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";

const CALM_EASE = [0.16, 1, 0.3, 1] as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/**
 * Always renders at opacity: 1 so SSR and slow/reduced-motion clients
 * can never leave the page visually blank while inputs remain interactive.
 */
export function PageEntrance({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.28, ease: CALM_EASE }}
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
  return (
    <motion.div
      initial={{ y: 6 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.22, delay, ease: CALM_EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 240,
    damping: 34,
    restDelta: 0.001,
  });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2.5px] bg-transparent"
    >
      <motion.div
        className="h-full w-full bg-[#146C53]"
        style={{ scaleX, transformOrigin: "0% 50%" }}
      />
    </div>
  );
}

export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  y = 14,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      initial={{ y, scale: 0.99 }}
      whileInView={{ y: 0, scale: 1 }}
      viewport={{ once: true, amount: "some" }}
      transition={{ duration: 0.42, delay, ease: CALM_EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGroup({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: "some" }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.07,
            delayChildren: 0.03,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { y: 14, scale: 0.99 },
        visible: {
          y: 0,
          scale: 1,
          transition: { duration: 0.38, ease: CALM_EASE },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function ParallaxSurface({
  children,
  className = "",
  offset = 10,
}: {
  children: ReactNode;
  className?: string;
  offset?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset]);

  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}
