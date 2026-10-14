# CWASA Customer Service Platform

A shared React Native and Expo application for web, Android, and iOS. Run `npm install`, then use `npm run web` for the browser experience or `npm start` to open the Expo development server.

The app includes the customer flows in the supplied UI exploration: welcome and sign-in, bills and payments, payment history, new-connection applications and status tracking, complaints and status tracking, notifications, customer services, and account preferences. Guests and signed-in customers can also access About CWASA, FAQs, and a separate complaint form with contact details and location. Camera and location access are requested only when the customer chooses to attach evidence or use their current location.

The supplied CWASA and WaterAid logos, Shurjo regular and bold fonts, and RBNylo-Bold font are bundled locally. Regular text uses Shurjo; bold text uses Shurjo-Bold for Bangla and RBNylo-Bold for English.

Public information and complaint UI are separated into `GuestServices.tsx` and `guestTranslations.ts` so the guest flows and their English/Bangla copy can be maintained independently.

The web-only meter review dashboard is available directly at `/meteradmin` and is not linked from customer navigation. It presents a login screen, then lists sample meter-reader submissions for an administrator to edit, approve, or reject. Prototype login: email `meteradmin`, password `meteradmin`. Approved readings update the customer meter summary and demo bill estimate in other tabs of the same browser using local storage.

The meter queue, authentication, customer records, and bill calculation are prototype-only. The sample login is checked in client-side code and is not a security boundary. Do not expose `/meteradmin` as a production admin system until server-side identity, role authorization, and backend data storage are implemented.

Build and serve the production web export with Docker and Nginx:

```sh
docker build -t cwasa-customer-platform .
docker run --rm -p 8080:80 cwasa-customer-platform
```

Authentication, payments, applications, and complaints currently run as an interactive client-side prototype. Connect the corresponding CWASA identity, payment-provider, and service APIs before using this app for live customer transactions.
