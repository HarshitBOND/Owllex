// regenerator-runtime ships no types. It is imported for one reason only:
// @pdf-lib/fontkit's Indic shaping is compiled against a regenerator runtime it
// does not bundle, and throws "regeneratorRuntime is not defined" the moment a
// Devanagari or Gurmukhi font is shaped without it.
declare module "regenerator-runtime" {
  const runtime: unknown
  export default runtime
}
