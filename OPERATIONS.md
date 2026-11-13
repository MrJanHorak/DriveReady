# DriveReady operations notes

Practical notes for running DriveReady: the project inbox, map and routing providers, and backups. Written November 13, 2026. Prices and product details change, so check the linked Google pages before relying on them.

## Project inbox and privacy contact

The Privacy page shows the address in `src/app/contact.js`. It is currently a placeholder, `privacy@driveready.example`. The `.example` domain can't receive mail, and the page labels it "a placeholder and isn't monitored yet". Change that one line once a real inbox exists, and the placeholder note disappears on its own.

Name ideas for a project account (availability not checked):

| Address | Use |
| --- | --- |
| `driveready.team@…` | **Recommended.** One general inbox for privacy requests and support, and later the sender for invitation emails. |
| `driveready.app@…` or `hello.driveready@…` | Friendlier, if it's mainly for support. |
| `privacy.driveready@…` | Only if privacy requests should stay separate. |

Consider making that account the owner (or a co-owner) of the Firebase, Railway and Vercel projects too, so DriveReady doesn't depend on a personal account. If you buy a domain later, `privacy@your-domain` can forward to the same inbox.

## Map and routing providers

By default the maps use the public OpenStreetMap tiles and **Follow roads** uses the public OSRM demo server. Both are for light testing only. You can switch either without changing code by setting these web app variables (in `.env.development.local` or on Vercel) and rebuilding. Details are in [FIREBASE_SETUP.md](FIREBASE_SETUP.md#map-and-routing-providers).

| Variable | Purpose |
| --- | --- |
| `VITE_ROUTING_URL` | Base address of an OSRM-compatible server; may include an API key in the query string |
| `VITE_MAP_TILE_URL` | Tile template, e.g. `https://tiles.provider.com/{z}/{x}/{y}.png` |
| `VITE_MAP_TILE_ATTRIBUTION` | The provider's required credit line, as plain text |

To keep `.env.example` in step, add these commented lines to it:

```sh
# Optional map providers (defaults: public OSRM demo and OpenStreetMap tiles)
# VITE_ROUTING_URL=https://osrm.your-domain.com
# VITE_MAP_TILE_URL=https://tiles.provider.com/{z}/{x}/{y}.png
# VITE_MAP_TILE_ATTRIBUTION=© Provider, © OpenStreetMap contributors
```

Anything in these variables, API keys included, is visible in the browser. Use keys that the provider lets you restrict to your site's domain.

## Backups

### What you have today

**Nothing you can restore from.** Firestore stores data redundantly, which protects against Google's hardware failing, but it doesn't protect against deleting or overwriting the wrong thing. Backups and point-in-time recovery are both off until you turn them on. Without them, you can read past versions only from the last hour, and you can't export them.

That matters for DriveReady. Deleting a space, a drive or an account is permanent, and a bug in the service could overwrite many records at once.

Firestore backups also don't cover:

- **Firebase Authentication accounts.** These are a separate product. Restoring Firestore doesn't bring back deleted sign-ins.
- **Firestore security rules.** These live in `firestore.rules` in this repository, so git is their backup.
- **TTL policies.** DriveReady doesn't use any.

### The two options

| | Scheduled backups | Point-in-time recovery (PITR) |
| --- | --- | --- |
| What it keeps | A full copy of the database once a day and/or once a week | One version of every document per minute |
| How far back | Up to 14 weeks (you choose the retention) | 7 days |
| Good for | Recovering from something noticed late | Undoing a mistake noticed within days, to the minute |
| Recovering | Restore into a **new** database, then copy back what's needed | Read documents as they were at a past minute, or clone or export the whole database at that minute |
| Price (Standard edition) | About **$0.03 per GiB-month** of backup storage, plus **$0.20 per GiB** restored | About **$0.15 per GiB-month** |

The prices come from Google's [Firestore pricing page](https://cloud.google.com/firestore/pricing), which lists them per GiB-hour: $0.000041096 for backup data and $0.000205479 for PITR data. Neither has a free tier, and both need billing enabled (the Blaze plan). Each backup is billed at the size of the whole database when it was taken, for as long as it's kept. PITR is billed on the database's average size over the month. If you turn PITR off, you may still be charged for up to one day.

### What it would cost DriveReady

A drive or route record is a few kilobytes. Even 100 families with a year of drives each is well under 100 MB.

| Setup | 0.1 GiB database | 1 GiB database |
| --- | --- | --- |
| PITR | ~$0.02 / month | ~$0.15 / month |
| Daily backups kept 7 days (~7 copies) | ~$0.02 / month | ~$0.21 / month |
| Weekly backups kept 14 weeks (~14 copies) | ~$0.04 / month | ~$0.42 / month |
| Everything above | **under $0.10 / month** | **under $1 / month** |
| One full restore | ~$0.02 | ~$0.20 |

Reading old versions through PITR is charged as normal document reads.

### Recommendation

1. **Turn on PITR.** It's the best protection against accidental deletes and bad writes, and it costs pennies.
2. **Add a daily backup kept for 7 days and a weekly backup kept for 14 weeks.** These catch problems noticed after PITR's 7-day window.
3. **Practise a restore** once now and then every few months. Restore into a test database, check that a known learner space is there, then delete the test database.
4. **Decide about Authentication.** `firebase auth:export` can save the user list. The file includes password hashes, so treat it like a secret; never commit it. For a pilot, it's acceptable to skip this and rebuild accounts by re-inviting people.
5. **Update the Privacy page and retention policy.** Backups keep deleted data until they expire: up to 7 days for PITR and 14 weeks for weekly backups. The Privacy page should say so once backups are on.

### Checking your plan

Open the [Firebase console](https://console.firebase.google.com/) and select `driveready-dev-jh-261102`. The plan name (**Spark** or **Blaze**) is shown at the bottom of the left sidebar, and under **Project settings → Usage and billing**. Blaze means a billing account is linked, which both features require. Consider setting a small budget alert on that billing account in the Google Cloud console under **Billing → Budgets & alerts** (for example $5 a month).

### Turning it on

Use the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`), signed in as a project owner, or the Firestore page in the Google Cloud console. These commands use the default database:

```sh
gcloud config set project driveready-dev-jh-261102

# Point-in-time recovery (7 days, one version per minute)
gcloud firestore databases update --database='(default)' --enable-pitr

# Daily backups kept for 7 days
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=7d

# Weekly backups (Sunday) kept for 14 weeks
gcloud firestore backups schedules create --database='(default)' --recurrence=weekly --day-of-week=SUN --retention=14w

# Check
gcloud firestore databases describe --database='(default)'
gcloud firestore backups schedules list --database='(default)'
```

You can't choose the time of day for a backup. Each database can have one daily and one weekly schedule.

### Restoring

A backup always restores into a **new** database. The live data is never overwritten.

```sh
gcloud firestore backups list --format="table(name, database, state)"

gcloud firestore databases restore \
  --source-backup=projects/driveready-dev-jh-261102/locations/LOCATION/backups/BACKUP_ID \
  --destination-database='restore-2026-11-13'
```

After restoring:

- **To recover something specific** (for example one learner's space), copy those documents from the restored database back into the live one with a small Admin SDK script. Copy `spaces/{spaceId}` with its `members`, `drives`, `routes` and `invitations`, and each member's `users/{uid}/spaceLinks/{spaceId}`. Members whose sign-in accounts were deleted can't be restored this way.
- **For the last 7 days, PITR is usually simpler.** Read the documents as they were at a past minute and write them back, or clone or export the database at that minute.
- **Delete the restored database when done.** It is billed like any other database, and it has no security rules until you deploy some to it.

Restored databases are reachable only through the Admin SDK (the service), not through the app, until rules are deployed. DriveReady's app and service always use the default database.

Sources: [Firestore pricing](https://cloud.google.com/firestore/pricing), [Back up and restore data](https://docs.cloud.google.com/firestore/docs/backups), [Point-in-time recovery overview](https://docs.cloud.google.com/firestore/docs/pitr).
