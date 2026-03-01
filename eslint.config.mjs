// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

// 核心魔法：绕开官方残留的 extends 字段，只提取纯净的 rules
const rawConfig = obsidianmd.configs.recommended;
const obsidianRules = Array.isArray(rawConfig)
  ? Object.assign({}, ...rawConfig.map(c => c.rules || {}))
  : (rawConfig.rules || {});

export default [
  {
    // 指定只检查 .ts 文件
    files: ["**/*.ts"],
    
    // 配置 TypeScript 解析器
    languageOptions: {
      parser: tsparser,
      parserOptions: { 
        project: "./tsconfig.json" 
      },
    },
    
    // 手动注册 Obsidian 插件
    plugins: {
      obsidianmd: obsidianmd,
    },
    
    // 注入我们刚刚提取出来的纯净规则
    rules: obsidianRules,
  }
];
