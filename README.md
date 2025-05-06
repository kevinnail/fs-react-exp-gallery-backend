# Stress Less Glass - Backend

![Logo](https://fs-react-exp-gallery-kn.netlify.app/logo-sq-180.png)

This is the backend service for my personal glass art business website, Stress Less Glass. The application provides a robust API for managing my gallery system, handling customer orders, and showcasing my glass artwork.

## Features

- RESTful API architecture for seamless frontend integration
- Secure user authentication for admin access
- Image management with AWS S3 for high-quality artwork display
- PostgreSQL database for reliable data storage
- Order management system
- Data export capabilities for business analytics
- Comprehensive test suite ensuring reliability

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL
- **Storage:** AWS S3
- **Authentication:** JWT (JSON Web Tokens)
- **Testing:** Jest
- **Code Quality:** ESLint, Prettier

## Project Overview

This repository contains the backend implementation for my glass art business website. It's designed to handle:

- Artwork gallery management
- Customer order processing
- Admin authentication
- Image storage and delivery
- Business data management

## Project Structure

```
├── lib/                    # Main application code
│   ├── controllers/       # Route controllers
│   ├── middleware/        # Custom middleware
│   ├── models/           # Database models
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   └── app.js            # Express application setup
├── __tests__/            # Test files
├── sql/                  # Database migrations and seeds
├── data/                 # Data files
└── server.js             # Application entry point
```

## About

This is a personal project showcasing my full-stack development skills while serving as the backend for my glass art business website. The implementation demonstrates my ability to create secure, scalable, and maintainable web applications using modern technologies.

## Contact

For business inquiries, please visit [Stress Less Glass](http://stresslessglass.kevinnail.com) or contact me directly at [kevin@kevinnail.com](mailto:kevin@kevinnail.com).
