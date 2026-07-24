CREATE TABLE projects (
    projectId INT NOT NULL AUTO_INCREMENT,
    projectName VARCHAR(200) NOT NULL,
    subsystem VARCHAR(200) DEFAULT NULL,
    mission VARCHAR(100) DEFAULT NULL,
    PRIMARY KEY (projectId)
);

CREATE TABLE IF NOT EXISTS documents (
    docId          INT PRIMARY KEY AUTO_INCREMENT,
    projectId      INT NOT NULL,
    subsystem      VARCHAR(200),
    docType        VARCHAR(50),
    docNumber      VARCHAR(100),
    version        VARCHAR(50),
    versionDate    VARCHAR(50),
    submissionDate VARCHAR(50),
    filePath       VARCHAR(500),
    FOREIGN KEY (projectId) REFERENCES projects(projectId)
);

CREATE TABLE users (
    userId   INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(100) NOT NULL,
    role     VARCHAR(20)  NOT NULL
);

INSERT INTO users (username, password, role) VALUES
('admin', 'admin123', 'admin'),
('user1', 'user123',  'user');
