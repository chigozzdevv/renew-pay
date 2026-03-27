type Dot = {
  x: number;
  y: number;
  pulse: boolean;
  delay: number;
};

function buildDots() {
  const dots: Dot[] = [];
  const step = 18;
  let pulseCount = 0;

  for (let y = 36; y <= 864; y += step) {
    for (let x = 36; x <= 1566; x += step) {
      const dx = x - 800;
      const dy = y - 390;

      const inCenterCutout =
        (dx * dx) / (360 * 360) + (dy * dy) / (185 * 185) < 1;

      if (inCenterCutout) {
        continue;
      }

      const edgeBias = Math.max(Math.abs(dx) / 800, Math.abs(y - 450) / 450);
      const contour =
        Math.sin(x * 0.018) +
        Math.cos(y * 0.024) +
        Math.sin((x + y) * 0.011) +
        Math.cos((x - y) * 0.009);

      const topBand = y < 190 && (x < 520 || x > 1080);
      const sideBands =
        (x < 290 && y > 160 && y < 780) ||
        (x > 1310 && y > 150 && y < 780);
      const bottomBand = y > 650;
      const innerShoulder =
        ((x > 280 && x < 520) || (x > 1080 && x < 1320)) &&
        y > 500 &&
        y < 760;

      const isEligibleZone = topBand || sideBands || bottomBand || innerShoulder;
      const keep =
        isEligibleZone &&
        ((edgeBias > 0.58 && contour > -0.65) ||
          (bottomBand && contour > -1.15) ||
          (topBand && contour > -0.85));

      if (!keep) {
        continue;
      }

      const pulse =
        ((x > 1180 && y > 520 && contour > 1.7) ||
          (x < 260 && y > 520 && contour > 1.55) ||
          (y < 180 && x > 1220 && contour > 1.45) ||
          (y > 720 && x > 660 && x < 980 && contour > 1.8)) &&
        pulseCount < 10;

      if (pulse) {
        pulseCount += 1;
      }

      dots.push({
        x,
        y,
        pulse,
        delay: ((x + y) % 7) * 0.22,
      });
    }
  }

  return dots;
}

const dots = buildDots();
const baseDots = dots.filter((dot) => !dot.pulse);
const pulseDots = dots.filter((dot) => dot.pulse);

export function HeroGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
      >
        <g fill="rgba(13, 75, 40, 0.16)">
          {baseDots.map((dot) => (
            <circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r="1.8" />
          ))}
        </g>

        <g fill="rgba(13, 75, 40, 0.34)">
          {pulseDots.map((dot) => (
            <circle key={`${dot.x}-${dot.y}-pulse`} cx={dot.x} cy={dot.y} r="1.9">
              <animate
                attributeName="r"
                values="1.9;2.6;1.9"
                dur="1.8s"
                begin={`${dot.delay}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="fill-opacity"
                values="0.34;0.7;0.34"
                dur="1.8s"
                begin={`${dot.delay}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
        </g>
      </svg>
    </div>
  );
}
