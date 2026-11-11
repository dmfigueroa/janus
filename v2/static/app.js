document.addEventListener("htmx:responseError", () => {
  document.getElementById("request-error")?.removeAttribute("hidden");
});
document.addEventListener("htmx:sendError", () => {
  document.getElementById("request-error")?.removeAttribute("hidden");
});
