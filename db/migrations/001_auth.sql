-- 이미 schema.sql로 만든 DB에 로그인 기능을 더한다(서버 DB용). 처음 만드는 DB는 schema.sql만 실행하면 된다.
-- 실행: sudo mariadb < db/migrations/001_auth.sql
USE packquest;

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(20)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nickname      VARCHAR(20)  NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64)     NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS user_id INT UNSIGNED NULL AFTER is_host,
  ADD UNIQUE KEY IF NOT EXISTS uq_members_user (trip_code, user_id),
  ADD CONSTRAINT fk_members_user FOREIGN KEY IF NOT EXISTS (user_id)
    REFERENCES users (id) ON DELETE SET NULL;
