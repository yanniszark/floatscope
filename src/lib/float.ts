/**
 * How special values (max exponent) are interpreted:
 * - "ieee": mantissa=0 → ±Inf, mantissa≠0 → NaN (e.g. f8e5m2)
 * - "all-nan": all max-exponent patterns are NaN, no Inf (e.g. f8e4m3 OCP MX)
 * - "fn": only max-exponent + max-mantissa is NaN, rest are finite (e.g. f8e4m3fn NVIDIA)
 * - "none": no special values, all bit patterns are finite (e.g. f4e2m1 OCP MX)
 */
export type SpecialValueMode = "ieee" | "all-nan" | "fn" | "none";

export interface FloatFormat {
  name: string;
  totalBits: number;
  exponentBits: number;
  mantissaBits: number;
  bias: number;
  specialValues: SpecialValueMode;
}

export const FORMATS: Record<string, FloatFormat> = {
  f8e5m2: {
    name: "f8e5m2",
    totalBits: 8,
    exponentBits: 5,
    mantissaBits: 2,
    bias: 15,
    specialValues: "ieee",
  },
  f8e4m3: {
    name: "f8e4m3",
    totalBits: 8,
    exponentBits: 4,
    mantissaBits: 3,
    bias: 7,
    specialValues: "all-nan",
  },
  f8e4m3fn: {
    name: "f8e4m3fn",
    totalBits: 8,
    exponentBits: 4,
    mantissaBits: 3,
    bias: 7,
    specialValues: "fn",
  },
  f4e2m1: {
    name: "f4e2m1",
    totalBits: 4,
    exponentBits: 2,
    mantissaBits: 1,
    bias: 1,
    specialValues: "none",
  },
};

export interface BitComponents {
  sign: number;
  exponent: number;
  mantissa: number;
  signBits: string;
  exponentBits: string;
  mantissaBits: string;
}

export function bitsToComponents(
  bits: number,
  format: FloatFormat
): BitComponents {
  const mantissaMask = (1 << format.mantissaBits) - 1;
  const exponentMask = (1 << format.exponentBits) - 1;

  const mantissa = bits & mantissaMask;
  const exponent = (bits >> format.mantissaBits) & exponentMask;
  const sign = (bits >> (format.exponentBits + format.mantissaBits)) & 1;

  return {
    sign,
    exponent,
    mantissa,
    signBits: sign.toString(2),
    exponentBits: exponent.toString(2).padStart(format.exponentBits, "0"),
    mantissaBits: mantissa.toString(2).padStart(format.mantissaBits, "0"),
  };
}

export type DecodedValue = number | "NaN" | "Infinity" | "-Infinity";

export function bitsToDecimal(
  bits: number,
  format: FloatFormat
): DecodedValue {
  const { sign, exponent, mantissa } = bitsToComponents(bits, format);
  const maxExponent = (1 << format.exponentBits) - 1;

  // All exponent bits set
  if (exponent === maxExponent) {
    if (format.specialValues === "ieee") {
      if (mantissa === 0) {
        return sign === 0 ? "Infinity" : "-Infinity";
      }
      return "NaN";
    } else if (format.specialValues === "all-nan") {
      return "NaN";
    } else if (format.specialValues === "fn") {
      // Only max mantissa is NaN, rest are normal finite values
      const maxMantissa = (1 << format.mantissaBits) - 1;
      if (mantissa === maxMantissa) {
        return "NaN";
      }
      // Fall through to normal value calculation below
    }
    // "none": all patterns are finite, fall through
  }

  const signMul = sign === 0 ? 1 : -1;

  if (exponent === 0) {
    // Zero or subnormal
    if (mantissa === 0) {
      return sign === 0 ? 0 : -0;
    }
    // Subnormal: value = (-1)^s × 2^(1-bias) × (0.mantissa)
    const mantissaVal = mantissa / (1 << format.mantissaBits);
    return signMul * Math.pow(2, 1 - format.bias) * mantissaVal;
  }

  // Normal: value = (-1)^s × 2^(exponent-bias) × (1.mantissa)
  const mantissaVal = 1 + mantissa / (1 << format.mantissaBits);
  return signMul * Math.pow(2, exponent - format.bias) * mantissaVal;
}

export function decimalToBits(value: number, format: FloatFormat): number {
  const maxExponent = (1 << format.exponentBits) - 1;
  const maxMantissa = (1 << format.mantissaBits) - 1;

  // Handle NaN
  if (Number.isNaN(value)) {
    if (format.specialValues === "ieee") {
      // exponent=all 1s, mantissa=1
      return (maxExponent << format.mantissaBits) | 1;
    } else if (format.specialValues === "none") {
      // No NaN representation; return max finite value
      const { maxFiniteExponent, maxFiniteMantissa } = getMaxFinite(format);
      return (maxFiniteExponent << format.mantissaBits) | maxFiniteMantissa;
    } else {
      // "all-nan" and "fn": exponent=all 1s, mantissa=all 1s
      return (maxExponent << format.mantissaBits) | maxMantissa;
    }
  }

  // Determine sign
  const sign = Object.is(value, -0) || value < 0 ? 1 : 0;
  const absVal = Math.abs(value);

  // Handle infinity
  if (!Number.isFinite(value)) {
    if (format.specialValues === "ieee") {
      return (sign << (format.exponentBits + format.mantissaBits)) |
        (maxExponent << format.mantissaBits);
    } else {
      // No infinity representation; clamp to max finite value
      const { maxFiniteExponent, maxFiniteMantissa } = getMaxFinite(format);
      return (sign << (format.exponentBits + format.mantissaBits)) |
        (maxFiniteExponent << format.mantissaBits) | maxFiniteMantissa;
    }
  }

  // Handle zero
  if (absVal === 0) {
    return sign << (format.exponentBits + format.mantissaBits);
  }

  // Calculate the max finite value for this format
  const { maxFiniteExponent, maxFiniteMantissa } = getMaxFinite(format);
  const maxFiniteValue =
    Math.pow(2, maxFiniteExponent - format.bias) *
    (1 + maxFiniteMantissa / (1 << format.mantissaBits));

  // Overflow: clamp to infinity or max value
  if (absVal > maxFiniteValue) {
    if (format.specialValues === "ieee") {
      return (sign << (format.exponentBits + format.mantissaBits)) |
        (maxExponent << format.mantissaBits);
    } else {
      return (sign << (format.exponentBits + format.mantissaBits)) |
        (maxFiniteExponent << format.mantissaBits) | maxFiniteMantissa;
    }
  }

  // Find exponent
  let exp = Math.floor(Math.log2(absVal));
  let frac = absVal / Math.pow(2, exp);

  // frac should be in [1, 2), adjust if needed
  if (frac >= 2) {
    exp += 1;
    frac /= 2;
  } else if (frac < 1) {
    exp -= 1;
    frac *= 2;
  }

  const biasedExp = exp + format.bias;

  if (biasedExp <= 0) {
    // Subnormal
    // value = 2^(1-bias) × (0.mantissa)
    const subnormalShift = Math.pow(2, 1 - format.bias);
    let mantissaVal = absVal / subnormalShift;
    let mantissaInt = Math.round(mantissaVal * (1 << format.mantissaBits));

    if (mantissaInt > maxMantissa) mantissaInt = maxMantissa;
    if (mantissaInt <= 0) {
      // Too small, round to zero
      return sign << (format.exponentBits + format.mantissaBits);
    }

    return (sign << (format.exponentBits + format.mantissaBits)) | mantissaInt;
  }

  // Normal number
  let biasedExpClamped = biasedExp;
  if (biasedExpClamped > maxFiniteExponent) {
    biasedExpClamped = maxFiniteExponent;
  }

  // mantissa = (frac - 1) * 2^mantissaBits, rounded
  let mantissaInt = Math.round((frac - 1) * (1 << format.mantissaBits));

  // Handle rounding overflow (mantissa rounds up to next power)
  if (mantissaInt > maxMantissa) {
    mantissaInt = 0;
    biasedExpClamped += 1;
  }

  // Check if we've exceeded the max representable finite value
  if (biasedExpClamped > maxFiniteExponent ||
      (biasedExpClamped === maxFiniteExponent && mantissaInt > maxFiniteMantissa)) {
    if (format.specialValues === "ieee") {
      return (sign << (format.exponentBits + format.mantissaBits)) |
        (maxExponent << format.mantissaBits);
    } else {
      return (sign << (format.exponentBits + format.mantissaBits)) |
        (maxFiniteExponent << format.mantissaBits) | maxFiniteMantissa;
    }
  }

  return (sign << (format.exponentBits + format.mantissaBits)) |
    (biasedExpClamped << format.mantissaBits) |
    mantissaInt;
}

/**
 * Returns the max biased exponent and mantissa that represent a finite value.
 * - ieee: maxExp-1 with all mantissa bits set
 * - all-nan: maxExp-1 with all mantissa bits set
 * - fn: maxExp with mantissa = maxMantissa-1 (maxMantissa is NaN)
 * - none: maxExp with all mantissa bits set (everything is finite)
 */
function getMaxFinite(format: FloatFormat): {
  maxFiniteExponent: number;
  maxFiniteMantissa: number;
} {
  const maxExponent = (1 << format.exponentBits) - 1;
  const maxMantissa = (1 << format.mantissaBits) - 1;

  if (format.specialValues === "none") {
    return { maxFiniteExponent: maxExponent, maxFiniteMantissa: maxMantissa };
  }
  if (format.specialValues === "fn") {
    return { maxFiniteExponent: maxExponent, maxFiniteMantissa: maxMantissa - 1 };
  }
  // "ieee" and "all-nan": all max-exponent patterns are special
  return { maxFiniteExponent: maxExponent - 1, maxFiniteMantissa: maxMantissa };
}

export function formatBinary(bits: number, format: FloatFormat): string {
  return bits.toString(2).padStart(format.totalBits, "0");
}

export function formatHex(bits: number, format: FloatFormat): string {
  const hexDigits = Math.ceil(format.totalBits / 4);
  return "0x" + bits.toString(16).toUpperCase().padStart(hexDigits, "0");
}

export function getInterpretation(
  bits: number,
  format: FloatFormat
): string {
  const { sign, exponent, mantissa } = bitsToComponents(bits, format);
  const maxExponent = (1 << format.exponentBits) - 1;
  const value = bitsToDecimal(bits, format);

  if (exponent === maxExponent) {
    if (format.specialValues === "ieee") {
      if (mantissa === 0) return `${sign === 0 ? "+" : "-"}Infinity`;
      return "NaN";
    } else if (format.specialValues === "all-nan") {
      return "NaN";
    } else if (format.specialValues === "fn") {
      const maxMant = (1 << format.mantissaBits) - 1;
      if (mantissa === maxMant) return "NaN";
      // Otherwise it's a normal value — fall through below
    }
    // "none": all patterns are finite, fall through
  }

  const signStr = `(-1)^${sign}`;

  if (exponent === 0 && mantissa === 0) {
    return `${sign === 0 ? "+" : "-"}0`;
  }

  const mantissaBin = mantissa.toString(2).padStart(format.mantissaBits, "0");

  if (exponent === 0) {
    // Subnormal
    const expVal = 1 - format.bias;
    return `${signStr} × 2^(${expVal}) × 0.${mantissaBin} = ${value}`;
  }

  // Normal
  const expVal = exponent - format.bias;
  return `${signStr} × 2^(${exponent}-${format.bias}) × 1.${mantissaBin} = ${value}`;
}

export function parseBinaryInput(
  input: string,
  format: FloatFormat
): number | null {
  const cleaned = input.replace(/[\s_]/g, "");
  if (cleaned.length !== format.totalBits) return null;
  if (!/^[01]+$/.test(cleaned)) return null;
  return parseInt(cleaned, 2);
}
