-- PowerDNS MySQL Schema (PowerDNS 4.8.x compatible)
-- Run: mysql -u root -p powerdns < database/setup-pdns.sql

CREATE DATABASE IF NOT EXISTS powerdns;
USE powerdns;

CREATE TABLE IF NOT EXISTS domains (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    master VARCHAR(128) DEFAULT NULL,
    last_check INT DEFAULT NULL,
    notified_serial INT DEFAULT NULL,
    type VARCHAR(6) NOT NULL,
    options VARCHAR(255) DEFAULT NULL,
    catalog VARCHAR(255) DEFAULT NULL,
    UNIQUE KEY name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    domain_id INT DEFAULT NULL,
    name VARCHAR(255) DEFAULT NULL,
    type VARCHAR(10) DEFAULT NULL,
    content VARCHAR(64000) DEFAULT NULL,
    ttl INT DEFAULT NULL,
    prio INT DEFAULT NULL,
    disabled TINYINT(1) DEFAULT 0,
    ordername VARCHAR(255) DEFAULT NULL,
    auth TINYINT(1) DEFAULT 1,
    UNIQUE KEY rec_name_index (domain_id, name, type),
    KEY domain_id (domain_id),
    KEY ordername (domain_id, ordername),
    CONSTRAINT records_domain_id FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supermasters (
    ip VARCHAR(64) NOT NULL,
    nameserver VARCHAR(255) NOT NULL,
    account VARCHAR(40) NOT NULL,
    UNIQUE KEY ip_nameserver (ip, nameserver)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS domainmetadata (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_id INT NOT NULL,
    kind VARCHAR(32) NOT NULL,
    content TEXT NOT NULL,
    KEY domainmetadata_idx (domain_id, kind),
    CONSTRAINT domainmetadata_domain_id FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cryptokeys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_id INT NOT NULL,
    flags INT NOT NULL,
    active TINYINT(1) DEFAULT 0,
    content TEXT,
    CONSTRAINT cryptokeys_domain_id FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tsigkeys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    algorithm VARCHAR(50) NOT NULL,
    secret VARCHAR(255) NOT NULL,
    UNIQUE KEY namealgorithm (name, algorithm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(10) NOT NULL,
    modified_at INT NOT NULL,
    account VARCHAR(40) NOT NULL,
    comment TEXT NOT NULL,
    KEY domain_id (domain_id),
    CONSTRAINT comments_domain_id FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Grant access for PowerDNS MySQL backend
-- Update password as needed
-- GRANT ALL ON powerdns.* TO 'pdns'@'localhost' IDENTIFIED BY 'your_password';
-- FLUSH PRIVILEGES;
