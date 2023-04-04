-- Use this file to define your SQL tables
-- The SQL in this file will be executed when you run `npm run setup-db`
DROP TABLE IF EXISTS users_admin CASCADE;
DROP TABLE IF EXISTS gallery_posts CASCADE;
DROP TABLE IF EXISTS gallery_imgs CASCADE;

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
  author_id BIGINT,
  public_id VARCHAR,
 num_imgs BIGINT
  -- FOREIGN KEY (author_id) REFERENCES users_admin(id)
);

CREATE TABLE gallery_imgs (
  id SERIAL PRIMARY KEY,
  post_id INTEGER,
  image_url VARCHAR(255),
  public_id VARCHAR(255),
  FOREIGN KEY (post_id) REFERENCES gallery_posts(id) ON DELETE CASCADE
);



INSERT INTO gallery_posts (created_at, title, description, image_url, category, price, author_id, public_id, num_imgs)
VALUES 
  (NOW(), 'Test 1', 'Test 1', 'Test 1', 'Test 1', 'Test 1', 1, 'Test 1', 1),
  (NOW(), 'Test 2', 'Test 2', 'Test 2', 'Test 2', 'Test 2', 1, 'Test 2', 1),
  (NOW(), 'Test 3', 'Test 3', 'Test 3', 'Test 3', 'Test 3', 1,  'Test 3', 1);

INSERT INTO gallery_imgs (post_id, image_url, public_id)
VALUES 
  (1, 'image_url.com', 'public_id_1'),
  (1, 'image_url.com2', 'public_id_2'),
  (1, 'image_url.com3', 'public_id_3');
