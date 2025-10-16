# Stress Less Glass – Full-Stack Application

A full-stack platform for managing artwork, auctions, real-time messaging, and customer notifications.  
Built with **React**, **Express/Node**, **PostgreSQL**, **AWS S3**, and **socket.io** for real-time interactivity.

---

## 🚀 Tech Stack

### Backend

- **Node.js / Express**
- **PostgreSQL** with pg
- **socket.io** for WebSockets
- **node-cron** for timed tasks
- **AWS S3 + multer** for image uploads
- **Jest / Supertest** for tests
- **Helmet** + secure cookies for production hardening

### Frontend

- **React 18**
- **Zustand** for state management
- **socket.io-client** for real-time updates
- **React-Toastify** for toasts
- **MUI** + custom CSS for layout and theming

---

## 🧩 Core Features

### 1. Authentication & Profiles

- AWS Cognito-based sign-up / sign-in with secure cookies.
- Profile creation with avatar upload to **AWS S3**.
- Profile editing, image replacement, and auto-cleanup of old S3 objects.
- Admin detection based on allowed email list.

### 2. Messaging System

- Real-time encrypted messaging between admin and users.
- AES-256-GCM encryption of stored message content.
- Live typing indicators and instant message delivery via WebSockets.
- Separate **AdminInbox** and **User Messages** views.
- Unread message tracking with live badge counts.
- Hooks:
  - `useWebSocket` for connection management
  - `useMessaging` for conversation handling
  - `useUnreadMessages` for unread state

### 3. Auctions

- CRUD routes for auctions with image uploads to S3.
- Support for **timed auctions** and **Buy It Now** purchases.
- Automatic auction expiration managed by **cron jobs**.
- Server emits WebSocket events for:
  - `auction-created`
  - `bid-placed`
  - `auction-ended`
  - `user-outbid`
  - `user-won`
- Transaction-based completion updates both auctions and results atomically.
- `auction_results` table stores finalized winners and sale data.

### 4. Bidding

- `/bids` route with `Bid` model.
- Tracks each user’s bids with timestamps and amounts.
- Displays live bid history with profile name and avatar.
- Validation ensures higher bid enforcement and prevents duplicate submission.
- Toast notifications for bid success/failure.

### 5. Notifications

- Dedicated **auction_notifications** table.
- Notifications emitted and persisted for:
  - Outbid alerts
  - Auction wins
  - Auction ended events
- Frontend listeners update badges in real time using Zustand `notificationStore`.
- Profile and header badges show unread auction updates.
- Mark-as-read functions keep state consistent between client and DB.

### 6. Real-Time System

- Centralized WebSocket service on both client and server.
- Auto-reconnect and connection status tracking.
- Global emitters for all live events:
  - Messaging
  - Auctions
  - Notifications
- Cleaned up legacy `getIO()` approach; now uses `wsService` methods:
  - `emitAuctionEnded()`
  - `emitOutBidNotification()`
  - `emitUserWon()`

---

## 🧱 Database Schema Overview

**Tables**

- `users_admin` – core users
- `profiles` – linked profile data
- `messages` – encrypted message records
- `auctions` – auction listings
- `bids` – bid history per auction
- `auction_results` – finalized sales/winners
- `auction_notifications` – outbid/win tracking

All foreign keys use `ON DELETE CASCADE`.  
Indexes exist for performance on high-read tables (`bids`, `auctions`, `messages`).

---

## 🧪 Testing

- Jest + Supertest suites cover:
  - Users / Profiles
  - Messages
  - Auctions / Bids / Results
  - Auction Notifications
- CI runs with:
