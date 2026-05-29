# Abby Transport Central Admin Portal

This version is designed for GitHub Pages.

## Architecture

- GitHub Pages hosts the static files from `/docs`
- Firebase Authentication handles login/password
- Cloud Firestore stores loads
- Firestore Security Rules isolate each customer's loads by `companyId`
- Abby Admin can see all loads

## Links after GitHub Pages is enabled

Replace `YOUR_GITHUB_USERNAME` and `YOUR_REPOSITORY_NAME`.

- Main: `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/`
- Admin: `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/admin/`
- D&L: `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/dnl/`
- Victory GSE: `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/victory/`
- Northwest Standard: `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/northwest/`

## Important

Do not put private keys, passwords, or confidential customer data inside the GitHub repository.
The Firebase web config is not a private server secret, but Firestore Security Rules must be configured correctly.
