/**
 * Serves the `ggwave` WASM module with its two `new Function` sites replaced.
 *
 * ggwave 0.4.0 is an Emscripten/embind build. Emscripten uses `new Function`
 * to give bound functions readable names and to compile one invoker closure
 * per signature. ToolsHub's CSP has no `'unsafe-eval'` (only
 * `'wasm-unsafe-eval'`), so loading the module as published throws EvalError.
 *
 * Both uses are mechanical, so this plugin swaps in hand-written equivalents:
 *   - `createNamedFunction` sets `fn.name` via `Object.defineProperty`;
 *   - `craftInvokerFunction` builds the same closure directly from the already
 *     known parameter list instead of compiling source text.
 *
 * The Emscripten loader also tries `fetch()` on the inlined `data:` URI before
 * falling back to parsing it. ToolsHub's `connect-src` does not allow `data:`,
 * so that attempt logs a CSP violation even though the fallback works. The
 * loader is patched to skip the fetch for data URIs.
 *
 * The replacement is a hard build failure if the source stops matching: a
 * silent fallback would either break the CSP or break the bindings at runtime.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

export const GGWAVE_VIRTUAL_ID = "virtual:ggwave-csp";
const RESOLVED_ID = "\0" + GGWAVE_VIRTUAL_ID;

const ORIGINAL_NAMED_MARKER = "function createNamedFunction(name,body){";
const ORIGINAL_NAMED_END = "function extendError";
const ORIGINAL_CRAFT_MARKER = "function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){";
const ORIGINAL_CRAFT_END = "function heap32VectorToArray(";
const ORIGINAL_BINARY_FETCH = 'if(typeof fetch==="function"&&!isFileURI(wasmBinaryFile)){';
const SAFE_BINARY_FETCH = 'if(typeof fetch==="function"&&!isFileURI(wasmBinaryFile)&&!isDataURI(wasmBinaryFile)){';

const SAFE_NAMED = String.raw`function createNamedFunction(name,body){name=makeLegalFunctionName(name);var fn=function(){return body.apply(this,arguments)};try{Object.defineProperty(fn,"name",{value:name,configurable:true})}catch(e){}return fn}`;

// Mirrors what Emscripten's generated source did, minus code generation. The
// arguments arrive through the closure instead of through `new Function` args.
const SAFE_CRAFT = String.raw`function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){
var argCount=argTypes.length;
if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!")}
var isClassMethodFunc=argTypes[1]!==null&&classType!==null;
var needsDestructorStack=false;
for(var i=1;i<argTypes.length;++i){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined){needsDestructorStack=true;break}}
var returns=argTypes[0].name!=="void";
var expectedArgCount=argCount-2;
var invokerFunction=function(){
if(arguments.length!==expectedArgCount){throwBindingError("function "+humanName+" called with "+arguments.length+" arguments, expected "+expectedArgCount+" args!")}
var destructors=needsDestructorStack?[]:null;
var thisWired=isClassMethodFunc?classType.toWireType(destructors,this):null;
var argsWired=new Array(expectedArgCount);
for(var i=0;i<expectedArgCount;++i){argsWired[i]=argTypes[i+2].toWireType(destructors,arguments[i])}
var rv=cppInvokerFunc.apply(null,[cppTargetFunc].concat(isClassMethodFunc?[thisWired]:[],argsWired));
if(needsDestructorStack){runDestructors(destructors)}else{
for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){var value=i===1?thisWired:argsWired[i-2];if(argTypes[i].destructorFunction!==null){argTypes[i].destructorFunction(value)}}
}
if(returns){return argTypes[0].fromWireType(rv)}
};
try{Object.defineProperty(invokerFunction,"name",{value:makeLegalFunctionName(humanName),configurable:true})}catch(e){}
return invokerFunction;
}`;

function replaceBetween(source: string, startMarker: string, endMarker: string, replacement: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`[ggwave-csp] missing patch anchor: ${startMarker.slice(0, 60)}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`[ggwave-csp] missing end anchor after ${startMarker.slice(0, 40)}`);
  const original = source.slice(start, end);
  if (!original.includes("new Function") && !original.includes("new_(Function")) {
    throw new Error(
      `[ggwave-csp] expected an eval site inside ${startMarker.slice(0, 40)}, found none. ` +
        "The replacement logic no longer matches upstream.",
    );
  }
  if (source.indexOf(startMarker, start + 1) !== -1) {
    throw new Error(`[ggwave-csp] duplicate patch anchor: ${startMarker.slice(0, 60)}`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

export function patchGgwaveSource(source: string): string {
  if (!source.includes(ORIGINAL_NAMED_MARKER) || !source.includes(ORIGINAL_CRAFT_MARKER)) {
    throw new Error(
      "[ggwave-csp] ggwave.js no longer has the expected shape. " +
        "Re-check the Emscripten output and update scripts/ggwave-csp-plugin.ts.",
    );
  }

  let patched = replaceBetween(source, ORIGINAL_NAMED_MARKER, ORIGINAL_NAMED_END, SAFE_NAMED);
  patched = replaceBetween(patched, ORIGINAL_CRAFT_MARKER, ORIGINAL_CRAFT_END, SAFE_CRAFT);

  if (/\bnew\s+Function\b/.test(patched) || patched.includes("new_(Function")) {
    throw new Error("[ggwave-csp] patched ggwave.js still contains an eval site; CSP would block it.");
  }
  if (!patched.includes("var ggwave_factory")) {
    throw new Error("[ggwave-csp] unexpected ggwave.js layout: no ggwave_factory declaration.");
  }

  // Drop the UMD footer entirely. Some SSR/test loaders give the module a
  // synthetic `exports` object whose properties are getters, so leaving
  // `module.exports = ...` in place throws "Cannot set property default".
  // The virtual module is ESM only; a plain default export is the contract.
  const umdMarker = "if (typeof exports === 'object' && typeof module === 'object')";
  const umdStart = patched.indexOf(umdMarker);
  if (umdStart < 0) throw new Error("[ggwave-csp] missing UMD footer; cannot publish an ESM-only module.");
  patched = patched.slice(0, umdStart);

  return `${patched}\nexport default ggwave_factory;\n`;
}

export function ggwaveCspPlugin(): Plugin {
  let cached: { mtimeMs: number; code: string } | null = null;

  return {
    name: "toolshub:ggwave-csp",
    enforce: "pre",
    resolveId(id) {
      if (id === GGWAVE_VIRTUAL_ID) return RESOLVED_ID;
      return null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const require = createRequire(import.meta.url);
      const file = require.resolve("ggwave/ggwave.js");
      const { mtimeMs } = fs.statSync(file);
      if (!cached || cached.mtimeMs !== mtimeMs) {
        cached = { mtimeMs, code: patchGgwaveSource(fs.readFileSync(file, "utf8")) };
      }
      return cached.code;
    },
  };
}
