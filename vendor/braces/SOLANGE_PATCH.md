# ShopVivaliz/Solange security patch

This directory vendors `braces` 3.0.3 (MIT) because, as of 2026-10-03,
upstream has no fixed release for GHSA-vfj7-8cjw-p6xm / CVE-2026-93687.

Local delta:
- package version is `3.0.4-solange.0` so scanners do not classify this patched copy as upstream 3.0.3;
- upstream-only development metadata (`scripts`, `devDependencies`, `verb`) is omitted so the local `file:` dependency cannot pull the obsolete upstream test toolchain into this application;
- `lib/parse.js` rejects brace nesting deeper than 100 with
  `SyntaxError: BRACES_MAX_DEPTH_EXCEEDED` before recursive compile/expand walkers run.

Reproduction used for the regression test:
- upstream 3.0.3 on Node 24.20.0;
- pattern: `'{'.repeat(4400) + 'a,b' + '}'.repeat(4400)`;
- input length: 8,803 characters;
- upstream result: `RangeError: Maximum call stack size exceeded`;
- patched result: `SyntaxError: BRACES_MAX_DEPTH_EXCEEDED`.

Remove the vendored override once upstream publishes a fixed release and the
same regression test remains green against the upstream package.
