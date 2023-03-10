-- Use this file to define your SQL tables
-- The SQL in this file will be executed when you run `npm run setup-db`
DROP TABLE IF EXISTS users_admin;
DROP TABLE IF EXISTS gallery_posts;

CREATE TABLE users_admin (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL
);

CREATE TABLE gallery_posts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  title VARCHAR,
  description VARCHAR,
  image_url VARCHAR,
  category VARCHAR,
  price VARCHAR,
  author_id BIGINT
  -- FOREIGN KEY (author_id) REFERENCES users_admin(id)
);



INSERT INTO gallery_posts (created_at, title, description, image_url, category, price, author_id)
VALUES 
  (NOW(), 'Test 1', 'Test 1', 'Test 1', 'Test 1', 'Test 1', 1),
  (NOW(), 'Test 2', 'Test 2', 'Test 2', 'Test 2', 'Test 2', 1),
  (NOW(), 'Test 3', 'Test 3', 'Test 3', 'Test 3', 'Test 3', 1);
