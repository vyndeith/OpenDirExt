// Scoped stylesheet for the injected UI. All selectors live under #ode-root so
// we never leak styles onto (or inherit from) the original page.
import { COLORS, FONT_SANS, FONT_MONO } from "../../shared/design";

export const ROOT_ID = "ode-root";

export function styleSheet(): string {
  return `
#${ROOT_ID} { all: initial; }
#${ROOT_ID}, #${ROOT_ID} * { box-sizing: border-box; }
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 2147483000;
  overflow-y: auto; overflow-x: hidden;
  background: ${COLORS.bg}; color: ${COLORS.text};
  font-family: ${FONT_SANS};
  font-size: 14px; line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}
#${ROOT_ID}.ode-floating {
  inset: auto 20px 20px auto;
  width: min(440px, calc(100vw - 40px));
  max-height: 82vh;
  overflow: visible;
  background: transparent;
  pointer-events: none;
}
#${ROOT_ID}.ode-floating > * { pointer-events: auto; }
#${ROOT_ID} a { color: inherit; text-decoration: none; }
#${ROOT_ID} button { font-family: inherit; }
#${ROOT_ID} input { font-family: inherit; color: inherit; }
#${ROOT_ID} input::placeholder { color: ${COLORS.placeholder}; }
#${ROOT_ID} input:focus { outline: none; }
#${ROOT_ID} ::selection { background: rgba(255,255,255,0.16); }
#${ROOT_ID} .mono { font-family: ${FONT_MONO}; }
#${ROOT_ID} .ode-scroll::-webkit-scrollbar { width: 12px; height: 12px; }
#${ROOT_ID} .ode-scroll::-webkit-scrollbar-thumb { background: #23262b; border-radius: 10px; border: 3px solid ${COLORS.bg}; }
#${ROOT_ID} .ode-scroll::-webkit-scrollbar-thumb:hover { background: #2e3238; }
#${ROOT_ID} .hoverable { transition: background .12s, color .15s, border-color .15s, filter .15s; }
#${ROOT_ID} .hover-surface:hover { background: ${COLORS.hover}; color: ${COLORS.text}; }
#${ROOT_ID} .hover-row:hover { background: ${COLORS.rowHover}; }
#${ROOT_ID} .hover-bright:hover { filter: brightness(1.08); }
#${ROOT_ID} .hover-danger:hover { background: rgba(224,138,138,0.12); color: #e08a8a; border-color: rgba(224,138,138,0.4); }
#${ROOT_ID} .hover-dash:hover { background: ${COLORS.rowHover}; color: ${COLORS.text}; border-color: #3a3f47; }
@keyframes ode-spin { to { transform: rotate(360deg); } }
#${ROOT_ID} .spin { animation: ode-spin .9s linear infinite; transform-origin: center; }
`;
}
