# WhatsApp assistant (Twilio)

Students, teachers and administrators can message the BIB InsightIQ WhatsApp number, sign in
inside the chat, and ask for their details. It uses the same data and the same permission rules
as the website.

## Set up

1. In the Twilio Console, open **Messaging → Try it out → Send a WhatsApp message** (the
   sandbox), or use an approved WhatsApp sender.
2. Set **When a message comes in** to `POST https://YOUR-SITE/api/public/whatsapp`.
3. Add these to `.env` (or your host's environment) and restart:
   - `TWILIO_AUTH_TOKEN` – from the Twilio Console. Every webhook is checked against Twilio's
     signature with it; without it the endpoint answers 503.
   - `TWILIO_WEBHOOK_URL` – only if your host sits behind a proxy and the URL the server sees
     differs from the one you gave Twilio. Set it to exactly that public URL.
4. Run `npm run db:migrate` (creates `whatsapp_sessions`).

Replies are sent as the webhook response, so no Account SID or outbound call is needed.

## Signing in

Send `login`, then the account email, then the password. Wrong passwords are counted per
number: five in a row lock that number for 15 minutes. A signed-in chat lasts 8 hours, or until
`logout`. A half-finished sign-in is dropped after 10 minutes. Roles are read from the database on
every message, so removing someone's access takes effect straight away.

Passwords sent over WhatsApp stay in the chat history and in Twilio's message logs. The bot
reminds people to delete the message; treat this channel as lower security than the website.

## Commands

| Who | Command | Answer |
| --- | --- | --- |
| Student | `score`, `attendance`, `marks`, `timetable`, `assignments` | their own record only |
| Teacher | `students`, `risk`, `low`, `student S-101`, `timetable` | only students assigned to them |
| Administrator | the teacher commands | every student |
| Everyone | `help`, `logout` | |
