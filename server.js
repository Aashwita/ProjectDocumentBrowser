const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app = express();

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// uploads
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MySQL connection
const db = mysql.createConnection({
    host    : 'localhost',
    user    : 'root',
    password: 'password',
    database: 'docbrowser'
});

db.connect(err => {
    if (err) console.log('MySQL error:', err.message);
    else      console.log('Connected to MySQL.');
});

app.use(express.json());


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
                console.log('Login successful:', username, '|', role);
                res.json({
                    success : true,
                    username: rows[0].username,
                    role    : rows[0].role
                });
            } else {
                console.log('Login failed for:', username);
                res.json({
                    success: false,
                    error  : 'Invalid username, password or role.'
                });
            }
        }
    );
});


function parseMultipart(req, callback) {

    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(-+\w+)/);

    if (!match) {
        return callback(new Error('No boundary found in Content-Type'));
    }

    const boundary = match[1];
    const chunks   = [];

    req.on('data',  chunk => chunks.push(chunk));
    req.on('error', err   => callback(err));

    req.on('end', () => {
        try {
            const raw    = Buffer.concat(chunks).toString('binary');
            const fields = {};
            let   file   = null;

            
            const parts = raw.split('--' + boundary);

            parts.forEach(part => {
              
                if (!part || part.trim() === '--' || part.trim() === '') return;

                // Header block ends at the first blank line
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
                    file = {
                        originalName: filenameMatch[1],
                        buffer      : Buffer.from(body, 'binary')
                    };
                } else {
                    
                    fields[fieldName] = body;
                }
            });

            callback(null, { fields, file });

        } catch (err) {
            callback(err);
        }
    });
}


app.post('/add-document', (req, res) => {

    parseMultipart(req, (err, data) => {
        if (err) {
            console.log('Parse error:', err.message);
            return res.status(400).json({ error: err.message });
        }

        const { fields, file } = data;
        const {
            projectName,
            subsystem,
            mission,
            docType,
            version,
            versionDate,
            submissionDate,
            uploadedBy
        } = fields;

        console.log('Fields received:', fields);
        console.log('File received:', file ? file.originalName : 'none');

        if (!projectName || !subsystem) {
            return res.status(400).json({ error: 'Project Name and Sub System are required.' });
        }

        let filePath = '';

        // Check if project already exists
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
                        // Project exists — insert document directly
                        insertDoc(rows[0].projectId);
                    } else {
                        // Project does not exist — create it first
                        db.query(
                            `INSERT INTO projects (projectName, subsystem, mission)
                             VALUES (?, ?, ?)`,
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
                 (projectId, subsystem, docType, version,
                  versionDate, submissionDate, filePath)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [projectId,
                 subsystem      || '',
                 docType        || '',
                 version        || '',
                 versionDate    || '',
                 submissionDate || '',
                 filePath],
                (err) => {
                    if (err) {
                        console.log('DB insert error:', err.message);
                        return res.status(500).json({ error: err.message });
                    }
                    console.log('Document saved successfully.');
                    res.json({ success: true });
                }
            );
        }

        // If a file was uploaded save it first then save to DB
        if (file && file.buffer && file.buffer.length > 0) {
            const uniqueName = Date.now() + '-' + file.originalName;
            const savePath   = path.join(__dirname, 'uploads', uniqueName);

            fs.writeFile(savePath, file.buffer, err => {
                if (err) {
                    console.log('File save error:', err.message);
                    return res.status(500).json({ error: 'Could not save file.' });
                }
                filePath = '/uploads/' + uniqueName;
                console.log('File saved:', savePath);
                saveToDatabase();
            });
        } else {
            // No file attached — save record without file path
            saveToDatabase();
        }
    });
});


app.delete('/delete-document/:docId', (req, res) => {

    const docId = req.params.docId;

    // First get the filePath so we can delete the physical file too
    db.query(
        'SELECT filePath FROM documents WHERE docId = ?',
        [docId],
        (err, rows) => {
            if (err)           return res.status(500).json({ error: err.message });
            if (rows.length === 0) return res.status(404).json({ error: 'Document not found.' });

            const filePath = rows[0].filePath;

            // Delete the database record
            db.query(
                'DELETE FROM documents WHERE docId = ?',
                [docId],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });

                    // Also delete the physical file from uploads/ if it exists
                    if (filePath) {
                        const fullPath = path.join(__dirname, filePath);
                        if (fs.existsSync(fullPath)) {
                            fs.unlink(fullPath, err => {
                                if (err) console.log('Could not delete file:', err.message);
                                else     console.log('File deleted:', fullPath);
                            });
                        }
                    }

                    console.log('Document', docId, 'deleted.');
                    res.json({ success: true });
                }
            );
        }
    );
});


app.get('/view-file/:filename', (req, res) => {

    const filePath = path.join(__dirname, 'uploads', req.params.filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found.');
    }

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

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition',
        'inline; filename="' + path.basename(filePath) + '"');

    fs.createReadStream(filePath).pipe(res);
});


app.get('/search', (req, res) => {

    const projectName = req.query.projectName || '';
    const subsystem    = req.query.subsystem   || '';
    const mission       = req.query.mission     || '';
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
        if (err) {
            console.log('Search error:', err.message);
            return res.status(500).json({ error: err.message });
        }

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

// 
app.listen(3000, () => {
    console.log('');
    console.log('Server started: http://localhost:3000');
    console.log('Press Ctrl+C to stop.');
    console.log('');
});
