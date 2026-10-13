// AbortSignal.timeout is newer than Web Locks in some browsers. Keep the
// session-coordination fallback usable there without an unbounded request.
export function timeoutSignal(milliseconds: number) {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(milliseconds);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("The request timed out.", "TimeoutError")), milliseconds);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  return controller.signal;
}

