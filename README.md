# Project Document Browser

A web-based application to search and manage software project documents such as SRS, SDD, ICD, Test Reports, Certificates and more.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js + Express |
| Database | MySQL |

---

## Project Structure

```
ProjectDocBrowser/
├── server.js              ← Node.js backend server
├── schema.sql             ← Run this once in MySQL to create tables
├── package.json           ← Node.js project configuration
├── package-lock.json      ← Exact dependency versions
├── README.md              ← This file
└── public/
    ├── index.html         ← Main page (Search + Add Files)
    └── results.html       ← Search results window
```

---

## Prerequisites

Make sure the following are installed on your computer before running the project:

| Software | Download Link |
|---|---|
| Node.js (v18 or higher) | https://nodejs.org |
| MySQL | https://dev.mysql.com/downloads/installer |

---

## Setup Instructions

### Step 1 — Clone the Repository

```
git clone https://github.com/YourUsername/project-doc-browser.git
cd project-doc-browser
```

Or download as ZIP from GitHub and extract it.

---

### Step 2 — Install Dependencies

Open a terminal inside the project folder and run:

```
npm install
```

This installs Express, MySQL2, and CORS automatically.

---

### Step 3 — Set Up MySQL Database

1. Open **MySQL Workbench** or the MySQL command line
2. Copy and paste the contents of `schema.sql`
3. Run it — this creates the `docbrowser` database and the `projects` and `documents` tables

---

### Step 4 — Configure Database Password

Open `server.js` and find this line:

```javascript
password: 'your_mysql_password',
```

Replace `your_mysql_password` with your actual MySQL root password. If you set no password during installation, leave it as empty quotes:

```javascript
password: '',
```

---

### Step 5 — Start the Server

```
node server.js
```

You should see:

```
Server started: http://localhost:3000
Connected to MySQL successfully.
```

If you see a MySQL connection error, double check your password in Step 4 and make sure MySQL is running.

---

### Step 6 — Open the Application

Open any browser and go to:

```
http://localhost:3000
```

---

## How to Use

### Search Project
1. Click **Search Project** in the left panel
2. Enter the Project Name (required), Sub System, Mission, Version and Document Type
3. Click **Search**
4. A results window opens showing all matching documents
5. Click **Open** to view any document

### Add Files
1. Click **Add Files** in the left panel
2. Fill in the project details — Project Name and Sub System are required
3. Select a file using the **Browse** button
4. Click **Submit**

---

## Database Tables

### projects
| Column | Type | Description |
|---|---|---|
| projectId | INT (PK) | Auto-generated unique ID |
| projectName | VARCHAR(200) | Name of the project |
| subsystem | VARCHAR(200) | Software subsystem (e.g. LC, CC) |
| mission | VARCHAR(100) | Mission name |

### documents
| Column | Type | Description |
|---|---|---|
| docId | INT (PK) | Auto-generated unique ID |
| projectId | INT (FK) | Links to projects table |
| subsystem | VARCHAR(200) | Sub system for this document |
| docType | VARCHAR(50) | Type of document (SRS, SDD, ICD etc.) |
| version | VARCHAR(50) | Document version |
| versionDate | VARCHAR(50) | Date of this version |
| submissionDate | VARCHAR(50) | Date submitted |
| filePath | VARCHAR(500) | Path to uploaded file on server |

---

## Document Types Supported

- SRS — Software Requirements Specification
- SDD — Software Design Document
- ICD — Interface Control Document
- Change Note
- Resource List
- Observation Reports
- Reply Report
- Certificates
- Technical Notes

---

## Notes

- The `uploads/` folder is created automatically when the server starts for the first time
- Uploaded files are stored in the `uploads/` folder on the server
- The `node_modules/` folder is not included — run `npm install` to recreate it
- To stop the server press `Ctrl + C` in the terminal

---

## Stopping the Server

```
Ctrl + C
```

---

## For Multi-User Access

To allow multiple users to access the application over a local network:

1. Find the server computer's IP address by running `ipconfig` in Command Prompt
2. Look for the **IPv4 Address** (e.g. `192.168.1.10`)
3. Other users on the same network open their browser and go to:

```
http://192.168.1.10:3000
```

No installation needed on other computers — just a browser.
