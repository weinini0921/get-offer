(() => {
  const pinRootScroll = () => {
    requestAnimationFrame(() => {
      const root = document.scrollingElement || document.documentElement;
      if (root) {
        root.scrollTop = 0;
        root.scrollLeft = 0;
      }
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    });
  };

  const syncViewState = () => {
    const view = (location.hash || "#resume").replace("#", "") || "resume";
    document.body.dataset.view = view;
    pinRootScroll();
  };

  const replaceState = history.replaceState.bind(history);
  history.replaceState = (...args) => {
    const result = replaceState(...args);
    syncViewState();
    return result;
  };

  document.addEventListener("DOMContentLoaded", syncViewState);
  window.addEventListener("load", pinRootScroll);
  window.addEventListener("hashchange", syncViewState);
  window.addEventListener("popstate", syncViewState);
})();
