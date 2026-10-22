# Routes

Orbit uses TanStack Start **file-based routing**. Each `.jsx` file here is a page; the file name is
its address. `routeTree.gen.ts` is generated, so never edit it by hand.

| File                                                                      | Address                                                 | Who can open it                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| `index.jsx`, `solution.jsx`, `benefits.jsx`, `privacy.jsx`, `contact.jsx` | `/`, `/solution`, `/benefits`, `/privacy`, `/contact`   | Anyone                                                               |
| `auth.jsx`                                                                | `/auth` (optional `?workspace=student\|faculty\|admin`) | Anyone: log in, sign up, forgot password                             |
| `new-password.jsx`                                                        | `/new-password?token=…`                                 | Anyone holding a reset link                                          |
| `reset-password.jsx`                                                      | `/reset-password`                                       | Signed-in people changing their password                             |
| `_authenticated/portal.*.jsx`                                             | `/portal/…`                                             | Signed-in people; the server checks the role again for every request |
| `api.public.chat.js`                                                      | `/api/public/chat`                                      | The Pluto assistant, with no access to student records               |

Workspace pages under `/portal`:

- Everyone: overview (`/portal`), `profile`, `updates`, `results`, `placement`
- Students: `learning`, `attendance`, `lms`, `skills`, `engagement`, `feedback`
- Teachers and administrators: `students`, `students/$id`, `interventions`, `monitor`
- Administrators: `teachers`, `assign`, `people`, `records`, `messages`, `audit`

Pages that differ by role (overview, results, placement) pick the right view inside one component.
Showing or hiding a menu item is only a convenience; access is enforced by the server functions in
`src/lib/*.functions.js`.
