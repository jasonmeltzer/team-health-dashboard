/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "team-data-core"],
  turbopack: {
    rules: {
      // Load the 3 OAuth setup docs as raw strings so DocViewerModal can
      // render them without a runtime fetch. Scoped by glob so other *.md
      // files (README.md etc.) are untouched.
      "docs/{github-oauth,linear-oauth,slack}-setup.md": {
        type: "raw",
      },
    },
  },
};

export default nextConfig;
