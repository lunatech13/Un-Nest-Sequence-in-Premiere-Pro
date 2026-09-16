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
    append("Loading unnest_sequences.jsx...");

    var xhr = new XMLHttpRequest();
    // index.html and unnest_sequences.jsx live side by side in this panel folder.
    xhr.open("GET", "./unnest_sequences.jsx", true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status !== 0 && xhr.status !== 200) {
        append("ERROR: could not read unnest_sequences.jsx (status " + xhr.status + "). Is it in this same folder?");
        btn.disabled = false;
        return;
      }
      var jsxSource = xhr.responseText;
      append("Sending to Premiere's ExtendScript engine...");
      csInterface.evalScript(jsxSource, function (result) {
        // Our script talks to the editor via alert()/confirm() dialogs inside
        // Premiere itself, so there's usually nothing meaningful returned here
        // unless something threw before reaching those dialogs.
        if (result && result !== "undefined" && result !== "EvalScript error.") {
          append("Result: " + result);
        } else if (result === "EvalScript error.") {
          append("ERROR: the script failed to run. Check that a sequence is open and active in Premiere.");
        } else {
          append("Done — see the dialogs/alerts in Premiere for the report.");
        }
        btn.disabled = false;
      });
    };
    xhr.send();
  }

  btn.addEventListener("click", runScript);
})();
