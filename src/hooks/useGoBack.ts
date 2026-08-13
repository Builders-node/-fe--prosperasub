import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Back means back — the page you actually came from.
 *
 * Every screen used to hand its back button a hard-coded destination: the
 * cleaning listing sent you to `/discovery`, a car sent you to the rental
 * listing. That is where you *probably* came from, and it is a PUSH, so
 * pressing back grew the history instead of unwinding it. Two things followed
 * from that, and both were reported as bugs:
 *
 *  - Arriving at a plan from search and pressing back dumped you on a listing
 *    you had never seen.
 *  - The phone's edge-swipe then walked back INTO the app from the home
 *    screen, because "home" was the newest entry with everything behind it —
 *    the gesture looked like back and behaved like anything but.
 *
 * So: pop the history when there is somewhere in this app to pop to, and
 * otherwise REPLACE with the fallback. Replacing is what keeps the home
 * screen the bottom of the stack, which is what makes the edge swipe do
 * nothing there — the behaviour a phone user expects.
 *
 * `history.state.idx` is React Router's own counter: 0 means this entry is
 * the first one the router created, so there is nothing of ours behind it.
 */
export function useGoBack(fallback = "/discovery") {
  const navigate = useNavigate();

  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
