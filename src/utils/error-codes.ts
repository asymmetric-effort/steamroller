/**
 * Error and warning code constants for the bundler.
 *
 * These codes match rollup's error code system exactly, providing
 * structured identification for all errors and warnings emitted
 * during bundling.
 *
 * @module utils/error-codes
 */

export const ADDON_ERROR = "ADDON_ERROR" as const;
export const ALREADY_CLOSED = "ALREADY_CLOSED" as const;
export const AMBIGUOUS_EXTERNAL_NAMESPACES =
  "AMBIGUOUS_EXTERNAL_NAMESPACES" as const;
export const ANONYMOUS_PLUGIN_CACHE = "ANONYMOUS_PLUGIN_CACHE" as const;
export const ASSET_NOT_FINALISED = "ASSET_NOT_FINALISED" as const;
export const ASSET_NOT_FOUND = "ASSET_NOT_FOUND" as const;
export const ASSET_SOURCE_ALREADY_SET = "ASSET_SOURCE_ALREADY_SET" as const;
export const ASSET_SOURCE_MISSING = "ASSET_SOURCE_MISSING" as const;
export const BAD_LOADER = "BAD_LOADER" as const;
export const CANNOT_CALL_NAMESPACE = "CANNOT_CALL_NAMESPACE" as const;
export const CANNOT_EMIT_FROM_OPTIONS_HOOK =
  "CANNOT_EMIT_FROM_OPTIONS_HOOK" as const;
export const CHUNK_NOT_GENERATED = "CHUNK_NOT_GENERATED" as const;
export const CHUNK_INVALID = "CHUNK_INVALID" as const;
export const CIRCULAR_DEPENDENCY = "CIRCULAR_DEPENDENCY" as const;
export const CIRCULAR_REEXPORT = "CIRCULAR_REEXPORT" as const;
export const CYCLIC_CROSS_CHUNK_REEXPORT =
  "CYCLIC_CROSS_CHUNK_REEXPORT" as const;
export const DEPRECATED_FEATURE = "DEPRECATED_FEATURE" as const;
export const DUPLICATE_PLUGIN_NAME = "DUPLICATE_PLUGIN_NAME" as const;
export const EMPTY_BUNDLE = "EMPTY_BUNDLE" as const;
export const EVAL = "EVAL" as const;
export const EXTERNAL_MODULES_CANNOT_BE_INCLUDED_IN_MANUAL_CHUNKS =
  "EXTERNAL_MODULES_CANNOT_BE_INCLUDED_IN_MANUAL_CHUNKS" as const;
export const EXTERNAL_MODULES_CANNOT_BE_TRANSFORMED_TO_MODULES =
  "EXTERNAL_MODULES_CANNOT_BE_TRANSFORMED_TO_MODULES" as const;
export const EXTERNAL_SYNTHETIC_EXPORTS =
  "EXTERNAL_SYNTHETIC_EXPORTS" as const;
export const FILE_NAME_CONFLICT = "FILE_NAME_CONFLICT" as const;
export const FILE_NOT_FOUND = "FILE_NOT_FOUND" as const;
export const FIRST_SIDE_EFFECT = "FIRST_SIDE_EFFECT" as const;
export const ILLEGAL_IDENTIFIER_AS_NAME =
  "ILLEGAL_IDENTIFIER_AS_NAME" as const;
export const ILLEGAL_REASSIGNMENT = "ILLEGAL_REASSIGNMENT" as const;
export const INCONSISTENT_IMPORT_ASSERTIONS =
  "INCONSISTENT_IMPORT_ASSERTIONS" as const;
export const INVALID_CHUNK = "INVALID_CHUNK" as const;
export const INVALID_EXPORT_OPTION = "INVALID_EXPORT_OPTION" as const;
export const INVALID_EXTERNAL_ID = "INVALID_EXTERNAL_ID" as const;
export const INVALID_IMPORT_ATTRIBUTE = "INVALID_IMPORT_ATTRIBUTE" as const;
export const INVALID_LOG_POSITION = "INVALID_LOG_POSITION" as const;
export const INVALID_OPTION = "INVALID_OPTION" as const;
export const INVALID_PLUGIN_HOOK = "INVALID_PLUGIN_HOOK" as const;
export const INVALID_ROLLUP_PHASE = "INVALID_ROLLUP_PHASE" as const;
export const INVALID_SETASSETSOURCE = "INVALID_SETASSETSOURCE" as const;
export const INVALID_TLA_FORMAT = "INVALID_TLA_FORMAT" as const;
export const MISSING_CONFIG = "MISSING_CONFIG" as const;
export const MISSING_EXPORT = "MISSING_EXPORT" as const;
export const MISSING_EXTERNAL_CONFIG = "MISSING_EXTERNAL_CONFIG" as const;
export const MISSING_GLOBAL_NAME = "MISSING_GLOBAL_NAME" as const;
export const MISSING_IMPLICIT_DEPENDANT =
  "MISSING_IMPLICIT_DEPENDANT" as const;
export const MISSING_NAME_OPTION_FOR_IIFE_EXPORT =
  "MISSING_NAME_OPTION_FOR_IIFE_EXPORT" as const;
export const MISSING_NODE_BUILTINS = "MISSING_NODE_BUILTINS" as const;
export const MISSING_OPTION = "MISSING_OPTION" as const;
export const MIXED_EXPORTS = "MIXED_EXPORTS" as const;
export const MODULE_LEVEL_DIRECTIVE = "MODULE_LEVEL_DIRECTIVE" as const;
export const NAMESPACE_CONFLICT = "NAMESPACE_CONFLICT" as const;
export const NO_TRANSFORM_MAP_OR_AST_WITHOUT_CODE =
  "NO_TRANSFORM_MAP_OR_AST_WITHOUT_CODE" as const;
export const OPTIMIZE_CHUNK_STATUS = "OPTIMIZE_CHUNK_STATUS" as const;
export const PARSE_ERROR = "PARSE_ERROR" as const;
export const PLUGIN_ERROR = "PLUGIN_ERROR" as const;
export const SHIMMED_EXPORT = "SHIMMED_EXPORT" as const;
export const SOURCEMAP_BROKEN = "SOURCEMAP_BROKEN" as const;
export const SOURCEMAP_ERROR = "SOURCEMAP_ERROR" as const;
export const SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT =
  "SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT" as const;
export const THIS_IS_UNDEFINED = "THIS_IS_UNDEFINED" as const;
export const UNEXPECTED_NAMED_IMPORT = "UNEXPECTED_NAMED_IMPORT" as const;
export const UNKNOWN_OPTION = "UNKNOWN_OPTION" as const;
export const UNRESOLVED_ENTRY = "UNRESOLVED_ENTRY" as const;
export const UNRESOLVED_IMPORT = "UNRESOLVED_IMPORT" as const;
export const UNUSED_EXTERNAL_IMPORT = "UNUSED_EXTERNAL_IMPORT" as const;
export const VALIDATION_ERROR = "VALIDATION_ERROR" as const;
