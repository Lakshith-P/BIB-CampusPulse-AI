import "@testing-library/jest-dom/vitest";
// Some tests run in the node environment, where there is no window.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    writable: true,
    value: () => {},
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
