# API tests (Newman)

1. Copy `environment.example.json` to `environment.local.json` (this file is ignored by Git).
2. Fill in `baseUrl` (ending in `/api/v1`), a TEST account number and its password. Never use a real customer.
3. Run `npm run test:api`. Newman is fetched on demand with npx, so it is not a project dependency.

You can also import the collection and the environment into Postman to run it by hand.
