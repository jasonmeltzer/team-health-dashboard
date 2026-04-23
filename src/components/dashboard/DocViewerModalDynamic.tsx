"use client";

import dynamic from "next/dynamic";

// Lazy-load DocViewerModal so react-markdown + remark-gfm + the 3 markdown strings
// only enter the bundle when a user first opens a setup guide. Keeps the initial
// dashboard page under the Phase 04.1 50 KB bundle budget.
const DocViewerModal = dynamic(() => import("./DocViewerModal"), { ssr: false });

export default DocViewerModal;
export { DocViewerModal as DocViewerModalDynamic };
