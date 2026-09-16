(function () {
  var csInterface = new CSInterface();
  var btn = document.getElementById("runBtn");
  var log = document.getElementById("log");

  function append(msg) {
    log.textContent += "\n" + msg;
    log.scrollTop = log.scrollHeight;
  }

  function runScript() {
    btn.disabled = true;

    // Load the script by absolute path via ExtendScript's own $.evalFile(),
    // rather than shipping the whole file as a string through evalScript().
    // evalScript() is meant for short commands ("runSomething()") — handing
    // it a multi-KB script as a single string is unreliable in CEP's bridge
    // and is what was producing "EvalScript error." here. $.evalFile() reads
    // the file directly from disk inside the ExtendScript engine, so file
    // size isn't a factor, and it's the pattern Adobe's own sample panels use.
    var extRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
    var jsxPath = extRoot + "/unnest_sequences.jsx";
    // Wrap the evalFile call itself in a try/catch, constructed as part of
    // the command string: if the file can't be found/read, THIS is what
    // catches it and reports the exact path — otherwise that failure would
    // happen outside the script's own try/catch and we'd be back to a bare
    // "EvalScript error." with no detail.
    var evalCmd =
      "try { $.evalFile(" + JSON.stringify(jsxPath) + "); } " +
      "catch (e) { alert('Could not load/run the script.\\n\\nPath: " +
      jsxPath.replace(/\\/g, "\\\\") +
      "\\n\\nError: ' + e.toString() + (e.line ? ('\\nLine: ' + e.line) : '')); }";

    append("Running " + jsxPath + " ...");

    csInterface.evalScript(evalCmd, function (result) {
      // The script itself now reports everything via native alert()
      // dialogs in Premiere (including its own errors, via the try/catch
      // above and the one inside unnest_sequences.jsx). This callback is
      // mostly just confirming the round-trip completed.
      if (result === "EvalScript error.") {
        append("ERROR: the evalScript call itself failed before ExtendScript could even run our try/catch. This usually means Premiere's ExtendScript engine is in a bad state — try restarting Premiere, then click the button again.");
      } else if (result && result !== "undefined") {
        append("Result: " + result);
      } else {
        append("Sent. Check Premiere for a dialog with the report or error.");
      }
      btn.disabled = false;
    });
  }

  btn.addEventListener("click", runScript);
})();
