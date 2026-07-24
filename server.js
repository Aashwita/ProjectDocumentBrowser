const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app = express();

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// ── Uploads
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// mySQL Connection
const db = mysql.createConnection({
    host    : process.env.DB_HOST     || 'localhost',
    user    : process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME     || 'docbrowser',
    port    : process.env.DB_PORT     || 3306
});

db.connect(err => {
    if (err) console.log('MySQL error:', err.message);
    else      console.log('Connected to MySQL.');
});

app.use(express.json());

// Remove ngrok browser warning
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});

//login
app.post('/login', (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.json({ success: false, error: 'All fields are required.' });
    }

    db.query(
        'SELECT * FROM users WHERE username = ? AND password = ? AND role = ?',
        [username, password, role],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            if (rows.length > 0) {
                console.log('Login:', username, '|', role);
                res.json({ success: true, username: rows[0].username, role: rows[0].role });
            } else {
                res.json({ success: false, error: 'Invalid username, password or role.' });
            }
        }
    );
});

//  All projects
app.get('/get-projects', (req, res) => {
    db.query(
        'SELECT DISTINCT projectName FROM projects ORDER BY projectName',
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

//project details
app.get('/get-project-details', (req, res) => {
    const projectName = req.query.projectName || '';

    if (!projectName) {
        return res.json({ subsystems: [], missions: [] });
    }

    db.query(
        `SELECT DISTINCT subsystem, mission
         FROM projects
         WHERE LOWER(projectName) = LOWER(?)
         ORDER BY subsystem`,
        [projectName],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            const subsystems = [...new Set(rows.map(r => r.subsystem).filter(Boolean))];
            const missions   = [...new Set(rows.map(r => r.mission).filter(Boolean))];

            res.json({ subsystems, missions });
        }
    );
});

//search
app.get('/search', (req, res) => {

    const projectName = req.query.projectName || '';
    const subsystem    = req.query.subsystem   || '';
    const mission       = req.query.mission     || '';
    const docNumber     = req.query.docNumber   || '';
    const version       = req.query.version     || '';
    const docType       = req.query.docType     || 'All';

    let sql = `
        SELECT
            d.docId,
            p.projectId,
            p.projectName,
            p.subsystem AS projectSubsystem,
            p.mission,
            d.subsystem AS docSubsystem,
            d.docType,
            d.docNumber,
            d.version,
            d.versionDate,
            d.submissionDate,
            d.filePath
        FROM documents d
        JOIN projects p ON p.projectId = d.projectId
        WHERE 1=1
    `;

    const params = [];

    if (projectName !== '') {
        sql += ' AND LOWER(p.projectName) LIKE ?';
        params.push('%' + projectName.toLowerCase() + '%');
    }
    if (subsystem !== '') {
        sql += ' AND LOWER(p.subsystem) LIKE ?';
        params.push('%' + subsystem.toLowerCase() + '%');
    }
    if (mission !== '') {
        sql += ' AND LOWER(p.mission) LIKE ?';
        params.push('%' + mission.toLowerCase() + '%');
    }
    if (docNumber !== '') {
        sql += ' AND LOWER(d.docNumber) LIKE ?';
        params.push('%' + docNumber.toLowerCase() + '%');
    }
    if (version !== '') {
        sql += ' AND LOWER(d.version) LIKE ?';
        params.push('%' + version.toLowerCase() + '%');
    }
    if (docType !== 'All') {
        sql += ' AND d.docType = ?';
        params.push(docType);
    }

    sql += ' ORDER BY p.projectName, d.docType';

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        const withFileName = results.map(row => {
            let fileName = '';
            if (row.filePath) {
                const rawName = row.filePath.split('/').pop();
                fileName = rawName.includes('-')
                    ? rawName.substring(rawName.indexOf('-') + 1)
                    : rawName;
            }
            return { ...row, fileName };
        });

        res.json(withFileName);
    });
});

//doc add
function parseMultipart(req, callback) {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(-+\w+)/);
    if (!match) return callback(new Error('No boundary found'));

    const boundary = match[1];
    const chunks   = [];
    req.on('data',  chunk => chunks.push(chunk));
    req.on('error', err   => callback(err));
    req.on('end', () => {
        try {
            const raw    = Buffer.concat(chunks).toString('binary');
            const fields = {};
            let   file   = null;
            const parts  = raw.split('--' + boundary);

            parts.forEach(part => {
                if (!part || part.trim() === '--' || part.trim() === '') return;
                const blankLine = part.indexOf('\r\n\r\n');
                if (blankLine === -1) return;
                const headerBlock = part.substring(0, blankLine);
                let body = part.substring(blankLine + 4);
                if (body.endsWith('\r\n')) body = body.slice(0, -2);
                const dispMatch     = headerBlock.match(/Content-Disposition:[^\r\n]*/i);
                const nameMatch     = dispMatch ? dispMatch[0].match(/name="([^"]*)"/)     : null;
                const filenameMatch = dispMatch ? dispMatch[0].match(/filename="([^"]*)"/) : null;
                if (!nameMatch) return;
                const fieldName = nameMatch[1];
                if (filenameMatch && filenameMatch[1] !== '') {
                    file = { originalName: filenameMatch[1], buffer: Buffer.from(body, 'binary') };
                } else {
                    fields[fieldName] = body;
                }
            });
            callback(null, { fields, file });
        } catch (err) { callback(err); }
    });
}

app.post('/add-document', (req, res) => {
    parseMultipart(req, (err, data) => {
        if (err) return res.status(400).json({ error: err.message });

        const { fields, file } = data;
        const { projectName, subsystem, mission, docType,
        version, docNumber, versionDate, submissionDate } = fields;

        if (!projectName || !subsystem) {
            return res.status(400).json({ error: 'Project Name and Sub System are required.' });
        }

        let filePath = '';

        function saveToDatabase() {
            db.query(
                `SELECT projectId FROM projects
                 WHERE LOWER(projectName) = LOWER(?)
                 AND LOWER(subsystem)     = LOWER(?)
                 AND LOWER(mission)       = LOWER(?)`,
                [projectName, subsystem, mission || ''],
                (err, rows) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (rows.length > 0) {
                        insertDoc(rows[0].projectId);
                    } else {
                        db.query(
                            'INSERT INTO projects (projectName, subsystem, mission) VALUES (?, ?, ?)',
                            [projectName, subsystem, mission || ''],
                            (err, result) => {
                                if (err) return res.status(500).json({ error: err.message });
                                insertDoc(result.insertId);
                            }
                        );
                    }
                }
            );
        }

        function insertDoc(projectId) {
            db.query(
                `INSERT INTO documents
                (projectId, subsystem, docType, version, docNumber, versionDate, submissionDate, filePath)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [projectId, subsystem || '', docType || '',
                version || '', docNumber || '', versionDate || '', submissionDate || '', filePath],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true });
                }
            );
        }

        if (file && file.buffer && file.buffer.length > 0) {
            const uniqueName = Date.now() + '-' + file.originalName;
            const savePath   = path.join(__dirname, 'uploads', uniqueName);
            fs.writeFile(savePath, file.buffer, err => {
                if (err) return res.status(500).json({ error: 'Could not save file.' });
                filePath = '/uploads/' + uniqueName;
                saveToDatabase();
            });
        } else {
            saveToDatabase();
        }
    });
});
// delete route
app.delete('/delete-document/:docId', (req, res) => {
    const docId = req.params.docId;
    db.query('SELECT filePath FROM documents WHERE docId = ?', [docId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (rows.length === 0) return res.status(404).json({ error: 'Document not found.' });

        const filePath = rows[0].filePath;
        db.query('DELETE FROM documents WHERE docId = ?', [docId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (filePath) {
                const fullPath = path.join(__dirname, filePath);
                if (fs.existsSync(fullPath)) fs.unlink(fullPath, () => {});
            }
            res.json({ success: true });
        });
    });
});

//  update project route

app.put('/update-project/:projectId', (req, res) => {
    const projectId = req.params.projectId;
    const { projectName, subsystem, mission } = req.body;

    if (!projectName || !subsystem) {
        return res.status(400).json({ error: 'Project Name and Sub System are required.' });
    }

    db.query(
        'UPDATE projects SET projectName = ?, subsystem = ?, mission = ? WHERE projectId = ?',
        [projectName, subsystem, mission || '', projectId],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

//  view file route

app.get('/view-file/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found.');

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.pdf' : 'application/pdf',
        '.doc' : 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls' : 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt' : 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.txt' : 'text/plain',
        '.png' : 'image/png',
        '.jpg' : 'image/jpeg',
        '.jpeg': 'image/jpeg'
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline; filename="' + path.basename(filePath) + '"');
    fs.createReadStream(filePath).pipe(res);
});


//  add project route (for admin only)
app.post('/add-project', (req, res) => {
  const { projectName, subsystem, mission } = req.body;

  if (!projectName || !subsystem) {
    return res.status(400).json({ error: 'Project Name and Sub System are required.' });
  }

  db.query(
    'INSERT INTO projects (projectName, subsystem, mission) VALUES (?, ?, ?)',
    [projectName, subsystem, mission || ''],
    (err) => {
      if (err) {
        console.log('Add project error:', err.message);
        return res.status(500).json({ error: err.message });
      }
      console.log('Project added:', projectName);
      res.json({ success: true });
    }
  );
});

//management routes (for admin only)
// Get all users
app.get('/get-users', (req, res) => {
    db.query(
        'SELECT userId, username, role FROM users ORDER BY role, username',
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// add user
app.post('/add-user', (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    db.query(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [username, password, role],
        (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.json({ success: false, error: 'Username already exists.' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
        }
    );
});

//edit user
app.put('/edit-user/:userId', (req, res) => {
    const userId = req.params.userId;
    const { username, password, role } = req.body;

    if (!username || !role) {
        return res.status(400).json({ error: 'Username and role are required.' });
    }

    // If password is provided update it too, otherwise keep existing
    if (password && password.trim() !== '') {
        db.query(
            'UPDATE users SET username = ?, password = ?, role = ? WHERE userId = ?',
            [username, password, role, userId],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    } else {
        db.query(
            'UPDATE users SET username = ?, role = ? WHERE userId = ?',
            [username, role, userId],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    }
});

//delete user
app.delete('/delete-user/:userId', (req, res) => {
    const userId = req.params.userId;
    db.query('DELETE FROM users WHERE userId = ?', [userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// start server
app.listen(process.env.PORT || 3000,'0.0.0.0',() => {
    console.log('');
    console.log('Server started: http://localhost:3000');
    console.log('Press Ctrl+C to stop.');
    console.log('');
});
