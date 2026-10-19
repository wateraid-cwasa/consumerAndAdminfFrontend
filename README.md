# CWASA Customer Service Platform

A shared React Native and Expo application for web, Android, and iOS. Run `npm install`, then use `npm run web` for the browser experience or `npm start` to open the Expo development server.

The app includes the customer flows in the supplied UI exploration: welcome and sign-in, bills and payments, payment history, new-connection applications and status tracking, complaints and status tracking, notifications, customer services, and account preferences. Guests and signed-in customers can also access About CWASA, FAQs, and a separate complaint form with contact details and location. Camera and location access are requested only when the customer chooses to attach evidence or use their current location.

The supplied CWASA and WaterAid logos, Shurjo regular and bold fonts, and RBNylo-Bold font are bundled locally. Regular text uses Shurjo; bold text uses Shurjo-Bold for Bangla and RBNylo-Bold for English.

Public information and complaint UI are separated into `GuestServices.tsx` and `guestTranslations.ts` so the guest flows and their English/Bangla copy can be maintained independently.

## Deploy to Render

The repository includes a Render Blueprint at `render.yaml`. In Render, create a new Blueprint and select this Git repository. Render builds the Expo web export and publishes the `dist` directory as a static site. The rewrite route supports direct links to app routes. No environment variables are currently required.

This is a static frontend prototype: authentication, payments, applications, and complaints are not backed by production services.

## Build and serve with Docker

Build and serve the production web export with Docker and Nginx:

```sh
docker build -t cwasa-customer-platform .
docker run --rm -p 8080:80 cwasa-customer-platform
```

Authentication, payments, applications, and complaints currently run as an interactive client-side prototype. Connect the corresponding CWASA identity, payment-provider, and service APIs before using this app for live customer transactions.
