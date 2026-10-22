// The app has one look: cream and burgundy. These exports stay so older callers keep working.
export const THEME_KEY = "orbit-theme";
// Clears any theme choice saved by the old space/dust switch.
export const THEME_SCRIPT = `try{localStorage.removeItem("${THEME_KEY}");delete document.documentElement.dataset.theme}catch(e){}`;

export function ThemeToggle() {
  return null;
}
