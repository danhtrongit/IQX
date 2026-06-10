import js from "@eslint/js"
import pluginVue from "eslint-plugin-vue"
import tseslint from "typescript-eslint"
import vueTs from "@vue/eslint-config-typescript"

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules"] },
  js.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  ...vueTs(),
  {
    files: ["**/*.{ts,vue}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/html-self-closing": "off",
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
)
