# Contributing

Thank you for considering a contribution. A few conventions keep the project easy to
review.

- **Branches and pull requests.** Work on a branch named `feat/<topic>` or
  `fix/<topic>` and open a pull request against `main`. CI must be green before merge.
- **Small commits.** One logical change per commit, with an imperative subject line
  under 72 characters ("Add route snapping to nearest edge").
- **Checks before pushing.** `npm run check` runs lint, the format check, type
  checking, and the tests, exactly as CI does. `npm run format` fixes formatting.
- **Tests alongside logic.** Routing, search, and geo math carry unit tests next to
  the code. A bug fix includes a test that fails without the fix.
- **Keep it generic.** Facts about a particular place (names, coordinates, categories,
  overlay images) belong only under `sites/<site-id>/`.
- **Privacy is a hard constraint.** No code path may send a user's position anywhere,
  and no analytics or third-party scripts are added.
- **Secrets never enter the repository.** Certificates, `.env` files, and keys are
  gitignored; configuration that must be secret is injected at runtime.

By contributing you agree that your contributions are licensed under the Apache
License 2.0, like the rest of the project.
