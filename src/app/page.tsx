"use client";

import { useState } from "react";
import {
  FORMATS,
  FloatFormat,
  decimalToBits,
  bitsToDecimal,
  bitsToComponents,
  formatBinary,
  formatHex,
  getInterpretation,
  parseBinaryInput,
} from "@/lib/float";
import styles from "./page.module.css";

const FORMAT_KEYS = ["f8e5m2", "f8e4m3", "f8e4m3fn", "f4e2m1"] as const;

export default function Home() {
  const [formatKey, setFormatKey] = useState<string>("f8e5m2");
  const [decimalInput, setDecimalInput] = useState("1.0");
  const [binaryInput, setBinaryInput] = useState("00111100");
  const [error, setError] = useState("");

  const format: FloatFormat = FORMATS[formatKey];

  // Compute current bits from decimal input (the "source of truth" on load)
  let currentBits: number | null = null;

  // Try to derive bits from decimal input
  const decimalParsed = parseDecimalInput(decimalInput);
  if (decimalParsed !== null) {
    currentBits = decimalToBits(decimalParsed, format);
  }

  // If binary input matches format, use it for display
  const binaryParsed = parseBinaryInput(binaryInput, format);
  if (binaryParsed !== null && currentBits === null) {
    currentBits = binaryParsed;
  }

  // Use currentBits derived from whichever input was last edited
  // We track this via the handlers below

  const handleDecimalChange = (val: string) => {
    setDecimalInput(val);
    setError("");

    if (val === "" || val === "-") return;

    const parsed = parseDecimalInput(val);
    if (parsed === null) {
      setError("Invalid decimal number");
      return;
    }

    const bits = decimalToBits(parsed, format);
    setBinaryInput(formatBinary(bits, format));
  };

  const handleBinaryChange = (val: string) => {
    setBinaryInput(val);
    setError("");

    const cleaned = val.replace(/[\s_]/g, "");
    if (cleaned.length === 0) return;

    if (!/^[01]*$/.test(cleaned)) {
      setError("Binary input must contain only 0s and 1s");
      return;
    }

    if (cleaned.length !== format.totalBits) {
      setError(`Binary input must be exactly ${format.totalBits} bits for ${format.name}`);
      return;
    }

    const bits = parseInt(cleaned, 2);
    const decoded = bitsToDecimal(bits, format);
    if (typeof decoded === "number") {
      setDecimalInput(Object.is(decoded, -0) ? "-0" : String(decoded));
    } else {
      setDecimalInput(decoded);
    }
  };

  const handleFormatChange = (key: string) => {
    setFormatKey(key);
    setError("");

    const newFormat = FORMATS[key];

    // Re-encode the current decimal value in the new format
    const parsed = parseDecimalInput(decimalInput);
    if (parsed !== null) {
      const bits = decimalToBits(parsed, newFormat);
      setBinaryInput(formatBinary(bits, newFormat));
    } else {
      // Reset to zero for new format
      setDecimalInput("0");
      setBinaryInput("0".repeat(newFormat.totalBits));
    }
  };

  // Determine display bits
  let displayBits: number | null = null;
  const dp = parseDecimalInput(decimalInput);
  if (dp !== null) {
    displayBits = decimalToBits(dp, format);
  } else {
    const bp = parseBinaryInput(binaryInput, format);
    if (bp !== null) displayBits = bp;
  }

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Numeric Format Converter</h1>

      {/* Format Tabs */}
      <div className={styles.tabs}>
        {FORMAT_KEYS.map((key) => (
          <button
            key={key}
            className={`${styles.tab} ${formatKey === key ? styles.tabActive : ""}`}
            onClick={() => handleFormatChange(key)}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Input Section */}
      <div className={styles.inputSection}>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Decimal Value</label>
          <input
            className={styles.input}
            type="text"
            value={decimalInput}
            onChange={(e) => handleDecimalChange(e.target.value)}
            placeholder="e.g. 3.5, -0.125, NaN, Infinity"
          />
        </div>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>
            Binary String ({format.totalBits} bits)
          </label>
          <input
            className={styles.input}
            type="text"
            value={binaryInput}
            onChange={(e) => handleBinaryChange(e.target.value)}
            placeholder={`e.g. ${"0".repeat(format.totalBits)}`}
          />
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>

      {/* Output Panel */}
      {displayBits !== null && (
        <OutputPanel bits={displayBits} format={format} originalInput={dp} />
      )}
    </main>
  );
}

function OutputPanel({
  bits,
  format,
  originalInput,
}: {
  bits: number;
  format: FloatFormat;
  originalInput: number | null;
}) {
  const decoded = bitsToDecimal(bits, format);
  const components = bitsToComponents(bits, format);
  const binary = formatBinary(bits, format);
  const hex = formatHex(bits, format);
  const interpretation = getInterpretation(bits, format);

  const decimalDisplay =
    typeof decoded === "number"
      ? Object.is(decoded, -0)
        ? "-0"
        : String(decoded)
      : String(decoded);

  // Determine if rounding occurred
  let roundingMessage: string | null = null;
  if (
    originalInput !== null &&
    typeof decoded === "number" &&
    Number.isFinite(originalInput) &&
    !Number.isNaN(originalInput)
  ) {
    if (!Object.is(originalInput, decoded) && originalInput !== decoded) {
      if (!Number.isFinite(decoded)) {
        // Overflowed to infinity
        roundingMessage = `${originalInput} overflows in ${format.name} → rounded to ${decoded > 0 ? "+Infinity" : "-Infinity"}`;
      } else if (decoded === 0 && originalInput !== 0) {
        // Underflowed to zero
        const sign = Object.is(decoded, -0) ? "-0" : "0";
        roundingMessage = `${originalInput} underflows in ${format.name} → rounded to ${sign}`;
      } else {
        const direction = Math.abs(decoded) > Math.abs(originalInput) ? "up" : "down";
        roundingMessage = `${originalInput} is not exactly representable in ${format.name} → rounded ${direction} to ${decoded}`;
      }
    }
  } else if (
    originalInput !== null &&
    Number.isFinite(originalInput) &&
    !Number.isNaN(originalInput) &&
    typeof decoded === "string"
  ) {
    if (decoded === "Infinity" || decoded === "-Infinity") {
      roundingMessage = `${originalInput} overflows in ${format.name} → rounded to ${decoded}`;
    }
  }

  // Build bit array with categories
  const bitChars = binary.split("");
  const categories: ("sign" | "exponent" | "mantissa")[] = [];
  categories.push("sign");
  for (let i = 0; i < format.exponentBits; i++) categories.push("exponent");
  for (let i = 0; i < format.mantissaBits; i++) categories.push("mantissa");

  return (
    <div className={styles.outputPanel}>
      <div className={styles.outputRow}>
        <span className={styles.outputLabel}>Decimal</span>
        <span className={styles.outputValue}>{decimalDisplay}</span>
      </div>
      <div className={styles.outputRow}>
        <span className={styles.outputLabel}>Binary</span>
        <span className={styles.outputValue}>{binary}</span>
      </div>
      <div className={styles.outputRow}>
        <span className={styles.outputLabel}>Hex</span>
        <span className={styles.outputValue}>{hex}</span>
      </div>

      {/* Rounding Notice */}
      {roundingMessage && (
        <div className={styles.roundingNotice}>{roundingMessage}</div>
      )}

      {/* Bit Breakdown */}
      <div className={styles.bitBreakdown}>
        <div className={styles.bitBreakdownLabel}>Bit Breakdown</div>
        <div className={styles.bitSegments}>
          {bitChars.map((ch, i) => {
            const cat = categories[i];
            const cls =
              cat === "sign"
                ? styles.bitSign
                : cat === "exponent"
                ? styles.bitExponent
                : styles.bitMantissa;
            return (
              <span key={i} className={`${styles.bit} ${cls}`}>
                {ch}
              </span>
            );
          })}
        </div>
        <div className={styles.bitLegend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendSign}`} />
            Sign ({components.signBits})
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendExp}`} />
            Exponent ({components.exponentBits})
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendMant}`} />
            Mantissa ({components.mantissaBits})
          </span>
        </div>
      </div>

      {/* Interpretation */}
      <div className={styles.interpretation}>{interpretation}</div>
    </div>
  );
}

function parseDecimalInput(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  if (/^-?nan$/i.test(trimmed)) return NaN;
  if (/^inf(inity)?$/i.test(trimmed) || trimmed === "+Infinity") return Infinity;
  if (/^-inf(inity)?$/i.test(trimmed)) return -Infinity;
  if (trimmed === "-0") return -0;

  const num = Number(trimmed);
  if (Number.isNaN(num)) return null;
  return num;
}
