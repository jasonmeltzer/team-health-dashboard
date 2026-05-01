/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "team-data-core"],
  turbopack: {
    rules: {
      // Load the 3 OAuth setup docs as raw strings so DocViewerModal can
      // render them without a runtime fetch. Glob anchors on *.md basename;
      // DocViewerModal is the only site that imports .md files, so this
      // effectively scopes to the 3 OAuth setup docs it references.
      "*.md": {
        type: "raw",
      },
    },
  },
};

export default nextConfig;
