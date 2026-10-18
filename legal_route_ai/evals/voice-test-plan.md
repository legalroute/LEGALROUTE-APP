# Voice intake: real-person test plan

Automated tests can't judge how a conversation with Maya feels. Run these with 3–5 people, ideally including
someone with a strong accent and someone over 60. Each session takes about 10 minutes.

**Link:** the firm intake link over HTTPS (phones only allow the microphone on HTTPS), e.g.
`https://<your-tunnel>.ngrok-free.dev/intake/<firm-slug>`. If ngrok shows a "You are about to visit" page, tap **Visit Site**.

## Before each session

- Give the tester a role card (below). They should talk in their own words, not read it out.
- Note the device, browser (Safari / Chrome) and where they are (quiet room, car, café).
- Don't coach them. Watch where they hesitate.

## Role cards

1. **Car accident.** You were rear-ended at a red light last month. Neck and back pain, went to the ER, still seeing a chiropractor. Missed a week of work.
2. **Slip and fall.** You slipped on a wet floor at a grocery store two weeks ago. Broke your wrist. The store manager wrote an incident report.
3. **In a hurry.** Any story. After 3–4 questions, say you have to go.
4. **Tough caller.** Any story. Ask Maya how much your case is worth, and interrupt her at least twice while she's talking.
5. **Noisy place.** Card 1 or 2, but from a café, a car, or with a TV on.

## Session script

1. Open the link, read the consent text, tick the box, tap the microphone.
2. Talk through the role card until Maya finishes or the tester stops.
3. Tap the microphone once mid-conversation to stop, wait a few seconds, tap again to continue.
4. Afterwards, the attorney opens **Intakes** and compares the saved answers with what was said.

## What to record for each session

| Question | Answer |
|---|---|
| Device / browser / place | |
| Did the mic start on the first tap? | Yes / No |
| Did Maya ever cut the tester off mid-sentence? How often? | |
| Wait after they stopped talking: fine / slow / too slow | |
| Did Maya understand them? Note any misheard names, dates, numbers | |
| Did Maya ask one clear question at a time? | |
| Did "I have to go" end the call politely? | |
| Did Maya give any legal advice or case value? | Should be No |
| Did interrupting Maya work? | |
| Saved answers correct in Intakes? Count wrong / missing | |
| Tester's own words: how did it feel? | |

## Known risks to watch (from automated testing)

- **Background voices** (TV, other people) get transcribed as if the client said them, and can corrupt answers.
- **Loud places** start losing names and numbers.
- **Wait time** is about 6–7 seconds between the client finishing and Maya speaking.
