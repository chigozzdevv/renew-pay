"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";


const CX = 310;
const CY = 240;
const VW = 640;
const VH = 480;
const LOGO_R = 48;

type CurrencyNode = {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  side: "fiat" | "stable";
};

const fiatNodes: CurrencyNode[] = [
  { id: "ngn", label: "NGN", sub: "Nigeria", x: 72, y: 100, side: "fiat" },
  { id: "kes", label: "KES", sub: "Kenya", x: 52, y: 240, side: "fiat" },
  { id: "ghs", label: "GHS", sub: "Ghana", x: 72, y: 380, side: "fiat" },
];

const stableNodes: CurrencyNode[] = [
  { id: "usdc", label: "USDC", sub: "Circle", x: 558, y: 115, side: "stable" },
  { id: "usdt", label: "USDT", sub: "Tether", x: 568, y: 255, side: "stable" },
  { id: "pyusd", label: "PYUSD", sub: "PayPal", x: 548, y: 385, side: "stable" },
];

const allNodes = [...fiatNodes, ...stableNodes];

function buildCurve(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const midX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
}

function Particle({
  pathId,
  delay,
  dur,
  color,
  size = 3,
}: {
  pathId: string;
  delay: number;
  dur: number;
  color: string;
  size?: number;
}) {
  return (
    <circle r={size} fill={color} opacity="0">
      <animateMotion dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite">
        <mpath href={`#${pathId}`} />
      </animateMotion>
      <animate
        attributeName="opacity"
        values="0;0.8;0.8;0"
        keyTimes="0;0.1;0.9;1"
        dur={`${dur}s`}
        begin={`${delay}s`}
        repeatCount="indefinite"
      />
    </circle>
  );
}

export function CurrencyNetwork() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const connections = allNodes.map((node, i) => {
    const isFiat = node.side === "fiat";
    const pillHalfW = isFiat ? 38 : 44;
    const from = isFiat
      ? { x: node.x + pillHalfW, y: node.y }
      : { x: CX + LOGO_R + 6, y: CY };
    const to = isFiat
      ? { x: CX - LOGO_R - 6, y: CY }
      : { x: node.x - pillHalfW, y: node.y };
    return {
      pathId: `path-${node.id}`,
      d: buildCurve(from, to),
      isFiat,
      index: i,
    };
  });

  return (
    <div className="relative mx-auto w-full">
      <motion.div
        initial={{ opacity: 0 }}
        animate={mounted ? { opacity: 1 } : {}}
        transition={{ duration: 0.8 }}
      >
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-auto w-full"
          role="img"
          aria-label="Fiat currencies flow through Renew and settle as stablecoins"
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="3" stdDeviation="10" floodColor="#000" floodOpacity="0.08" />
            </filter>

            <filter id="pill-shadow" x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#000" floodOpacity="0.06" />
            </filter>
          </defs>

          {[90, 130, 175].map((r, i) => (
            <motion.circle
              key={`ring-${r}`}
              cx={CX}
              cy={CY}
              r={r}
              fill="none"
              stroke="#16a34a"
              strokeOpacity={0.04 - i * 0.01}
              strokeWidth="1"
              strokeDasharray={i === 2 ? "3 6" : "none"}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={mounted ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.2 + i * 0.15, duration: 1 }}
              style={{ transformOrigin: `${CX}px ${CY}px` }}
            />
          ))}

          {connections.map(({ pathId, d, isFiat, index }) => {
            const strokeColor = isFiat ? "#c4c8cf" : "#86efac";
            return (
              <g key={pathId}>
                <path id={pathId} d={d} fill="none" stroke="none" />

                <motion.path
                  d={d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="1.2"
                  strokeOpacity="0.5"
                  initial={{ opacity: 0 }}
                  animate={mounted ? { opacity: 1 } : {}}
                  transition={{ delay: 0.4 + index * 0.12, duration: 0.8 }}
                />

                {mounted && (
                  <g filter="url(#glow)">
                    <Particle
                      pathId={pathId}
                      delay={index * 0.6}
                      dur={3.2}
                      color={isFiat ? "#6b7280" : "#22c55e"}
                      size={2.5}
                    />
                    <Particle
                      pathId={pathId}
                      delay={index * 0.6 + 1.6}
                      dur={3.2}
                      color={isFiat ? "#9ca3af" : "#4ade80"}
                      size={2}
                    />
                  </g>
                )}
              </g>
            );
          })}

          {allNodes.map((node) => {
            const isFiat = node.side === "fiat";
            const dx = isFiat ? 38 : -44;
            return (
              <motion.circle
                key={`c-${node.id}`}
                cx={node.x + dx}
                cy={node.y}
                r="2.5"
                fill={isFiat ? "#9ca3af" : "#4ade80"}
                initial={{ opacity: 0 }}
                animate={mounted ? { opacity: 0.7 } : {}}
                transition={{ delay: 0.8, duration: 0.5 }}
              />
            );
          })}

          {allNodes.map((node, i) => {
            const isStable = node.side === "stable";
            const w = isStable ? 90 : 76;
            const h = 44;

            return (
              <motion.g
                key={node.id}
                initial={{ opacity: 0, x: isStable ? 20 : -20 }}
                animate={mounted ? { opacity: 1, x: 0 } : {}}
                transition={{
                  delay: 0.35 + i * 0.1,
                  duration: 0.65,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <rect
                  x={node.x - w / 2}
                  y={node.y - h / 2}
                  width={w}
                  height={h}
                  rx="12"
                  fill="white"
                  stroke={isStable ? "rgba(22,163,74,0.12)" : "rgba(0,0,0,0.06)"}
                  strokeWidth="1"
                  filter="url(#pill-shadow)"
                />

                <text
                  x={node.x}
                  y={node.y - 4}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isStable ? "#15803d" : "#1f2937"}
                  fontSize="14"
                  fontWeight="700"
                  fontFamily="var(--font-geist), system-ui, sans-serif"
                  letterSpacing="-0.01em"
                >
                  {node.label}
                </text>

                <text
                  x={node.x}
                  y={node.y + 12}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#9ca3af"
                  fontSize="9"
                  fontFamily="var(--font-geist), system-ui, sans-serif"
                >
                  {node.sub}
                </text>
              </motion.g>
            );
          })}

          <motion.g
            initial={{ opacity: 0, scale: 0.5 }}
            animate={mounted ? { opacity: 1, scale: 1 } : {}}
            transition={{
              delay: 0.05,
              duration: 0.9,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{ transformOrigin: `${CX}px ${CY}px` }}
          >
            <circle
              cx={CX}
              cy={CY}
              r={LOGO_R + 10}
              fill="none"
              stroke="#16a34a"
              strokeOpacity="0.06"
              strokeWidth="1"
            >
              <animate
                attributeName="r"
                values={`${LOGO_R + 10};${LOGO_R + 20};${LOGO_R + 10}`}
                dur="4s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-opacity"
                values="0.06;0.14;0.06"
                dur="4s"
                repeatCount="indefinite"
              />
            </circle>

            <circle
              cx={CX}
              cy={CY}
              r={LOGO_R + 6}
              fill="none"
              stroke="#16a34a"
              strokeOpacity="0.04"
              strokeWidth="0.8"
            >
              <animate
                attributeName="r"
                values={`${LOGO_R + 6};${LOGO_R + 14};${LOGO_R + 6}`}
                dur="4s"
                begin="1s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-opacity"
                values="0.04;0.1;0.04"
                dur="4s"
                begin="1s"
                repeatCount="indefinite"
              />
            </circle>

            <circle
              cx={CX}
              cy={CY}
              r={LOGO_R}
              fill="white"
              filter="url(#shadow)"
            />

            <circle
              cx={CX}
              cy={CY}
              r={LOGO_R}
              fill="none"
              stroke="#16a34a"
              strokeOpacity="0.12"
              strokeWidth="1.5"
            />

            <image
              href="/renew-logo.png"
              x={CX - 36}
              y={CY - 16}
              width="72"
              height="32"
              preserveAspectRatio="xMidYMid meet"
            />
          </motion.g>

          <motion.g
            initial={{ opacity: 0 }}
            animate={mounted ? { opacity: 1 } : {}}
            transition={{ delay: 1.4, duration: 0.5 }}
          >
            <g transform={`translate(${CX - LOGO_R - 24}, ${CY})`}>
              <path
                d="M 0 -4 L 5 0 L 0 4"
                fill="none"
                stroke="#9ca3af"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.4"
              />
            </g>
            <g transform={`translate(${CX + LOGO_R + 18}, ${CY})`}>
              <path
                d="M 0 -4 L 5 0 L 0 4"
                fill="none"
                stroke="#22c55e"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.5"
              />
            </g>
          </motion.g>
        </svg>
      </motion.div>
    </div>
  );
}
