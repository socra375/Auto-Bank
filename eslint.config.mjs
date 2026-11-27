import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**", "scripts/preview/**"] },
  ...coreWebVitals,
  ...typescript,
];

export default config;
