# legacy/

Verticals that exist as code only because they predate the universal model.

`food`, `cleaning` and `beach` each still own their tables —
`food_subscriptions`, `cleaning_bookings`, `beach_club_*` — which the universal
`providers` / `provider_plans` / `provider_subscriptions` tables were **seeded
from**, not the other way round. Dropping them (docs/DDD_MIGRATION_PLAN.md,
phase 6) is gated because every read site has to move first.

**A new service does not belong here, and does not need a folder at all.**
An archetype added in `/admin/services` gets a Discovery tile, a listing, a
provider workspace, a checkout, subscriptions, payouts and analytics without a
line of code — see `pages/ServicePage.tsx`. That is the path every new service
takes.

`features/` is for the other case: a vertical whose *sales model* is genuinely
different and always will be. Cars are the only one — one physical object for a
stretch of days, priced by duration, with a deposit that is not revenue.

The name is the point. `features/beach` read as "this is how verticals are
organised", which invited a folder per service; `legacy/beach` says what is
true — this is debt with an end date.
