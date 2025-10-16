# Stress Less Glass

A full-stack application for showcasing glass artwork, managing auctions, and enabling real-time messaging between artists and customers.  
Built for performance, scalability, and smooth interaction across gallery browsing, communication, and live bidding.

![Logo](https://fs-react-exp-gallery-kn.netlify.app/logo-sq-180.png)

---

## 🧩 Overview

**Stress Less Glass** combines a professional art portfolio with business management tools:

- Real-time direct messaging with encryption
- Live auction system with timers and bidding
- Automated notifications for outbids and auction wins
- Profile management with secure image uploads to AWS S3
- Admin dashboard for order tracking and customer communication

---

## ⚙️ Architecture

| Layer        | Tech                                                     |
| ------------ | -------------------------------------------------------- |
| **Frontend** | React 18, Zustand, MUI, React-Toastify, socket.io-client |
| **Backend**  | Node.js, Express, PostgreSQL, socket.io, node-cron       |
| **Storage**  | AWS S3 + CloudFront                                      |
| **Testing**  | Jest, Supertest                                          |
| **Auth**     | Custom JWT + HTTP-only cookies                           |
| **Hosting**  | Heroku                                                   |

---

## 🧠 Core Systems

### 1. Gallery, Profiles, and Admin Dashboard

- **User Profiles:**  
  Each registered user has a profile displaying their name, avatar, and recent activity.  
  Profile images are stored in **AWS S3** and automatically cleaned up when updated.

- **Admin Dashboard:**  
  The admin doesn’t have a profile. Instead, they manage the platform through a dashboard that includes:
  - Uploading and editing posts
  - Tracking inventory totals and values
  - Applying discounts or posting sale messages on the homepage
  - Creating and managing auctions
  - Sending and receiving messages with users

- Responsive gallery with dynamic post display.
- Secure S3 image upload and cleanup logic.

### 2. Messaging

- Real-time encrypted chat between admin and users.
- Typing indicators
- See [WebSocket Messaging Implementation](./docs/WEBSOCKET_IMPLEMENTATION.md).

### 3. Auctions

- Time-based and Buy-It-Now auctions.
- Automated expiration via `node-cron`.
- Real-time bid updates and notifications.
- See [Auctions & Notifications System](./docs/AUCTIONS_AND_NOTIFICATIONS.md).

### 4. Notifications

- Outbid, win, and auction-ended alerts.
- Live badge counters via WebSockets and Zustand store.

---

## 🧱 Database Schema (Simplified)

- **users_admin** – Authenticated users and admins
- **profiles** – Linked user details and avatars
- **messages** – Encrypted conversations
- **auctions** – Listings with timers and pricing
- **bids** – User bid records
- **auction_results** – Finalized winners
- **auction_notifications** – Stored user alerts

All keys use `ON DELETE CASCADE`. Indexed for read-heavy operations.

---

## 🧪 Testing & CI

- Unit and integration coverage across backend routes.
- Test runner:
  ```bash
  npm test -- -u --runInBand --detectOpenHandles --forceExit
  ```
