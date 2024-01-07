
## This is the backend Express/ Node server for my [React Gallery App](https://github.com/kevinnail/fs-react-exp-gallery-frontend)

### This app demonstrates how to:
- Set up auth for an owner/ user
- Upload/ display images to Cloudinary
- Use redirect to mitigate cors issues with using Netlify for the front end and Heroku for the back end

### Scripts

| command                | description                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `npm start`            | starts the app - should only be used in production as changes will not get reloaded |
| `npm run start:watch`  | runs the app using `nodemon` which watches for changes and reloads the app          |
| `npm test`             | runs the tests once                                                                 |
| `npm run test:watch`   | continually watches and runs the tests when files are updated                       |
| `npm run setup-db`     | sets up the database locally                                                        |
| `npm run setup-heroku` | sets up the database on heroku                                                      |

### User Routes

| Route                    | HTTP Method | HTTP Body                                                                              | Description                                        |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `/api/v1/users/`         | `POST`      | `{email: 'example@test.com', password: '123456', firstName: 'Test', lastName: 'User'}` | Creates new user                                   |
| `api/v1/users/sessions/` | `POST`      | `{email: 'example@test.com', password: '123456'}`                                      | Signs in existing user                             |
| `/api/v1/users/me/`      | `GET`       | None                                                                                   | Returns current user                               |
| `/api/v1/users/`         | `GET`       | None                                                                                   | Authorized endpoint - returns all users for admin. |
| `api/v1/users/sessions/` | `DELETE`    | None                                                                                   | Deletes a user session                             |
