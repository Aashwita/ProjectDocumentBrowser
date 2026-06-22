CREATE TABLE projects (
    projectId INT NOT NULL AUTO_INCREMENT,
    projectName VARCHAR(200) NOT NULL,
    subsystem VARCHAR(200) DEFAULT NULL,
    mission VARCHAR(100) DEFAULT NULL,
    PRIMARY KEY (projectId)
);

CREATE TABLE documents (
    docId INT NOT NULL AUTO_INCREMENT,
    projectId INT NOT NULL,
    subsystem VARCHAR(200) DEFAULT NULL,
    docType VARCHAR(50) DEFAULT NULL,
    version VARCHAR(50) DEFAULT NULL,
    versionDate VARCHAR(50) DEFAULT NULL,
    submissionDate VARCHAR(50) DEFAULT NULL,
    filePath VARCHAR(500) DEFAULT NULL,
    PRIMARY KEY (docId),
    KEY (projectId),
    CONSTRAINT fk_documents_projects
        FOREIGN KEY (projectId)
        REFERENCES projects(projectId)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);