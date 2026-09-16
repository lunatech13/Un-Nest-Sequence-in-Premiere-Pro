# Un-Nest Sequences (Premiere Pro, offline/air-gapped)

## Correction from earlier

The original version of this README told you to run the script via
**File > Scripts > Run Script File...** — that's wrong. That menu exists in
After Effects, not Premiere Pro (confirmed by an Adobe community manager:
"Premiere Pro has never had such a menu item"). Premiere has no built-in
"just run this .jsx" command, so the script needs a small wrapper — a CEP
panel — to actually execute inside Premiere. That wrapper is the
`UnnestPanel/` folder in this repo. Nothing about the un-nesting logic
itself changed; only how you launch it.

The good news for the air-gapped requirement: CEP panels are Adobe's own
extensibility framework, sideloading an unsigned/custom one is officially
supported (an Adobe engineer confirmed on the forums: "PlayerDebugMode
remains supported. We load unsigned panels in 25.x every day," as of
Premiere Pro 25), and none of this touches the network or any license
server. Adobe is moving toward a newer framework called UXP, but there is
no announced end-of-life date for CEP yet — Adobe's own guidance is "several
years" out — so this is safe to rely on today.

## What's in this repo

```
UnnestPanel/
├── CSXS/
│   └── manifest.xml        — declares the extension to Premiere
├── CSInterface.js           — Adobe's official CEP JS library (unmodified)
├── index.html                — the panel's UI (one button)
├── main.js                   — wires the button to run the script
└── unnest_sequences.jsx      — the actual un-nesting logic (unchanged)
README.md                     — this file
```

## One-time setup (per machine)

### 1. Enable unsigned/sideloaded extensions

Premiere only loads signed extensions from Adobe Exchange by default. To
let it load this one, turn on "PlayerDebugMode" for the CEP runtime.

**macOS** — open Terminal and run (covers the CEP versions used by recent
and older Premiere releases, harmless to set them all):

```bash
for v in 9 10 11 12; do
  defaults write "$HOME/Library/Preferences/com.adobe.CSXS.$v.plist" PlayerDebugMode 1
done
```

**Windows** — open Registry Editor and, under
`HKEY_CURRENT_USER\Software\Adobe\CSXS.9` (and `.10`, `.11`, `.12` as
siblings), add a String value named `PlayerDebugMode` set to `1`.

Restart Premiere after this.

### 2. Install the panel

Copy the whole `UnnestPanel` folder into Premiere's CEP extensions
directory:

- **macOS**: `/Library/Application Support/Adobe/CEP/extensions/`
  (needs admin rights — `sudo` a `cp -R`, or drag it in Finder with
  admin auth). If you'd rather not touch the system-wide location, a
  per-user path also works on most Premiere versions:
  `~/Library/Application Support/Adobe/CEP/extensions/`
- **Windows**: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\`

End result should be a path like
`.../CEP/extensions/UnnestPanel/CSXS/manifest.xml`.

### 3. Launch it

Restart Premiere, open the project, and go to **Window > Extensions >
Un-Nest Sequences**. A small panel appears with one button.

If it doesn't show up under Extensions: double-check the manifest.xml
landed inside a `CSXS` subfolder of `UnnestPanel`, that PlayerDebugMode
is set for the CEP version your Premiere build uses, and that you
restarted Premiere after both steps.

## How to use it

1. **Duplicate the sequence** you want to un-nest first (Project panel >
   right-click > Duplicate) and open the duplicate. The script edits
   whatever sequence is active and does not make its own backup.
2. Open the panel (**Window > Extensions > Un-Nest Sequences**) and click
   **Run on Active Sequence**.
3. Premiere will pop up a couple of confirmation dialogs (which sequence,
   what it found) and then a summary of what it un-nested vs. skipped. A
   full text log is also written next to your project file.
4. If a nest contained another nest, or if only part of a nest got
   handled, just click the button again — every run re-scans the current
   state, so it's safe to run repeatedly until it reports nothing left
   to do.
5. Review the result before replacing your original sequence. Un-nested
   video/audio clips aren't automatically re-linked as an AV pair.

## Why it skips what it skips (deliberate, not a bug)

Premiere's scripting API has no documented — or, per a Hyper Brew
developer on the Adobe forums, undocumented — way to duplicate a clip's
applied effects/keyframes when moving it between sequences. Any scripted
insert pulls the "clean" version of the source media, not a live copy of
a specific timeline instance with its effects baked in. So rather than
silently dropping effects, the script checks every clip inside a nest
(not just the outer wrapper) and skips the whole nest if it finds any
effect beyond Premiere's built-in Motion/Opacity/Time Remapping/Volume
components, a speed change or reversed clip, or more than one video/audio
track inside the nest. Every skip is named with a reason in the summary
and the log file.

## Current limitations (v1)

- Single video track + single audio track inside the nest only.
- No effects or speed changes anywhere inside the nest, or on the nest
  clip itself.
- No multicam clips, merged clips, or generators/titles/color mattes with
  no backing media file inside the nest.
- Nested-nests are handled by re-running the script, not in one pass.
- Un-nested video/audio pairs aren't re-linked automatically.

If a plain, unmodified audio clip gets flagged as "has effects," open
`UnnestPanel/unnest_sequences.jsx`, find `INTRINSIC_MATCHNAMES` near the
top, and add whatever matchName your Premiere version uses (check the
flagged clip's Effect Controls panel to find it).

## Sources used to build this

- [Adobe Community — "Premiere Pro has never had such a menu item"](https://community.adobe.com/questions-729/how-can-i-run-jsx-programmatically-1418684)
- [Adobe Community — CEP 12 unsigned extensions load fine in Premiere Pro 25](https://community.adobe.com/bug-reports-728/cannot-load-unsigned-cep-12-extensions-in-premiere-pro-25-on-macos-15-playerdebugmode-ignored-1331681)
- [Adobe-CEP/Samples — PProPanel (manifest.xml structure)](https://github.com/Adobe-CEP/Samples/blob/master/PProPanel/ReadMe.md)
- [Adobe-CEP/CEP-Resources — CSInterface.js (official library, used unmodified)](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_11.x/CSInterface.js)
- [Hyper Brew — UXP Plugins in Premiere 2026: The CEP Migration Clock Is Ticking](https://hyperbrew.co/blog/uxp-plugins-in-premiere-2026/)
- [Premiere Pro Scripting Guide (community-maintained)](https://ppro-scripting.docsforadobe.dev/)
- [Adobe Community — ExtendScript: retain Effects when copying TrackItems between Sequences](https://community.adobe.com/questions-729/extendscript-how-to-retain-effects-when-copying-trackitems-between-sequences-1550341)
