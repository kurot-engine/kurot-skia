# Native keyboard acceptance

Date: 2026-10-11. This round is limited to simulators at the user's request.
The manual fixture lives in `tests/native/app/tests/ManualInput.tsx`; it uses the
local unreleased adapter with registry Core 2.5.3, RN 0.86.3 and Skia 3.3.0.
Checks used production minified JS in a Debug development client. They are
separate from the Release functional/performance runs.

The actual iOS screen keyboard and candidate bar were operated through the native
UI tool. No text was injected into `NativeInputController`. Native screenshots
and accessibility state were compared with loopback Core observations. Only
synthetic test values are retained in [the observation record](native-input-2026-10-11.json).
Manual observations do not produce an automatic full-suite pass.

| Check | iOS 18.2 | iOS 26.5 |
| --- | --- | --- |
| Plain typing, selected replacement and deletion | `abcdef`, select [2,4], type `x` → `abxef`, delete → `abef` | Password field replacement tested below |
| Simplified Pinyin preedit and candidate commit | `ni\u2006hao` remains editable; candidate `你好` commits and survives blur | Candidate `你好` commits and survives blur |
| Restriction after IME commit | Restricted field accepts preedit/`你好12`; blur produces `12`, selection [2,2] | Not repeated |
| Password and maxChars | Nine digits produce `12345678`; native bullets and unfocused Skia stars mask text | Same limit; select [2,4], type `9` → `1295678` |
| Multiline Return | `a\nb`, selection [3,3]; focus retained after Return | Same |
| Emoji UTF-16 selection and deletion | Candidate `👋` gives `abef你好👋`, selection [8,8]; one delete removes the complete emoji | Not repeated |
| Field switching / blur | Distinct fields focus; single-line Return and Blur close editing | Fields switch and Blur closes editing |

These checks found no new adapter fault. They establish the listed simulator
behaviors, not every IME, gesture or input lifecycle on phones. Password plaintext
in the record is synthetic Core model state; rendered fields were masked.

Android API 36 passed automated mounted focus/switch/unmount checks. Its emulator
window is not exposed by the available native UI automation, so actual Android
keystrokes and IME remain **unverified**. Physical devices were deferred by the
user for this round. Custom RN editing fonts, ancestor clips/masks/effects,
keyboard avoidance, accessibility, RTL, app backgrounding with active composition
and project-specific form flows remain future acceptance work.

See [native test instructions](../tests/native/README.md) for the manual mode and
[the feature assessment](native-feature-assessment.md) for runtime coverage and
performance limits.
