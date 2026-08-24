import "@testing-library/jest-dom/vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

// React 19 + Vitest needs this set explicitly, unlike Jest's jsdom preset
// which sets it automatically — without it, `renderHook`'s async updates
// warn "not configured to support act(...)" even though the test is correct.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
