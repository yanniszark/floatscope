"""Generate reference tables from gfloat for all bit patterns."""
import json
import math
from gfloat.formats import format_info_ocp_e5m2, format_info_ocp_e4m3, format_info_ocp_e2m1
from gfloat import decode_float

# Map our format names to gfloat format objects
FORMATS = {
    "f8e5m2": (format_info_ocp_e5m2, 8),
    # ocp_e4m3 has num_high_nans=1, max=448 — matches our f8e4m3fn
    "f8e4m3fn": (format_info_ocp_e4m3, 8),
    "f4e2m1": (format_info_ocp_e2m1, 4),
}

result = {}

for name, (fmt, total_bits) in FORMATS.items():
    entries = []
    for bits in range(1 << total_bits):
        fv = decode_float(fmt, bits)
        val = fv.fval
        # Represent as a string for JSON: "NaN", "Infinity", "-Infinity", or a number
        if math.isnan(val):
            val_str = "NaN"
        elif math.isinf(val):
            val_str = "Infinity" if val > 0 else "-Infinity"
        elif val == 0.0 and math.copysign(1.0, val) < 0:
            val_str = "-0"
        else:
            val_str = repr(val)

        binary = format(bits, f'0{total_bits}b')
        entries.append({"bits": bits, "binary": binary, "decimal": val_str})

    result[name] = entries

with open("reference_tables.json", "w") as f:
    json.dump(result, f, indent=2)

# Print summary
for name, entries in result.items():
    nans = sum(1 for e in entries if e["decimal"] == "NaN")
    infs = sum(1 for e in entries if "Infinity" in e["decimal"])
    print(f"{name}: {len(entries)} values, {nans} NaN, {infs} Inf")
    # Print first few and last few
    for e in entries[:4]:
        print(f"  {e['binary']} → {e['decimal']}")
    print(f"  ...")
    for e in entries[-4:]:
        print(f"  {e['binary']} → {e['decimal']}")
    print()
