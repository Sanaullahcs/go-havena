import {
  resolveRuleCategory,
  splitRuleCategory,
  buildCategoryOptions,
  RULE_OTHER_CATEGORY,
} from "../constants/community-rule-categories.js";

let failed = 0;

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
    return;
  }
  console.log("  ✓", msg);
}

console.log("\nCommunity rule category helpers");

ok(
  resolveRuleCategory("Parking", "") === "Parking",
  "managed resolves to itself",
);
ok(
  resolveRuleCategory(RULE_OTHER_CATEGORY, "Pool Rules") === "Pool Rules",
  "other resolves to custom name",
);
ok(
  resolveRuleCategory(RULE_OTHER_CATEGORY, "  Amenities  ") === "Amenities",
  "other trims custom name",
);

const options = buildCategoryOptions(["Noise", "Pets", "Noise"]);
ok(
  options.join("|") === "Noise|Pets|Other",
  "buildCategoryOptions uses managed only + Other (no hardcoded presets)",
);

const splitKnown = splitRuleCategory("Parking", ["Parking", "Pets"]);
ok(splitKnown.selection === "Parking" && splitKnown.customName === "", "split known managed");

const splitCustom = splitRuleCategory("Pool Rules", ["Parking"]);
ok(splitCustom.selection === RULE_OTHER_CATEGORY && splitCustom.customName === "Pool Rules", "split custom");

console.log(failed ? `\n${failed} failed` : "\nAll community rule category tests passed");
process.exit(failed ? 1 : 0);
