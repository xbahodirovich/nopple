# External setup blockers

No deployment credentials are provided. Live NVIDIA, Supabase Google OAuth, telemetry, and public hosting cannot be verified against real accounts. Supply environment variables and run the SQL migration before cloud use. Local functionality remains available.

- Redis credentials are required to prove global quotas across Vercel instances; absent configuration provides process-local limits only.
- Vercel deploy permissions/domain are absent. The repository contains a function and hosting configuration, but no online deployment was performed.
- Supabase SQL, OAuth callback and refresh flow require a real configured Supabase project for end-to-end verification.
- Analytics/error/waitlist ingestion endpoints and a canonical site origin are external configuration, not provisioned services.
