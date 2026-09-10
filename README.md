# Little Us

A mobile-friendly couples arcade. Three games run in the browser:

- **Love Lines:** tic-tac-toe with hearts, stars, win/draw detection, and affectionate reactions.
- **Same Brain:** choose privately and reveal after both partners answer. Includes a pass-the-phone screen.
- **Memory Lane:** match six pairs named after your shared memories. Matches earn another turn.

Use **Make it a little more us** to set nicknames, an inside joke, a reward or loving gesture, and six memory labels. Preferences are stored in localStorage on that device and sent to the connected partner; there is no cloud account or database. Game sessions are ephemeral. The feedback uses local templates, not an AI API.

## Run

Requires Node >=22.13.0.

```sh
npm install
npm run dev
npm run build
npm start
node --experimental-strip-types --test lib/games.test.ts
npx tsc --noEmit
npx oxlint app lib/games.ts lib/peer.ts lib/games.test.ts
```

The production build exports `dist/client/`. Upload that directory to any HTTPS static host that serves the app at the domain root. No Worker, database, or application server is required for these files. Sites registration in `.openai/hosting.json` is for this project's preview delivery; it is not a gameplay dependency. The Sites preview is owner-private and a partner needs site access before they can open it. The app itself has no sign-in.

The generated component catalog has existing repository-wide lint findings. The authored app and game/connection modules pass the scoped lint command above; vendored components have not been rewritten to silence them.

## Play on two phones

1. Open the same deployed URL on both phones and keep both pages open.
2. Host selects **Play together → Invite my partner → Create our invite**. Send the code through your usual messenger.
3. Partner selects **I have an invite**, pastes the invite, and creates a reply code. Send the reply to the host.
4. Host pastes the reply and chooses **Connect our phones**.
5. The host controls game selection and new rounds; each partner plays their own turn. The host's personal pack is used for the session.

The host validates moves and distributes authoritative state over an ordered WebRTC data channel. Game IDs and revisions reject stale actions. The channel is encrypted by WebRTC. Keep codes private: connection descriptions can contain network addressing information. Refreshing or closing either page ends the session; reconnect to begin a fresh round. No automatic background play or durable history is supported. The shared game state is designed for trusted partners, not cheat-resistant competitive play.

This avoids operating a signaling server by asking users to exchange the connection details themselves. It still uses Google's public STUN endpoint to discover network addresses. There is no TURN relay, so some carrier NATs, corporate Wi-Fi, and other restricted networks cannot connect. Use another network or the one-phone mode in those cases. The game engine has automated tests; a real two-device WebRTC test across your target networks is still needed.

## Product direction and alternatives

- [Paired](https://www.paired.com/frequently-asked-questions): daily questions, relationship quizzes, and couples games; answer to unlock a partner's response.
- [Plato](https://platoapp.com/en): a multiplayer games and messaging app with a large game catalog.
- Little Us's proposed distinction is a small, personal arcade: familiar rules, quick rounds, and reactions that use a couple's own language. This is a positioning hypothesis, not a claim that no competitor offers personalization.

The strongest next step for a low-friction long-distance version is managed signaling (for a short room code/invite link) plus managed TURN fallback. That removes the need to operate your own server, but still relies on hosted infrastructure. For strictly zero live infrastructure, keep pass-and-play, or exchange asynchronous challenge payloads through links instead of live moves.

References: [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections), [MDN WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API).
