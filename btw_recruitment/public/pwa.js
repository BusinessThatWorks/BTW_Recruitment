if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/assets/btw_recruitment/service-worker.js")
      .then(reg => console.log("SW registered with scope:", reg.scope))
      .catch(err => console.error("SW registration failed:", err));
  });
}