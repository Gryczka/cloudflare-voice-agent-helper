// Apply the saved/system theme before paint without permitting inline scripts.
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (stored === "dark" || (!stored && prefersDark)) {
      document.documentElement.classList.add("dark");
    }
  } catch {
    /* Storage may be unavailable in private mode. */
  }
})();
