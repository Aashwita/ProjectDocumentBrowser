const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app = express();

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ── Uploads folder ────────────────────────────────
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── MySQL Connection ──────────────────────────────
const db = mysql.createConnection({
    host    : 'localhost',
    user    : 'root',
    password: 'password',
    database: 'docbrowser'
});

db.connect(err => {
    if (err) {
        console.log('MySQL connection failed:', err.message);
    } else {
        console.log('Connected to MySQL successfully.');
    }
});

// ── Regular JSON routes need this ─────────────────
app.use(express.json());

// ═══════════════════════════════════════════════════
//  MANUAL MULTIPART PARSER (replaces multer)
// ═══════════════════════════════════════════════════
//
// Reads the raw request body as a Buffer, finds the
// boundary marker from the Content-Type header, and
// splits the body into individual parts. Each part is
// either a plain text field or a file (has filename).
//
function parseMultipart(req, callback) {

    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);

    if (!boundaryMatch) {
        return callback(new Error('Not a multipart/form-data request'));
    }

    const boundary = '--' + boundaryMatch[1];
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));

    req.on('end', () => {
        try {
            const buffer = Buffer.concat(chunks);
            const boundaryBuffer = Buffer.from(boundary);

            // Split the buffer into parts using the boundary marker
            const parts = [];
            let start = buffer.indexOf(boundaryBuffer);

            while (start !== -1) {
                const next = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
                if (next === -1) break;

                // Extract one part's raw bytes (between this boundary and the next)
                let partBuffer = buffer.slice(start + boundaryBuffer.length, next);

                // Trim leading \r\n and trailing \r\n
                if (partBuffer.slice(0, 2).toString() === '\r\n') {
                    partBuffer = partBuffer.slice(2);
                }
                if (partBuffer.slice(-2).toString() === '\r\n') {
                    partBuffer = partBuffer.slice(0, -2);
                }

                if (partBuffer.length > 0) {
                    parts.push(partBuffer);
                }

                start = next;
            }

            const fields = {};
            let file = null;

            parts.forEach(part => {
                // Header ends at the first \r\n\r\n
                const headerEnd = part.indexOf('\r\n\r\n');
                if (headerEnd === -1) return;

                const headerText = part.slice(0, headerEnd).toString();
                const body = part.slice(headerEnd + 4);

                const nameMatch = headerText.match(/name="([^"]+)"/);
                const filenameMatch = headerText.match(/filename="([^"]*)"/);

                if (!nameMatch) return;
                const fieldName = nameMatch[1];

                if (filenameMatch && filenameMatch[1] !== '') {
                    // This part is a file
                    file = {
                        fieldName: fieldName,
                        originalName: filenameMatch[1],
                        buffer: body
                    };
                } else {
                    // This part is a plain text field
                    fields[fieldName] = body.toString().trim();
                }
            });

            callback(null, { fields, file });

        } catch (err) {
            callback(err);
        }
    });

    req.on('error', err => callback(err));
}

// ── SEARCH ROUTE ──────────────────────────────────
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

// ── ADD DOCUMENT ROUTE (uses manual parser, not multer) ──
app.post('/add-document', (req, res) => {

    parseMultipart(req, (err, data) => {
        if (err) {
            console.log('Upload parse error:', err.message);
            return res.status(400).json({ error: 'Could not parse upload: ' + err.message });
        }

        const { fields, file } = data;
        const { projectName, subsystem, mission,
                docType, version, versionDate, submissionDate } = fields;

        if (!projectName || !subsystem) {
            return res.status(400).json({ error: 'Project Name and Sub System are required.' });
        }

        let filePath = '';

        if (file && file.buffer && file.buffer.length > 0) {
            const uniqueName = Date.now() + '-' + file.originalName;
            const savePath = path.join(__dirname, 'uploads', uniqueName);

            fs.writeFile(savePath, file.buffer, err => {
                if (err) {
                    console.log('File save error:', err.message);
                    return res.status(500).json({ error: 'Could not save file.' });
                }
                filePath = '/uploads/' + uniqueName;
                saveToDatabase();
            });
        } else {
            saveToDatabase();
        }

        function saveToDatabase() {
            db.query(
                `SELECT projectId FROM projects
                 WHERE LOWER(projectName) = LOWER(?)
                 AND LOWER(subsystem) = LOWER(?)
                 AND LOWER(mission) = LOWER(?)`,
                [projectName, subsystem, mission || ''],
                (err, rows) => {
                    if (err) return res.status(500).json({ error: err.message });

                    if (rows.length > 0) {
                        insertDocument(rows[0].projectId);
                    } else {
                        db.query(
                            `INSERT INTO projects (projectName, subsystem, mission)
                             VALUES (?, ?, ?)`,
                            [projectName, subsystem, mission || ''],
                            (err, result) => {
                                if (err) return res.status(500).json({ error: err.message });
                                insertDocument(result.insertId);
                            }
                        );
                    }
                }
            );
        }

        function insertDocument(projectId) {
            db.query(
                `INSERT INTO documents
                 (projectId, subsystem, docType, version, versionDate, submissionDate, filePath)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [projectId, subsystem, docType, version,
                 versionDate || '', submissionDate || '', filePath],
                (err) => {
                    if (err) {
                        console.log('Insert error:', err.message);
                        res.status(500).json({ error: err.message });
                    } else {
                        res.json({ success: true });
                    }
                }
            );
        }
    });
});

// ── START SERVER ──────────────────────────────────
app.listen(3000, () => {
    console.log('');
    console.log('Server started successfully.');
    console.log('Open browser and go to: http://localhost:3000');
    console.log('Uploaded files are saved in the "uploads" folder.');
    console.log('Press Ctrl+C to stop.');
    console.log('');
});
