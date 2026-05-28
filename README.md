# Victory GSE Freight Board — Compact Transportation Version

This is the simplified no-login version of the Abby Transport freight board adapted for Victory GSE / Victory Salvage, Inc.

The focus of this version is transportation workflow only:

- Victory GSE creates shipment requests.
- Abby Transport reviews the requests.
- Abby Transport adds Trip #, carrier, driver, phone, actual pickup, actual delivery, and status.
- Abby Transport can quickly mark a shipment as picked up or delivered.

No file upload, file links, or billing workflow is included in this version.

## Access code

```text
VS2026
```

The same access code is currently configured for the client page and the admin page.

## Client link

After publishing to GitHub Pages, use:

```text
https://<your-github-username>.github.io/<repository-name>/?key=VS2026
```

## Admin link

```text
https://<your-github-username>.github.io/<repository-name>/admin.html?key=VS2026
```

Use cache-busting links after uploading a new version:

```text
https://<your-github-username>.github.io/<repository-name>/?key=VS2026&v=victory2
https://<your-github-username>.github.io/<repository-name>/admin.html?key=VS2026&v=victory2
```

## Firebase

This project uses only Firebase Firestore. It does not require Firebase Authentication or Firebase Storage.

Make sure `firebase-config.js` contains the Firebase configuration for the project you want to use.

## Firestore Rules

Use the included `firestore.rules` file.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /load_requests/{loadId} {
      allow read: if true;
      allow create: if request.resource.data.companyId == "victory-salvage";
      allow update: if resource.data.companyId == "victory-salvage";
      allow delete: if resource.data.companyId == "victory-salvage";
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

After pasting the rules in Firebase, click **Publish**.

## Statuses

The active transportation statuses are:

- Submitted
- Assigned
- Picked Up
- In Transit
- Delivered
- Canceled

## Admin quick buttons

The admin table includes:

- Save
- Mark Picked Up
- Mark Delivered
- X delete

## Upload to GitHub

Upload or replace all files in your repository, enable GitHub Pages, and test the client/admin links above.
