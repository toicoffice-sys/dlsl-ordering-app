# DLSL Ordering App — Project Instructions
**Inherits:** `../CLAUDE.md` (A2OM Development Policy — all rules apply)

---

## Project Identity

| Field | Value |
|---|---|
| App Name | DLSL Ordering App (GreenBite) |
| GitHub Repo | `toicoffice-sys/dlsl-ordering-app` |
| Script ID | `1emPfZQtOM4UAElvC3pyHLcBelt8oNIGoHb6iL6Dk0VuYEakMHTbmIy1N` |
| Production Deployment ID | `AKfycbypiypBRLFMCPQ4iZf7Kgp1IqhJkta5-_BND6-axWPWZkRrEo_2Fjdvj__BR6VzNyoLlQ` |
| Local Path | `C:\Users\Asus\toic\dlsl-ordering-app` |

---

## Deploy Workflow

```bash
# 1. Commit to GitHub first
git add <files>
git commit -m "feat(scope): description"
git push

# 2. Push to Apps Script
clasp push

# 3. Create new deployment version
clasp deploy --deploymentId AKfycbypiypBRLFMCPQ4iZf7Kgp1IqhJkta5-_BND6-axWPWZkRrEo_2Fjdvj__BR6VzNyoLlQ --description "vX.X.X - description"
```

---

## File Structure

| File | Purpose |
|---|---|
| `Code.js` | Entry point, routing, auth, sessions, utilities |
| `Admin.js` | Admin functions |
| `Orders.js` | Order management |
| `Products.js` | Product/menu management |
| `Notifications.js` | Email notifications |
| `SeedData.js` | Sheet seeding / setup |
| `index.html` | Main HTML shell |
| `Scripts.html` | Client-side JavaScript |
| `Styles.html` | CSS styles |

---

## Sheets

| Sheet | Purpose |
|---|---|
| `Users` | All user accounts |
| `Concessionaires` | Concessionaire profiles |
| `Products` | Menu items |
| `Orders` | Order headers |
| `OrderItems` | Line items per order |
| `Ratings` | Product ratings |
| `Sessions` | Active login sessions |
| `OTPs` | OTP records (rate-limited) |
| `Announcements` | App-wide announcements |

---

## Roles

`admin` · `concessionaire` · `student` · `parent` · `partner`

---

## Order Statuses

`pending` → `confirmed` → `preparing` → `ready` → `completed` / `cancelled`

---

## Known Policy Violations (Fix These)

> These were found in the existing codebase and must be resolved:

- **`Code.js` line 6** — `SPREADSHEET_ID` is hardcoded. **Violates A2OM §4.1.**
  Move to `PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')`.
- **`Code.js` header block** — Missing the standard A2OM version/changelog header. **Violates A2OM §1.**

---

## Notes

- OTP login is used (no password) — rate-limited to 1 send per 60 seconds
- Image uploads go to a Google Drive folder named `DLSL Ordering App — Images`
- App title in browser: `GreenBite`
