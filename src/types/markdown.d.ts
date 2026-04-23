// Ambient declaration for raw markdown imports.
// Turbopack resolves these via `turbopack.rules` in next.config.mjs
// (scoped to the 3 OAuth setup docs under docs/).
declare module "*.md" {
  const content: string;
  export default content;
}
