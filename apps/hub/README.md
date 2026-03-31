# Control Hub

Minimal landing surface that consolidates navigation between the Student client, Teacher dashboard, and upcoming role-based login system. Host this directory on Netlify as the default marketing / login page, or let the Node API serve it at `/` while in development.

## Local Development

```
npm run build:hub # copies the static assets to dist/hub for Netlify
```

## Planned Enhancements
- Wire Supabase Auth (magic links + OTP)
- Add organization-aware routing to each downstream app
- Display realtime health metrics pulled from `/api/health`
