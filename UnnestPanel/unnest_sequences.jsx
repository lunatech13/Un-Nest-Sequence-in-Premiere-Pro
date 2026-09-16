/*
============================================================================
 Un-Nest Sequences — Premiere Pro ExtendScript utility
============================================================================

WHAT THIS DOES
  Scans the ACTIVE sequence for clips that are actually nested sequences
  (a sequence dragged into another sequence's timeline), and — where it is
  safe to do so — replaces each one with the actual clips from inside the
  nest, flattened directly into the parent sequence at the correct
  position/trim. This is the scripted equivalent of: open the nested
  sequence, select all, copy, paste into the parent at the same point.

WHY THIS EXISTS
  Some commercial "un-nest" panels phone home to a license/authorization
  server on install or launch. On an air-gapped system that check fails
  and the panel won't run. This script uses only Premiere's built-in
  ExtendScript engine (File > Scripts > Run Script File...) — nothing is
  installed, nothing calls out to the network, ever.

IMPORTANT — READ BEFORE RUNNING
  1. Run this ONLY on a DUPLICATE of the sequence you care about.
     In the Project panel: right-click the sequence > Duplicate, open the
     duplicate, make it the active sequence, THEN run this script.
     This script does not make its own backup and is not fully undo-safe
     in one step (each individual edit is undoable, but there isn't a
     single "Edit > Undo" that reverses the whole batch cleanly).
  2. It only un-nests nests it judges "clean": no effects anywhere inside
     the nest (checked clip-by-clip, not just on the nest wrapper itself),
     no speed/reverse changes, and only a single video track + single
     audio track inside the nested sequence. Anything more complex is
     left alone and reported, not guessed at. See LIMITATIONS below.
  3. It's designed to be run REPEATEDLY. Every run re-scans the sequence
     fresh. If a nest contains another nest inside it, the first run
     un-nests the outer one, which exposes the inner one as a new
     top-level nest — run the script again to peel that layer too. Keep
     running it until it reports nothing left to do.
  4. Un-nested video/audio clips are placed independently and will NOT be
     re-linked as a synced AV pair the way the original nest was. If you
     need them linked again for trimming, select both and use
     Clip > Link/Unlink (Link).

HOW TO RUN IT
  Premiere Pro 22.3+ : File > Scripts > Run Script File... and pick this
  file. No installation, no panel, no restart needed.
  Older versions: run it through the ExtendScript Toolkit (File > Scripts
  > ExtendScript Toolkit, or the standalone ExtendScript Toolkit CC app),
  targeting the Premiere Pro engine.

LIMITATIONS (v1 — by design, to stay safe on real footage)
  - Skips nests where ANY clip inside the nest (not just the nest wrapper)
    has an effect applied beyond Premiere's built-in Motion/Opacity/Time
    Remapping/Volume components. See INTRINSIC_MATCHNAMES below — if
    plain, unmodified audio clips are being skipped as "has effects",
    the audio intrinsic matchName list below may need one more entry for
    your Premiere version; the script logs the offending clip's name so
    you can check its Effect Controls panel and compare.
  - Skips nests with a speed change or reversed clips (nest-level or
    inside the nest).
  - Skips multicam clips and merged clips (these report isSequence() as
    true too, but aren't plain nests).
  - Only handles nested sequences with at most 1 video track and at most
    1 audio track inside them. A nest built from a multi-track sequence
    (e.g. a lower-third with 3 stacked video layers) is reported and
    skipped rather than partially flattened.
  - Nested-nests (a nest inside a nest) are handled by re-running the
    script, not in a single pass.
  - Generators/color mattes/titles with no backing media file inside a
    nest are skipped (reported), since they need slightly different
    handling than this version implements.

  None of this is a mystery box: everything skipped is named and given a
  one-line reason in the summary dialog and the log file, so the editor
  can finish those by hand exactly as before.

A NOTE ON WHY THIS ISN'T "PIXEL PERFECT" AUTOMATION
  Premiere's scripting API has no documented way to duplicate a track
  item's applied effects/keyframes when moving it between sequences —
  inserting a clip via script always pulls the "clean" version of the
  source media from the Project panel, not a live copy of a specific
  timeline instance with its effects baked in. That's an API limitation,
  not a bug in this script. It's why the script actively checks for and
  skips anything with effects, rather than quietly dropping them.
============================================================================
*/

(function () {

    // ------------------------------------------------------------------
    // Config
    // ------------------------------------------------------------------

    // matchNames Premiere applies to every clip by default — anything
    // else found on a clip counts as "has an effect applied".
    var INTRINSIC_MATCHNAMES = {
        "AE.ADBE Motion": true,
        "AE.ADBE Opacity": true,
        "AE.ADBE Time Remapping": true,
        "AE.ADBE Audio Levels": true,
        "AE.ADBE Channel Volume": true,
        "AE.ADBE Panner": true
    };

    // ------------------------------------------------------------------
    // Small helpers
    // ------------------------------------------------------------------

    function secondsToTicksString(sec) {
        var t = new Time();
        t.seconds = sec;
        return t.ticks;
    }

    function hasNonIntrinsicComponents(trackItem) {
        var comps = trackItem.components;
        if (!comps) return false;
        for (var i = 0; i < comps.numItems; i++) {
            var mn = comps[i].matchName;
            if (!INTRINSIC_MATCHNAMES[mn]) return true;
        }
        return false;
    }

    function findSequenceByProjectItemNodeId(nodeId) {
        var seqs = app.project.sequences;
        for (var i = 0; i < seqs.numSequences; i++) {
            var s = seqs[i];
            if (s.projectItem && s.projectItem.nodeId === nodeId) return s;
        }
        return null;
    }

    function writeLogFile(lines) {
        try {
            var folder;
            try {
                folder = File(app.project.path).parent;
            } catch (e2) {
                folder = Folder.desktop;
            }
            var stamp = new Date();
            var fname = "unnest_log_" +
                stamp.getFullYear() +
                ("0" + (stamp.getMonth() + 1)).slice(-2) +
                ("0" + stamp.getDate()).slice(-2) + "_" +
                ("0" + stamp.getHours()).slice(-2) +
                ("0" + stamp.getMinutes()).slice(-2) +
                ("0" + stamp.getSeconds()).slice(-2) + ".txt";
            var f = new File(folder.fsName + "/" + fname);
            f.open("w");
            f.write(lines.join("\n"));
            f.close();
            return f.fsName;
        } catch (e) {
            return null;
        }
    }

    // ------------------------------------------------------------------
    // Scan
    // ------------------------------------------------------------------

    function scanSequence(seq) {
        var candidates = [];
        var skipped = [];

        function scanTrackCollection(tracks, mediaType) {
            var mediaTypeNum = (mediaType === "Video") ? 1 : 2;

            for (var ti = 0; ti < tracks.numTracks; ti++) {
                var track = tracks[ti];
                for (var ci = 0; ci < track.clips.numItems; ci++) {
                    var item = track.clips[ci];
                    var pi = item.projectItem;
                    if (!pi || !pi.isSequence()) continue;

                    var label = item.name + " [" + mediaType + " track " + (ti + 1) + "]";

                    if (pi.isMulticamClip() || pi.isMergedClip()) {
                        skipped.push({ name: label, reason: "Multicam or merged clip, not a plain nested sequence — handle manually." });
                        continue;
                    }
                    if (hasNonIntrinsicComponents(item)) {
                        skipped.push({ name: label, reason: "Effect(s) applied to the nest clip itself." });
                        continue;
                    }
                    if (item.getSpeed() !== 1 || item.isSpeedReversed()) {
                        skipped.push({ name: label, reason: "Speed change or reverse applied to the nest clip itself." });
                        continue;
                    }

                    var nestedSeq = findSequenceByProjectItemNodeId(pi.nodeId);
                    if (!nestedSeq) {
                        skipped.push({ name: label, reason: "Could not resolve the nested sequence object (unusual — report this)." });
                        continue;
                    }

                    var relevantTracks = (mediaType === "Video") ? nestedSeq.videoTracks : nestedSeq.audioTracks;
                    if (relevantTracks.numTracks === 0) {
                        continue; // nothing of this media type inside the nest for this instance
                    }
                    if (relevantTracks.numTracks > 1) {
                        skipped.push({ name: label, reason: "Nested sequence has more than one " + mediaType + " track (v1 only handles a single track of each type)." });
                        continue;
                    }

                    var usedIn = item.inPoint.seconds;
                    var usedOut = item.outPoint.seconds;
                    var innerTrack = relevantTracks[0];
                    var innerItems = [];
                    var innerIssue = null;

                    for (var ici = 0; ici < innerTrack.clips.numItems; ici++) {
                        var innerItem = innerTrack.clips[ici];
                        var iStart = innerItem.start.seconds;
                        var iEnd = innerItem.end.seconds;
                        if (iEnd <= usedIn || iStart >= usedOut) continue; // outside the used range

                        var innerPi = innerItem.projectItem;
                        if (!innerPi) {
                            innerIssue = "Contains a generator/title/matte with no source media ('" + innerItem.name + "') — not supported yet.";
                            break;
                        }
                        if (innerPi.isSequence()) {
                            innerIssue = "Contains another nested sequence inside it — run this script again after un-nesting the outer one.";
                            break;
                        }
                        if (hasNonIntrinsicComponents(innerItem)) {
                            innerIssue = "A clip inside the nest ('" + innerItem.name + "') has effect(s) applied.";
                            break;
                        }
                        if (innerItem.getSpeed() !== 1 || innerItem.isSpeedReversed()) {
                            innerIssue = "A clip inside the nest ('" + innerItem.name + "') has a speed change or reverse applied.";
                            break;
                        }
                        innerItems.push(innerItem);
                    }

                    if (innerIssue) {
                        skipped.push({ name: label, reason: innerIssue });
                        continue;
                    }
                    if (innerItems.length === 0) continue; // nothing visible in the used range

                    candidates.push({
                        outerItem: item,
                        outerTrack: track,
                        mediaTypeNum: mediaTypeNum,
                        usedIn: usedIn,
                        usedOut: usedOut,
                        baseStart: item.start.seconds,
                        innerItems: innerItems,
                        label: label
                    });
                }
            }
        }

        scanTrackCollection(seq.videoTracks, "Video");
        scanTrackCollection(seq.audioTracks, "Audio");

        return { candidates: candidates, skipped: skipped };
    }

    // ------------------------------------------------------------------
    // Flatten
    // ------------------------------------------------------------------

    function flattenCandidate(cand) {
        // Clear the space the nest instance occupied first, so leftover
        // fragments can't survive in any gaps within the nest.
        cand.outerItem.remove(false, false);

        for (var i = 0; i < cand.innerItems.length; i++) {
            var innerItem = cand.innerItems[i];
            var innerStart = innerItem.start.seconds;
            var innerEnd = innerItem.end.seconds;
            var innerInPt = innerItem.inPoint.seconds;
            var innerOutPt = innerItem.outPoint.seconds;

            var effStart = Math.max(innerStart, cand.usedIn);
            var effEnd = Math.min(innerEnd, cand.usedOut);
            var trimFront = effStart - innerStart;
            var trimBack = innerEnd - effEnd;

            var newIn = innerInPt + trimFront;
            var newOut = innerOutPt - trimBack;
            var placeAt = cand.baseStart + (effStart - cand.usedIn);

            var pi = innerItem.projectItem;
            pi.setInPoint(newIn, cand.mediaTypeNum);
            pi.setOutPoint(newOut, cand.mediaTypeNum);

            var ticks = secondsToTicksString(placeAt);
            cand.outerTrack.overwriteClip(pi, ticks);
        }
    }

    // ------------------------------------------------------------------
    // Main
    // ------------------------------------------------------------------

    var seq = app.project.activeSequence;
    if (!seq) {
        alert("Open the sequence you want to un-nest first — and make sure it's a DUPLICATE of your real sequence before running this.");
        return;
    }

    var goAhead = confirm(
        "This will modify the ACTIVE sequence:\n\"" + seq.name + "\"\n\n" +
        "Make sure this is a DUPLICATE (Project panel > right-click the sequence > Duplicate), not your original — this script does not create its own backup.\n\n" +
        "Continue?"
    );
    if (!goAhead) return;

    var scan = scanSequence(seq);
    var logLines = [];
    logLines.push("Un-nest report for sequence: " + seq.name);
    logLines.push("Run at: " + new Date().toString());
    logLines.push("");

    if (scan.candidates.length === 0) {
        var msg = "No nests were eligible to un-nest automatically.";
        if (scan.skipped.length) {
            msg += "\n\n" + scan.skipped.length + " nest(s) found but skipped:\n" +
                scan.skipped.map(function (s) { return "- " + s.name + ": " + s.reason; }).join("\n");
        } else {
            msg += "\n\nNo nested sequences were found in this sequence at all.";
        }
        alert(msg);
        return;
    }

    var confirmMsg = "Found " + scan.candidates.length + " nest(s) eligible to un-nest:\n" +
        scan.candidates.map(function (c) { return "- " + c.label; }).join("\n");
    if (scan.skipped.length) {
        confirmMsg += "\n\n" + scan.skipped.length + " nest(s) will be SKIPPED (left as-is):\n" +
            scan.skipped.map(function (s) { return "- " + s.name + ": " + s.reason; }).join("\n");
    }
    confirmMsg += "\n\nProceed with un-nesting the eligible ones?";

    if (!confirm(confirmMsg)) return;

    var succeeded = 0, failed = 0;
    for (var i = 0; i < scan.candidates.length; i++) {
        var c = scan.candidates[i];
        try {
            flattenCandidate(c);
            succeeded++;
            logLines.push("OK: " + c.label);
        } catch (e) {
            failed++;
            logLines.push("FAILED: " + c.label + " -- " + e.toString());
        }
    }

    if (scan.skipped.length) {
        logLines.push("");
        logLines.push("Skipped:");
        for (var j = 0; j < scan.skipped.length; j++) {
            logLines.push("- " + scan.skipped[j].name + ": " + scan.skipped[j].reason);
        }
    }

    var logPath = writeLogFile(logLines);

    var doneMsg = "Done.\n\nUn-nested: " + succeeded + (failed ? ("\nFailed: " + failed + " (see log)") : "") +
        (scan.skipped.length ? ("\nSkipped: " + scan.skipped.length) : "") +
        "\n\nReview the result before replacing your original sequence. If any nests were skipped due to inner nesting, run this script again on the same sequence.";
    if (logPath) doneMsg += "\n\nFull log written to:\n" + logPath;

    alert(doneMsg);

})();
