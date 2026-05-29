
# PortalAdmin — Victory-style Multi-Company Version

This package keeps the visual style and operational functions from the previous VictoryGSE Abby Portal and adapts them to the centralized PortalAdmin model.

## Hosting

Use GitHub Pages:

- Branch: `main`
- Folder: `/docs`

## Firebase

This version uses:

- Firebase Authentication
- Firestore collection `users`
- Firestore collection `loads`
- Firestore Security Rules in `firestore.rules`

## Visible logins

- Admin: `ABBYADMINPORTAL` / `ABBY2026`
- D&L: `DNLABBYPORTAL` / `DNL2026`
- Victory GSE: `VICTORYABBYPORTAL` / `VICTORYGSE2026`
- Northwest Standard: `NORTHWESTABBYPORTAL` / `NORTHWEST2026`

## Important

After replacing the files in GitHub, copy `firestore.rules` into Firebase Firestore Rules and publish again.
The new rules allow chat and limited customer-side shipment edits while preserving company isolation.
