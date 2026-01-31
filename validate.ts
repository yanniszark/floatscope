import { readFileSync } from "fs";
import { FORMATS, bitsToDecimal, decimalToBits } from "./src/lib/float";

const reference = JSON.parse(readFileSync("reference_tables.json", "utf-8"));

// Map reference format names to our format names
const FORMAT_MAP: Record<string, string> = {
  f8e5m2: "f8e5m2",
  f8e4m3fn: "f8e4m3fn",
  f4e2m1: "f4e2m1",
};

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;

for (const [refName, ourName] of Object.entries(FORMAT_MAP)) {
  const format = FORMATS[ourName];
  const entries = reference[refName] as Array<{
    bits: number;
    binary: string;
    decimal: string;
  }>;

  let passed = 0;
  let failed = 0;

  for (const entry of entries) {
    const decoded = bitsToDecimal(entry.bits, format);

    // Parse reference value to a comparable form
    const refVal = parseRef(entry.decimal);
    const match = valuesEqual(decoded, refVal);

    if (match) {
      passed++;
    } else {
      failed++;
      if (failed <= 10) {
        console.log(
          `FAIL [${ourName}] bits=${entry.binary}: expected=${entry.decimal}, got=${decoded}`
        );
      }
    }
    totalTests++;
  }

  totalPassed += passed;
  totalFailed += failed;
  console.log(
    `${ourName}: ${passed}/${entries.length} passed${failed > 0 ? ` (${failed} FAILED)` : ""}`
  );
}

console.log(`\nTotal: ${totalPassed}/${totalTests} passed, ${totalFailed} failed`);

// Round-trip test: for every bit pattern, decode → encode should return the same bits
// (except for redundant NaN encodings which may canonicalize)
console.log("\n--- Round-trip: decode → encode ---");
let rtTotal = 0;
let rtPassed = 0;
let rtFailed = 0;

for (const [refName, ourName] of Object.entries(FORMAT_MAP)) {
  const format = FORMATS[ourName];
  const totalPatterns = 1 << format.totalBits;
  let passed = 0;
  let failed = 0;

  for (let bits = 0; bits < totalPatterns; bits++) {
    const decoded = bitsToDecimal(bits, format);
    let reEncoded: number;

    if (typeof decoded === "number") {
      reEncoded = decimalToBits(decoded, format);
    } else if (decoded === "NaN") {
      reEncoded = decimalToBits(NaN, format);
    } else if (decoded === "Infinity") {
      reEncoded = decimalToBits(Infinity, format);
    } else {
      reEncoded = decimalToBits(-Infinity, format);
    }

    // For NaN, multiple bit patterns may be valid; just check that decode of re-encoded is also NaN
    if (decoded === "NaN") {
      const reDecoded = bitsToDecimal(reEncoded, format);
      if (reDecoded === "NaN") {
        passed++;
      } else {
        failed++;
        if (failed <= 5) {
          const binary = bits.toString(2).padStart(format.totalBits, "0");
          console.log(`RT FAIL [${ourName}] ${binary}: NaN re-encoded to ${reEncoded} which decodes to ${reDecoded}`);
        }
      }
    } else if (reEncoded !== bits) {
      failed++;
      if (failed <= 5) {
        const binary = bits.toString(2).padStart(format.totalBits, "0");
        const reBinary = reEncoded.toString(2).padStart(format.totalBits, "0");
        console.log(`RT FAIL [${ourName}] ${binary} → ${decoded} → ${reBinary} (expected ${binary})`);
      }
    } else {
      passed++;
    }
    rtTotal++;
  }

  rtPassed += passed;
  rtFailed += failed;
  console.log(`${ourName}: ${passed}/${totalPatterns} round-trips passed${failed > 0 ? ` (${failed} FAILED)` : ""}`);
}

console.log(`\nRound-trip total: ${rtPassed}/${rtTotal} passed, ${rtFailed} failed`);

if (totalFailed > 0 || rtFailed > 0) {
  process.exit(1);
}

type Val = number | "NaN" | "Infinity" | "-Infinity";

function parseRef(s: string): Val {
  if (s === "NaN") return "NaN";
  if (s === "Infinity") return "Infinity";
  if (s === "-Infinity") return "-Infinity";
  if (s === "-0") return -0;
  return Number(s);
}

function valuesEqual(a: Val, b: Val): boolean {
  if (typeof a === "string" || typeof b === "string") {
    return a === b;
  }
  // Both numbers — handle -0
  if (Object.is(a, -0) && Object.is(b, -0)) return true;
  if (Object.is(a, -0) || Object.is(b, -0)) return false;
  return a === b;
}
