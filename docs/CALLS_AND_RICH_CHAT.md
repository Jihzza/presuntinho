# Rich chat and 1:1 calls

Account couples and connected friends use the normalized private chat model in
`20260715044915_rich_chat_and_calls.sql`, followed by
`20260715045609_harden_couple_pings_acl.sql`. The legacy Fatma/Daniel profiles stay
on the token-authenticated Netlify Blobs chat and do not receive account calls.

## What ships

- Text, images, voice notes, video and documents up to 25 MB.
- Replies, edit/delete, reactions, stars, search and paginated history.
- Read state, last seen, typing and online presence.
- Voice and video buttons in a two-person account conversation.
- Incoming-call UI, mute, camera toggle/switch, reconnect and durable call history.
- Web Push for incoming calls and messages when notifications are enabled.

Message rows, membership, call state and history are durable in Postgres. Chat
media is stored in private Supabase buckets. SDP and ICE candidates are never
stored: they use an authorised private Realtime topic and are discarded after
the call.

This release is private through authenticated RLS, private buckets and HTTPS,
but message content is **not end-to-end encrypted**. Database operators can
access durable content; do not market it as WhatsApp-equivalent E2EE.

## Required production configuration

Apply the migration before deploying the client and Netlify functions. Netlify
must have:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
```

The service role is used only inside `push-ping`; browser clients cannot read
another account's Web Push endpoint or delivery keys.

For calls that work across restrictive mobile networks, configure one TURN
option:

```text
# Recommended: short-lived Cloudflare TURN credentials
CLOUDFLARE_TURN_KEY_ID
CLOUDFLARE_TURN_API_TOKEN

# Or a static TURN service
CALL_TURN_URLS
CALL_TURN_USERNAME
CALL_TURN_CREDENTIAL
```

`CALL_STUN_URLS` may override the STUN fallback. STUN-only calls work on many
networks, but cannot traverse every NAT/firewall combination; production should
not claim universal call reliability until TURN is configured and tested on two
real mobile networks.

## PWA behaviour

Microphone/camera access requires HTTPS and an explicit browser permission. On
iPhone, Web Push requires the PWA to be installed from Safari. A web PWA does
not have native iOS CallKit/PushKit integration: an incoming push opens the app,
then the user answers inside Presuntinho.

## Release verification

1. Apply the migration and verify RLS, private Realtime policies and both media buckets.
2. Deploy the functions and client with the environment above.
3. Enable notifications on two authenticated devices.
4. Test text/media/reply/edit/delete/reaction/read/typing in both directions.
5. Test audio and video over Wi-Fi, Wi-Fi to mobile data, decline, missed call,
   hang-up, app crash/reopen and two devices logged into the callee account.
6. Confirm call rows become terminal and no SDP/ICE payload is persisted.

Never commit service-role, VAPID private or TURN credentials.
