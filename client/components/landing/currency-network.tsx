"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Node = {
  id: string;
  label: string;
  x: number;
  y: number;
  type: "fiat" | "stable" | "center";
};

type Connection = {
  from: string;
  to: string;
};

const nodes: Node[] = [
  // Fiat currencies (left side)
  { id: "usd", label: "USD", x: 100, y: 140, type: "fiat" },
  { id: "eur", label: "EUR", x: 60, y: 300, type: "fiat" },
  { id: "ngn", label: "NGN", x: 130, y: 460, type: "fiat" },
  { id: "gbp", label: "GBP", x: 220, y: 220, type: "fiat" },
  { id: "mxn", label: "MXN", x: 80, y: 560, type: "fiat" },

  // Center
  { id: "renew", label: "Renew", x: 450, y: 350, type: "center" },

  // Stablecoins (right side)
  { id: "usdc", label: "USDC", x: 780, y: 160, type: "stable" },
  { id: "usdt", label: "USDT", x: 820, y: 340, type: "stable" },
  { id: "pyusd", label: "PYUSD", x: 760, y: 510, type: "stable" },
];

const connections: Connection[] = [
  // Fiat → Renew
  { from: "usd", to: "renew" },
  { from: "eur", to: "renew" },
  { from: "ngn", to: "renew" },
  { from: "gbp", to: "renew" },
  { from: "mxn", to: "renew" },
  // Renew → Stablecoins
  { from: "renew", to: "usdc" },
  { from: "renew", to: "usdt" },
  { from: "renew", to: "pyusd" },
];

function getNode(id: string) {
  return nodes.find((n) => n.id === id)!;
}

function buildCurvePath(from: Node, to: Node): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cx1 = from.x + dx * 0.4;
  const cy1 = from.y + dy * 0.1;
  const cx2 = from.x + dx * 0.6;
  const cy2 = to.y - dy * 0.1;
  return `M ${from.x} ${from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${to.x} ${to.y}`;
}

function Particle({ path, delay, color }: { path: string; delay: number; color: string }) {
  return (
    <circle r="3" fill={color}>
      <animateMotion dur="3s" begin={`${delay}s`} repeatCount="indefinite" fill="freeze">
        <mpath href={`#${path}`} />
      </animateMotion>
      <animate
        attributeName="opacity"
        values="0;1;1;0"
        dur="3s"
        begin={`${delay}s`}
        repeatCount="indefinite"
      />
    </circle>
  );
}

export function CurrencyNetwork() {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-[56rem]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={mounted ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <svg
          viewBox="0 0 900 700"
          preserveAspectRatio="xMidYMid meet"
          className="h-auto w-full"
          aria-label="Currency network showing fiat currencies flowing through Renew to stablecoins"
        >
          <defs>
            {/* Gradient for fiat → center lines */}
            <linearGradient id="grad-fiat" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9ca3af" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#111111" stopOpacity="0.25" />
            </linearGradient>

            {/* Gradient for center → stable lines */}
            <linearGradient id="grad-stable" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#111111" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity="0.3" />
            </linearGradient>

            {/* Glow filter for center node */}
            <filter id="center-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Particle glow */}
            <filter id="particle-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Connection paths */}
          {connections.map((conn, i) => {
            const from = getNode(conn.from);
            const to = getNode(conn.to);
            const pathId = `path-${conn.from}-${conn.to}`;
            const d = buildCurvePath(from, to);
            const isFiatSide = from.type === "fiat";

            return (
              <g key={pathId}>
                {/* Invisible path for particle motion */}
                <path id={pathId} d={d} fill="none" stroke="none" />

                {/* Visible dashed line */}
                <motion.path
                  d={d}
                  fill="none"
                  stroke={`url(#grad-${isFiatSide ? "fiat" : "stable"})`}
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={mounted ? { pathLength: 1, opacity: 1 } : {}}
                  transition={{
                    pathLength: { duration: 1.2, delay: 0.3 + i * 0.12, ease: "easeInOut" },
                    opacity: { duration: 0.4, delay: 0.3 + i * 0.12 },
                  }}
                />

                {/* Animated particles */}
                {mounted && (
                  <g filter="url(#particle-glow)">
                    <Particle
                      path={pathId}
                      delay={i * 0.4}
                      color={isFiatSide ? "#6b7280" : "#16a34a"}
                    />
                    <Particle
                      path={pathId}
                      delay={i * 0.4 + 1.5}
                      color={isFiatSide ? "#6b7280" : "#16a34a"}
                    />
                  </g>
                )}
              </g>
            );
          })}

          {/* Small square connectors at node edges (like the reference image) */}
          {nodes
            .filter((n) => n.type !== "center")
            .map((node) => {
              const isStable = node.type === "stable";
              const offsetX = isStable ? -18 : 18;
              return (
                <motion.rect
                  key={`sq-${node.id}`}
                  x={node.x + offsetX - 3}
                  y={node.y - 3}
                  width="6"
                  height="6"
                  rx="1"
                  fill={isStable ? "#16a34a" : "#9ca3af"}
                  fillOpacity="0.5"
                  initial={{ opacity: 0 }}
                  animate={mounted ? { opacity: 1 } : {}}
                  transition={{ delay: 0.8, duration: 0.5 }}
                />
              );
            })}

          {/* Currency nodes */}
          {nodes
            .filter((n) => n.type !== "center")
            .map((node, i) => {
              const isStable = node.type === "stable";
              const w = isStable ? 82 : 68;
              const h = 36;

              return (
                <motion.g
                  key={node.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={mounted ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.4 + i * 0.08, duration: 0.5 }}
                >
                  <rect
                    x={node.x - w / 2}
                    y={node.y - h / 2}
                    width={w}
                    height={h}
                    rx="8"
                    fill="white"
                    stroke={isStable ? "rgba(22, 163, 74, 0.2)" : "rgba(0,0,0,0.08)"}
                    strokeWidth="1"
                  />
                  <text
                    x={node.x}
                    y={node.y + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isStable ? "#16a34a" : "#374151"}
                    fontSize="13"
                    fontWeight="600"
                    fontFamily="var(--font-geist), system-ui, sans-serif"
                  >
                    {node.label}
                  </text>
                </motion.g>
              );
            })}

          {/* Center Renew node */}
          <motion.g
            initial={{ opacity: 0, scale: 0.8 }}
            animate={mounted ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
            style={{ transformOrigin: "450px 350px" }}
          >
            {/* Outer pulse ring */}
            <circle cx="450" cy="350" r="52" fill="none" stroke="rgba(17,17,17,0.06)" strokeWidth="1">
              <animate
                attributeName="r"
                values="52;62;52"
                dur="3s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-opacity"
                values="0.06;0.12;0.06"
                dur="3s"
                repeatCount="indefinite"
              />
            </circle>

            {/* Main circle */}
            <circle
              cx="450"
              cy="350"
              r="46"
              fill="#111111"
              filter="url(#center-glow)"
            />

            {/* Renew text */}
            <text
              x="450"
              y="351"
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize="15"
              fontWeight="700"
              fontFamily="var(--font-geist), system-ui, sans-serif"
              letterSpacing="-0.02em"
            >
              renew
            </text>
          </motion.g>

          {/* Side labels */}
          <motion.text
            x="100"
            y="80"
            textAnchor="middle"
            fill="#9ca3af"
            fontSize="11"
            fontWeight="500"
            fontFamily="var(--font-geist), system-ui, sans-serif"
            letterSpacing="0.08em"
            initial={{ opacity: 0 }}
            animate={mounted ? { opacity: 1 } : {}}
            transition={{ delay: 1.2 }}
          >
            BILL IN FIAT
          </motion.text>

          <motion.text
            x="790"
            y="80"
            textAnchor="middle"
            fill="#16a34a"
            fontSize="11"
            fontWeight="500"
            fontFamily="var(--font-geist), system-ui, sans-serif"
            letterSpacing="0.08em"
            initial={{ opacity: 0 }}
            animate={mounted ? { opacity: 1 } : {}}
            transition={{ delay: 1.2 }}
          >
            SETTLE IN STABLE
          </motion.text>
        </svg>
      </motion.div>
    </div>
  );
}
