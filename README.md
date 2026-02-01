# FloatScope

A vibe-coded website for decoding numerical formats commonly used in machine learning (e.g., f8e5m2, f8e4m3, f8e4m3fn, f4e2m1, f32).

Created because existing float conversion tools don't support the mini-float formats used in ML inference and training.

Conversions are validated against the Python [gfloat](https://github.com/graphcore-research/gfloat) library, but use at your own risk.
