if (!document.querySelector("link[rel='manifest']")) {
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "/assets/btw_recruitment/manifest.json";
  document.head.appendChild(link);
}