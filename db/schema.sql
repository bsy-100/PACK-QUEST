CREATE DATABASE IF NOT EXISTS packquest
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE packquest;

-- 로그인(선택). 비로그인 참여자는 members.user_id가 NULL이다.
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(20)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nickname      VARCHAR(20)  NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

CREATE TABLE sessions (
  token_hash CHAR(64)     NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE trips (
  code       CHAR(8)  NOT NULL,
  region     ENUM('domestic','overseas')           NOT NULL,
  transport  ENUM('plane','car','train')           NOT NULL,
  duration   ENUM('day','short','long')            NOT NULL,
  season     ENUM('spring_fall','summer','winter') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (code)
) ENGINE=InnoDB;

CREATE TABLE members (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  trip_code  CHAR(8)      NOT NULL,
  nickname   VARCHAR(20)  NOT NULL,
  token_hash CHAR(64)     NOT NULL,
  is_host    BOOLEAN      NOT NULL DEFAULT FALSE,
  user_id    INT UNSIGNED NULL,
  joined_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_members_token (token_hash),
  UNIQUE KEY uq_members_nickname (trip_code, nickname),
  UNIQUE KEY uq_members_user (trip_code, user_id),
  CONSTRAINT fk_members_trip FOREIGN KEY (trip_code)
    REFERENCES trips (code) ON DELETE CASCADE,
  CONSTRAINT fk_members_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE items (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  trip_code   CHAR(8)      NOT NULL,
  name        VARCHAR(50)  NOT NULL,
  category    ENUM('documents','clothing','toiletries','electronics','health','etc') NOT NULL,
  assignee_id INT UNSIGNED NULL,
  done        BOOLEAN      NOT NULL DEFAULT FALSE,
  source      ENUM('recommended','custom') NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_items_trip (trip_code),
  CONSTRAINT fk_items_trip FOREIGN KEY (trip_code)
    REFERENCES trips (code) ON DELETE CASCADE,
  CONSTRAINT fk_items_assignee FOREIGN KEY (assignee_id)
    REFERENCES members (id) ON DELETE SET NULL
) ENGINE=InnoDB;
