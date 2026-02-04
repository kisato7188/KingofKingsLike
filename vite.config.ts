import { defineConfig } from "vite";

const repoName = "KingofKingsLike";

export default defineConfig(({ command }) => {
  return {
    base: command === "build" ? `/${repoName}/` : "/",
  };
});
