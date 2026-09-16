# Un-Nest Sequences — Premiere Pro utility (offline, no plugin auth needed)

## What it is

`unnest_sequences.jsx` is a plain ExtendScript file that runs entirely
inside Premiere Pro via **File > Scripts > Run Script File...** (Premiere
22.3+). It doesn't install anything, doesn't touch the network, and
doesn't need any license/authorization check — which is the whole point,
since the commercial panel your editor wanted can't reach its auth server
on an air-gapped system.

It walks the active sequence, finds clips that are actually nested
sequences, and — only where it's safe — replaces each one with the real
clips from inside the nest, flattened into the parent sequence at the
correct position and trim. Where it isn't safe (effects applied, speed
changes, multi-track nests, nests inside nests, multicam/merged clips) it
leaves that nest alone and tells you exactly why, instead of guessing.

## How to use it

1. In the Project panel, **duplicate** the sequence you want to un-nest
   (right-click > Duplicate) and open the duplicate. The script edits
   whatever sequence is active, and it does not make its own backup.
2. **File > Scripts > Run Script File...**, pick `unnest_sequences.jsx`.
3. Confirm the two dialogs (which sequence, and the list of nests it
   found). It'll report what it un-nested and what it skipped, and it
   writes a plain-text log next to your project file.
4. If a nest contained another nest, or if it un-nested a video track but
   left the same nest's audio track for a different reason, just run it
   again on the same sequence — every run re-scans from the current
   state, so it's safe to run repeatedly until it reports nothing left to
   do.
5. Check the result against the original before you swap it in. Un-nested
   video and audio clips are no longer linked as an AV pair (select both
   and use Clip > Link/Unlink if you need that back).

## Why it skips what it skips (this is deliberate, not a bug)

Premiere's scripting API has no documented way to copy a clip's applied
effects or keyframes when moving it into another sequence — any scripted
insert pulls the "clean" version of the source media from the Project
panel, not a live copy of a specific timeline instance with its effects
baked in. Community-confirmed, including by a Hyper Brew developer on the
Adobe forums: there's currently no ExtendScript or UXP API for
cloning/duplicating a track item with its effects intact between
sequences. So instead of silently dropping effects, the script actively
checks every clip inside a nest (not just the nest's outer clip) and
skips the whole nest if it finds any effect beyond Premiere's built-in
Motion/Opacity/Time Remapping/Volume components, any speed change or
reversed clip, or more than one video/audio track inside the nest.

If a plain, unmodified audio clip gets flagged as "has effects," it's
likely because your Premiere version uses a slightly different intrinsic
audio effect matchName than the ones hardcoded in the script. Open that
clip's Effect Controls panel, and adjust the `INTRINSIC_MATCHNAMES` list
near the top of the .jsx file to match.

## Current limitations (v1)

- Single video track + single audio track inside the nest only. A
  multi-layer nest (e.g. a stacked lower-third) is reported and skipped.
- No effects or speed changes anywhere inside the nest, or on the nest
  clip itself.
- No multicam clips, merged clips, or generators/titles/color mattes with
  no backing media file inside the nest.
- Nested-nests are handled by re-running the script, not in one pass.
- Un-nested video/audio pairs aren't re-linked automatically.

None of these are silent — every skip is named with a reason in the
summary dialog and the log file, so those cases can still be finished by
hand exactly as before, just narrowed down to the ones that actually need
a human.

## Sources used to build this

The Premiere Pro scripting object model isn't officially documented by
Adobe in full; this was built against the community-maintained reference
and confirmed community threads below:

- [Premiere Pro Scripting Guide — Track object](https://ppro-scripting.docsforadobe.dev/sequence/track/)
- [Premiere Pro Scripting Guide — TrackItem object](https://ppro-scripting.docsforadobe.dev/item/trackitem/)
- [Premiere Pro Scripting Guide — Sequence object](https://ppro-scripting.docsforadobe.dev/sequence/sequence/)
- [Premiere Pro Scripting Guide — ProjectItem object](https://ppro-scripting.docsforadobe.dev/item/projectitem/)
- [Premiere Pro Scripting Guide — Time object](https://ppro-scripting.docsforadobe.dev/other/time/)
- [Premiere Pro Scripting Guide — TrackCollection object](https://ppro-scripting.docsforadobe.dev/collection/trackcollection/)
- [Premiere Pro Scripting Guide — ComponentCollection object](https://ppro-scripting.docsforadobe.dev/collection/componentcollection/)
- [Premiere Pro Scripting Guide — Component object](https://ppro-scripting.docsforadobe.dev/sequence/component/)
- [Adobe Community — ExtendScript: How to retain Effects when copying TrackItems between Sequences?](https://community.adobe.com/questions-729/extendscript-how-to-retain-effects-when-copying-trackitems-between-sequences-1550341)
- [Adobe Community — Scripting: Dive into nested sequences](https://community.adobe.com/t5/premiere-pro-discussions/scripting-dive-into-nested-sequences/m-p/10451826)
- [Adobe Community — Premiere Pro Scripting: Set In and Out Points of Clip](https://community.adobe.com/t5/premiere-pro-discussions/premiere-pro-scripting-set-in-and-out-points-of-clip/td-p/10490225)
- [Adobe Community — ExtendScript Bug: setOutPoint with no mediaType](https://community.adobe.com/t5/premiere-pro-discussions/extendscript-bug-setoutpoint-with-no-mediatype/td-p/11197700)
