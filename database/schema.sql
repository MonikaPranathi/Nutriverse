-- Nutriverse database schema

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('user','admin') DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  category ENUM('gut_health','family','quick_no_stove','veg','nonveg_egg','seafood') NOT NULL,
  budget ENUM('low','medium','high') DEFAULT 'low',
  time_needed ENUM('quick','medium','long') DEFAULT 'quick',
  taste ENUM('spicy','sweet','neutral') DEFAULT 'neutral',
  skill_level ENUM('beginner','intermediate','advanced') DEFAULT 'beginner',
  meal_time ENUM('morning','afternoon','evening','night') DEFAULT 'morning',
  video_url VARCHAR(500),
  source_type ENUM('native','youtube','external') DEFAULT 'youtube',
  uploader_id INT,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploader_id) REFERENCES users(id)
);

CREATE TABLE ingredients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  is_user_submitted BOOLEAN DEFAULT FALSE
);

CREATE TABLE class_ingredients (
  class_id INT,
  ingredient_id INT,
  PRIMARY KEY (class_id, ingredient_id),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
);

CREATE TABLE moods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE class_moods (
  class_id INT,
  mood_id INT,
  PRIMARY KEY (class_id, mood_id),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (mood_id) REFERENCES moods(id) ON DELETE CASCADE
);

CREATE TABLE cuisines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE class_cuisines (
  class_id INT,
  cuisine_id INT,
  PRIMARY KEY (class_id, cuisine_id),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (cuisine_id) REFERENCES cuisines(id) ON DELETE CASCADE
);

CREATE TABLE user_likes (
  user_id INT,
  class_id INT,
  liked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, class_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  message VARCHAR(255) NOT NULL,
  related_class_id INT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (related_class_id) REFERENCES classes(id) ON DELETE SET NULL
);

-- Seed a few ingredients to start
INSERT INTO ingredients (name) VALUES
('Rice'),('Dal'),('Tomato'),('Onion'),('Garlic'),('Ginger'),('Spinach'),
('Egg'),('Paneer'),('Coconut'),('Fish'),('Potato'),('Milk'),('Curd'),
('Green Chili'),('Millet'),('Curry Leaves'),('Peanuts');