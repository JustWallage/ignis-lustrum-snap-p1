/** Its own module because `App` branches on it and the SELECT menu navigates to it, and
 * `App` renders the menu's screen — importing it from there is a cycle. */
export const ADMIN_PATH = "/admin";
