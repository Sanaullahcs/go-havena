import {
  resolveDocumentCategory,
  splitDocumentCategory,
  buildDocumentCategoryOptions,
  documentMatchesCategory,
  isPresetDocumentCategory,
  DOCUMENT_OTHER_CATEGORY,
  DOCUMENT_PRESET_CATEGORIES,
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
  DOCUMENT_PRESET_CATEGORIES.join("|") === "Rules & Policies|Maintenance|Financial|Property",
  "presets match Community Admin / backend",
);

ok(
  resolveDocumentCategory("Maintenance", "") === "Maintenance",
  "preset resolves to itself",
);
ok(
  resolveDocumentCategory(DOCUMENT_OTHER_CATEGORY, "HOA Minutes") === "HOA Minutes",
  "other resolves to custom name",
);
ok(
  resolveDocumentCategory(DOCUMENT_OTHER_CATEGORY, "  Insurance  ") === "Insurance",
  "other trims custom name",
);

const options = buildDocumentCategoryOptions(["Forms", "Safety", "Civic"]);
ok(
  options.join("|") === "Rules & Policies|Maintenance|Financial|Property|Others",
  "buildDocumentCategoryOptions is presets + Others (ignores legacy managed names)",
);

const splitKnown = splitDocumentCategory("Financial", []);
ok(splitKnown.selection === "Financial" && splitKnown.customName === "", "split known preset");

const splitCustom = splitDocumentCategory("Civic", []);
ok(
  splitCustom.selection === DOCUMENT_OTHER_CATEGORY && splitCustom.customName === "Civic",
  "legacy Civic splits into Others",
);

ok(isPresetDocumentCategory("Property"), "Property is preset");
ok(!isPresetDocumentCategory("Forms"), "Forms is not preset");
ok(documentMatchesCategory("Forms", "Others"), "Forms matches Others filter");
ok(documentMatchesCategory("Financial", "Financial"), "Financial exact match");
ok(!documentMatchesCategory("Financial", "Others"), "Financial does not match Others");
ok(documentMatchesCategory("Grounds", "all"), "all passes any category");

console.log(failed ? `\n${failed} failed` : "\nAll document category tests passed");
process.exit(failed ? 1 : 0);
