(() => {
  const syncViewState = () => {
    const view = (location.hash || "#resume").replace("#", "") || "resume";
    document.body.dataset.view = view;
  };

  const replaceState = history.replaceState.bind(history);
  history.replaceState = (...args) => {
    const result = replaceState(...args);
    syncViewState();
    return result;
  };

  document.addEventListener("DOMContentLoaded", syncViewState);
  window.addEventListener("hashchange", syncViewState);
  window.addEventListener("popstate", syncViewState);
})();
