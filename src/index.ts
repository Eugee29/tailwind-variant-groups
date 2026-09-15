export { VariantGroupSyntaxError } from "./core/error.js";
export {
  transformVariantGroups,
  type TransformOptions,
  type TransformResult,
} from "./core/transform.js";
export {
  expandVariantGroupsInText,
  splitTopLevelUtilities,
  type ExpandTextOptions,
  type TextExpansion,
} from "./core/expand-text.js";
export {
  parseVariantGroupClassList,
  type ClassCandidateNode,
  type ClassListNode,
  type ParseClassListOptions,
  type TextRange,
  type VariantGroupNode,
} from "./core/parse-class-list.js";
