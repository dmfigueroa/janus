function hideRequestError() {
  document.getElementById("request-error")?.setAttribute("hidden", "");
}

function clearRequestErrorOnSuccess(event) {
  if (event.detail?.successful) hideRequestError();
}

document.addEventListener("htmx:responseError", () => {
  document.getElementById("request-error")?.removeAttribute("hidden");
});
document.addEventListener("htmx:sendError", () => {
  document.getElementById("request-error")?.removeAttribute("hidden");
});
document.addEventListener("htmx:afterRequest", clearRequestErrorOnSuccess);
