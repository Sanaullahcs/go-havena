import {
  resolveDocumentCategory,
  splitDocumentCategory,
  buildDocumentCategoryOptions,
  DOCUMENT_OTHER_CATEGORY,
} from "../constants/document-categories.js";

let failed = 0;

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
    return;
  }
  console.log("  ✓", msg);
}

console.log("\nDocument category helpers");

ok(
  resolveDocumentCategory("Safety", "") === "Safety",
  "managed resolves to itself",
);
ok(
  resolveDocumentCategory(DOCUMENT_OTHER_CATEGORY, "HOA Minutes") === "HOA Minutes",
  "other resolves to custom name",
);
ok(
  resolveDocumentCategory(DOCUMENT_OTHER_CATEGORY, "  Insurance  ") === "Insurance",
  "other trims custom name",
);

const options = buildDocumentCategoryOptions(["Forms", "Safety", "Forms"]);
ok(
  options.join("|") === "Forms|Safety|Other",
  "buildDocumentCategoryOptions uses managed only + Other",
);

const splitKnown = splitDocumentCategory("Forms", ["Forms", "Safety"]);
ok(splitKnown.selection === "Forms" && splitKnown.customName === "", "split known managed");

const splitCustom = splitDocumentCategory("HOA Minutes", ["Forms"]);
ok(splitCustom.selection === DOCUMENT_OTHER_CATEGORY && splitCustom.customName === "HOA Minutes", "split custom");

console.log(failed ? `\n${failed} failed` : "\nAll document category tests passed");
process.exit(failed ? 1 : 0);
