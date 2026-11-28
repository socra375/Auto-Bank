import { useId } from "react";
import { TAGLINE, WORDMARK } from "./wordmark-paths";

/**
 * Auto-Bank logo: ORIGINAL inline SVG (an approximation of the owner's artwork, no raster, no runtime font).
 * Every usage in the app goes through this one component, so swapping in the owner's original is a one-file change (docs/BRANDING.md).
 * The accessible name lives on the <svg>; every drawing group is aria-hidden. Orange/gold here is brand artwork only,
 * never a UI colour (buttons, links and active states keep the navy/blue palette).
 */
export type LogoVariant = "mark" | "horizontal" | "full";

const VB = { mark: [240, 240], horizontal: [1040, 240], full: [640, 540] } as const;
const WM_SCALE = 1.42;

// Orbit ring: two offset ellipses drawn with even-odd -> a crescent that tapers at both ends. Tilted so the upper-right end rises.
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const RING = ell(120, 112, 116, 40) + ell(120, 107, 111, 33);
const TILT = "rotate(-24 120 112)";
// Where the ring's upper-right end sits after the tilt (centre + rotated (rx, 0)).
const SPARK = { x: 120 + 112 * Math.cos((24 * Math.PI) / 180), y: 112 - 112 * Math.sin((24 * Math.PI) / 180) };

// The letter A (even-odd: outer outline + triangular counter), legs share one slant so the bars sit squarely in the opening.
const A_PATH = "M92 26H148L214 212H166L152 172H88L74 212H26ZM120 62L142 124H98Z";
const BARS = [
  { x: 90, h: 18 },
  { x: 111, h: 30 },
  { x: 132, h: 44 },
];

function Scene({ id, w, h, r }: { id: string; w: number; h: number; r: number }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14110f" />
          <stop offset="0.55" stopColor="#09090b" />
          <stop offset="1" stopColor="#120d0a" />
        </linearGradient>
        <linearGradient id={`${id}-sw`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb347" stopOpacity="0.9" />
          <stop offset="1" stopColor="#e8590c" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-pc`}><rect width={w} height={h} rx={r} /></clipPath>
      </defs>
      <rect width={w} height={h} rx={r} fill={`url(#${id}-bg)`} />
      <g clipPath={`url(#${id}-pc)`} fill="none" stroke={`url(#${id}-sw)`} strokeLinecap="round">
        <path d={`M-10 ${h * 0.34}C${w * 0.14} ${h * 0.3} ${w * 0.3} ${h * 0.12} ${w * 0.38} -10`} strokeWidth={w * 0.012} opacity="0.7" />
        <path d={`M-10 ${h * 0.4}C${w * 0.16} ${h * 0.36} ${w * 0.34} ${h * 0.16} ${w * 0.44} -10`} strokeWidth={w * 0.006} opacity="0.5" />
        <path d={`M${w + 10} ${h * 0.66}C${w * 0.86} ${h * 0.7} ${w * 0.7} ${h * 0.88} ${w * 0.62} ${h + 10}`} strokeWidth={w * 0.012} opacity="0.7" />
        <path d={`M${w + 10} ${h * 0.6}C${w * 0.84} ${h * 0.64} ${w * 0.66} ${h * 0.84} ${w * 0.56} ${h + 10}`} strokeWidth={w * 0.006} opacity="0.5" />
      </g>
    </>
  );
}

function Mark({ id }: { id: string }) {
  return (
    <g transform="translate(120 122) scale(0.9) translate(-120 -120)">
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="26" x2="0" y2="212" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd37a" />
          <stop offset="0.38" stopColor="#ff9f2e" />
          <stop offset="1" stopColor="#d9480f" />
        </linearGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e8590c" />
          <stop offset="0.55" stopColor="#ffa43a" />
          <stop offset="1" stopColor="#ffe08a" />
        </linearGradient>
        <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#9aa5b4" />
        </linearGradient>
        <linearGradient id={`${id}-hi`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="#fff2c2" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ffb347" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff8a1a" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-aclip`}><path d={A_PATH} clipRule="evenodd" /></clipPath>
        <clipPath id={`${id}-front`}><rect x="-40" y="113" width="330" height="160" transform={TILT} /></clipPath>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>

      {/* orbit, back half: sits behind the letter */}
      <g transform={TILT}><path d={RING} fillRule="evenodd" fill={`url(#${id}-ring)`} opacity="0.95" /></g>

      {/* the letter, with a 3D read: lit left face, shaded right face, top highlight, soft base shadow */}
      <path d={A_PATH} fillRule="evenodd" fill="#000" opacity="0.5" transform="translate(0 6)" filter={`url(#${id}-soft)`} />
      <path d={A_PATH} fillRule="evenodd" fill={`url(#${id}-a)`} />
      <g clipPath={`url(#${id}-aclip)`}>
        <path d="M120 20L230 20V220H150Z" fill="#7a2300" opacity="0.28" />
        <rect x="20" y="26" width="200" height="70" fill={`url(#${id}-hi)`} />
        <path d="M92 26L26 212" stroke="#fff3d6" strokeOpacity="0.55" strokeWidth="2.4" fill="none" />
        <path d="M74 212L88 172H152" stroke="#7a2300" strokeOpacity="0.4" strokeWidth="2" fill="none" />
      </g>

      {/* growth bars in the opening of the A */}
      {BARS.map((b) => (
        <rect key={b.x} x={b.x} y={206 - b.h} width="13" height={b.h} rx="2.5" fill={`url(#${id}-bar)`} />
      ))}

      {/* orbit, front half: crosses over the letter */}
      <g clipPath={`url(#${id}-front)`}>
        <g transform={TILT}>
          <path d={RING} fillRule="evenodd" fill="#3a1100" opacity="0.55" transform="translate(0 3.5)" filter={`url(#${id}-soft)`} />
          <path d={RING} fillRule="evenodd" fill={`url(#${id}-ring)`} />
        </g>
      </g>

      {/* sparkle at the upper-right end of the orbit */}
      <g transform={`translate(${SPARK.x.toFixed(1)} ${SPARK.y.toFixed(1)})`}>
        <circle r="26" fill={`url(#${id}-glow)`} />
        <path d="M0-24C1.6-8 8-1.6 24 0C8 1.6 1.6 8 0 24C-1.6 8-8 1.6-24 0C-8-1.6-1.6-8 0-24Z" fill="#fff8e1" />
      </g>
    </g>
  );
}

function Wordmark({ id, x, baseline, scale }: { id: string; x: number; baseline: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${baseline}) scale(${scale})`}>
      <defs>
        <linearGradient id={`${id}-w`} x1="0" y1="-73" x2="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#b4bcc9" />
        </linearGradient>
        <linearGradient id={`${id}-o`} x1="0" y1="-73" x2="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffbe55" />
          <stop offset="1" stopColor="#ea5a0c" />
        </linearGradient>
      </defs>
      <path d={WORDMARK.auto} fill={`url(#${id}-w)`} />
      <path d={WORDMARK.bank} fill={`url(#${id}-o)`} />
    </g>
  );
}

function Tagline({ id, cx, baseline }: { id: string; cx: number; baseline: number }) {
  const x0 = cx - TAGLINE.width / 2;
  return (
    <g>
      <g transform={`translate(${x0.toFixed(1)} ${baseline})`}>
        <path d={TAGLINE.d} fill="#c3c8d1" />
        {TAGLINE.dots.map((dx) => <circle key={dx} cx={dx} cy="-6.5" r="2.4" fill="#ff8a1a" />)}
      </g>
      <defs>
        <linearGradient id={`${id}-ln`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c3c8d1" stopOpacity="0" />
          <stop offset="0.5" stopColor="#c3c8d1" stopOpacity="0.55" />
          <stop offset="1" stopColor="#c3c8d1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={cx - 150} y={baseline + 30} width="300" height="1.5" fill={`url(#${id}-ln)`} />
      <rect x={cx - 4.5} y={baseline + 26.5} width="9" height="9" fill="#ff8a1a" transform={`rotate(45 ${cx} ${baseline + 31})`} />
    </g>
  );
}

export function Logo({
  variant = "horizontal", size = 36, panel = false, className, title = "Auto-Bank", decorative = false,
}: {
  variant?: LogoVariant;
  /** Rendered height in px (width follows the artwork's aspect ratio). */
  size?: number;
  /** Draws the near-black scene behind the artwork: use it on light backgrounds. The full lockup always has it. */
  panel?: boolean;
  className?: string;
  title?: string;
  /** Hide it from assistive tech when the brand name is already written next to it. */
  decorative?: boolean;
}) {
  const id = `ab${useId().replace(/:/g, "")}`;
  const [w, h] = VB[variant];
  const scene = panel || variant === "full";
  return (
    <svg
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": title })} viewBox={`0 0 ${w} ${h}`} width={Math.round((size * w) / h)} height={size}
      className={className} focusable="false" style={{ flex: "none" }}
    >
      <g aria-hidden="true">
        {scene && <Scene id={id} w={w} h={h} r={variant === "full" ? 56 : variant === "mark" ? 54 : 44} />}
        {variant === "mark" && <Mark id={id} />}
        {variant === "horizontal" && (
          <>
            <Mark id={id} />
            <Wordmark id={id} x={262 - WORDMARK.x1 * WM_SCALE} baseline={172} scale={WM_SCALE} />
          </>
        )}
        {variant === "full" && (
          <>
            <g transform="translate(160 40)"><Mark id={id} /></g>
            <Wordmark id={id} x={(w - WORDMARK.width * 1.0) / 2 - WORDMARK.x1} baseline={388} scale={1} />
            <Tagline id={id} cx={w / 2} baseline={452} />
          </>
        )}
      </g>
    </svg>
  );
}
