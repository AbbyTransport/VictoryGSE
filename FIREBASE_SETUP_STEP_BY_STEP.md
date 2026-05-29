# Firebase Setup, Step by Step

This project uses GitHub Pages for hosting. Firebase Hosting is not required.

## 1. Create or open your Firebase project

Go to Firebase Console and create/open the project you want to use.

## 2. Add a Web App

Project Overview > Web App.

Copy the Firebase config and paste it into:

`docs/assets/js/firebase-config.js`

Replace the placeholder values.

## 3. Enable Authentication

Firebase Console:

Authentication > Sign-in method > Email/Password > Enable.

## 4. Create test users in Firebase Authentication

Create the users below in Authentication > Users.

| Visible Login | Firebase internal email | Password |
|---|---|---|
| ABBYADMINPORTAL | abbyadminportal@abbyportal.local | ABBY2026 |
| DNLABBYPORTAL | dnlabbyportal@abbyportal.local | DNL2026 |
| VICTORYABBYPORTAL | victoryabbyportal@abbyportal.local | VICTORYGSE2026 |
| NORTHWESTABBYPORTAL | northwestabbyportal@abbyportal.local | NORTHWEST2026 |

Customers type only the visible login. The code converts it into the internal email.

## 5. Create Firestore Database

Firestore Database > Create database.

Use Production mode.

## 6. Create the `users` collection

Create a collection named:

`users`

For each Authentication user, copy the UID and create a Firestore document with the document ID equal to that UID.

### Abby Admin

Document ID: UID of `abbyadminportal@abbyportal.local`

Fields:

- email: string: abbyadminportal@abbyportal.local
- displayName: string: Abby Admin
- role: string: admin
- companyId: string: abby

### D&L

Document ID: UID of `dnlabbyportal@abbyportal.local`

Fields:

- email: string: dnlabbyportal@abbyportal.local
- displayName: string: D&L
- role: string: client
- companyId: string: dnl

### Victory GSE

Document ID: UID of `victoryabbyportal@abbyportal.local`

Fields:

- email: string: victoryabbyportal@abbyportal.local
- displayName: string: Victory GSE
- role: string: client
- companyId: string: victory

### Northwest Standard

Document ID: UID of `northwestabbyportal@abbyportal.local`

Fields:

- email: string: northwestabbyportal@abbyportal.local
- displayName: string: Northwest Standard
- role: string: client
- companyId: string: northwest

## 7. Publish Firestore rules

Copy the content of `firestore.rules` into:

Firestore Database > Rules

Click Publish.

## 8. Add GitHub Pages domain to Firebase Authentication

Authentication > Settings > Authorized domains.

Add:

`YOUR_GITHUB_USERNAME.github.io`

Do not include `/YOUR_REPOSITORY_NAME/`.

## 9. Configure GitHub Pages

GitHub repository:

Settings > Pages

- Source: Deploy from a branch
- Branch: main
- Folder: /docs
- Save

## 10. Test

Open:

- `/admin/` with ABBYADMINPORTAL / ABBY2026
- `/dnl/` with DNLABBYPORTAL / DNL2026
- `/victory/` with VICTORYABBYPORTAL / VICTORYGSE2026
- `/northwest/` with NORTHWESTABBYPORTAL / NORTHWEST2026

Create one test load in each customer portal.
Then open admin and confirm all loads appear there.
Each customer should only see its own loads.
