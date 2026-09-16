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
    var evalCmd = "$.evalFile(" + JSON.stringify(jsxPath) + ")";

    append("Running " + jsxPath + " ...");

    csInterface.evalScript(evalCmd, function (result) {
      // Our script talks to the editor via alert()/confirm() dialogs inside
      // Premiere itself, so there's usually nothing meaningful returned here
      // unless something threw before reaching those dialogs.
      if (result === "EvalScript error.") {
        append("ERROR: ExtendScript couldn't run the file. Common causes: the panel folder is missing unnest_sequences.jsx, or Premiere's ExtendScript engine hit an unrelated exception. Check the log file written next to your project, if one exists.");
      } else if (result && result !== "undefined") {
        append("Result: " + result);
      } else {
        append("Done — see the dialogs/alerts in Premiere for the report.");
      }
      btn.disabled = false;
    });
  }

  btn.addEventListener("click", runScript);
})();
