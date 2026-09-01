import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**", "drizzle/**", "scripts/**", "next-env.d.ts"],
  },
  {
    rules: {
      // react/no-unescaped-entities produces phantom errors in this
      // codebase (false positives, wrong line numbers). JSX text never
      // contains a raw `"` so the rule is moot.
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
