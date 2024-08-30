const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const passport = require('passport');
const { BasicStrategy } = require('passport-http');
const util = require('util');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new BasicStrategy(
    function(username, password, done) {
        if (username === 'Administrator' && password === 'dpaeldptm123!') {
            return done(null, { username: 'Administrator' });
        } else {return done(null, false);}
    }
));

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {year: 'numeric', month: 'short', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric'});
}

// Helix QAC
const reportsDir = "C:\\ProgramData\\Jenkins\\.jenkins\\workspace\\helix\\prqa\\configs\\Initial\\reports";

function findLatestReport() {
        if (!fs.existsSync(reportsDir)) {return null;}

        const files = fs.readdirSync(reportsDir);
        const reportFiles = files.filter(file => file.startsWith('helix_SCR_') && file.endsWith('.html'));
            
        if (reportFiles.length === 0) {return null;}

        const latestReport = reportFiles.reduce((latest, file) => {
        const latestTime = extractTimestamp(latest);
        const fileTime = extractTimestamp(file);
        
        return fileTime > latestTime ? file : latest;
    });
    return path.join(reportsDir, latestReport);
}

function extractTimestamp(filename) {
    const match = filename.match(/helix_SCR_(\d{8}_\d{6})/);
    if (match) {
        const dateString = match[1];
        const year = parseInt(dateString.substr(0, 4), 10);
        const month = parseInt(dateString.substr(4, 2), 10) - 1;
        const day = parseInt(dateString.substr(6, 2), 10);
        const hours = parseInt(dateString.substr(9, 2), 10);
        const minutes = parseInt(dateString.substr(11, 2), 10);
        const seconds = parseInt(dateString.substr(13, 2), 10);
        return new Date(year, month, day, hours, minutes, seconds);
    }
    return new Date(0);
}

function extractSummary(html) {

    const rulesWithViolations = parseInt((html.match(/Rules with Violations \((\d+)\)/) || [])[1] || '0', 10);
    const lastAnalysisDateTimeMatch = html.match(/Last analysis date<\/td><td[^>]*>(.*?)<\/td>/);
    let lastAnalysisDateTime = lastAnalysisDateTimeMatch ? lastAnalysisDateTimeMatch[1] : 'N/A';

    if (lastAnalysisDateTime !== 'N/A') {
        const [day, month, year, time] = lastAnalysisDateTime.match(/(\d{2})\s(\w+)\s(\d{4})\sat\s(\d{2}:\d{2}:\d{2})/).slice(1);
        const months = {'Jan': '1', 'Feb': '2', 'Mar': '3', 'Apr': '4', 'May': '5', 'Jun': '6', 'Jul': '7', 'Aug': '8', 'Sep': '9', 'Oct': '10', 'Nov': '11', 'Dec': '12'};
        lastAnalysisDateTime = `${year}년 ${months[month]}월 ${day}일 ${time}`;
    }

    const result = { rulesWithViolations, lastAnalysisDateTime };
    saveDataToFile(result, path.join(__dirname, 'public', 'data', 'helix.json'));
    return result;
}
// -------------------------------------

// Codesonar
const codesonarOutputFile = "C:/ProgramData/Jenkins/.jenkins/workspace/codesonar/codesonar_output.txt";

function parseCodeSonarOutput(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let totalWarnings = 0;
    let lastRunTime = '';
    let activeWarnings = 0;
    const filePaths = new Set();

    lines.forEach(line => {
        if (line.startsWith('  Reporting')) {
            totalWarnings++;
            const filePathMatch = line.match(/at (.*?):\d+/);
            if (filePathMatch) {filePaths.add(filePathMatch[1]);}
        }
        if (line.includes('Time Elapsed')) {lastRunTime = line.match(/\[(.*?)\]/)[1];}
    });

    lastRunTime = formatDate(lastRunTime);
    activeWarnings = totalWarnings - activeWarnings;

    const result = { total: totalWarnings,lastRunTime,activeWarnings };
    saveDataToFile(result, path.join(__dirname, 'public', 'data', 'codesonar.json'));
    return result;
}
// ----------------------------------------------------

// VectorCAST
const vectorCASTReportPath = 'C:/Environments/test/abc.html';

function extractTimestampFromVectorCAST(dateStr, timeStr) {
    const [day, month, year] = dateStr.split(' ');
    const [time, period] = timeStr.split(' ');
    let [hour, minute, second] = time.split(':').map(Number);
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    const months = {'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11};
    const monthIndex = months[month.toUpperCase()];
    return new Date(year, monthIndex, parseInt(day, 10), hour, minute, second);
}

function formatDateForVectorCAST(date) {
    if (isNaN(date.getTime())) { return 'Invalid Date';}
    const zeroPad = (num) => num.toString().padStart(2, '0');
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]}) ${zeroPad(date.getHours())}:${zeroPad(date.getMinutes())}:${zeroPad(date.getSeconds())}`;
}

function extractVectorCASTSummary(html) {
    const createdDateMatch = html.match(/Date of Report Creation<\/th><td>(.*?)<\/td>/);
    const createdTimeMatch = html.match(/Time of Report Creation<\/th><td>(.*?)<\/td>/);
    const createdDate = createdDateMatch ? createdDateMatch[1] : 'Unknown';
    const createdTime = createdTimeMatch ? createdTimeMatch[1] : 'Unknown';
    const formattedCreated = createdDate !== 'Unknown' && createdTime !== 'Unknown' 
        ? formatDateForVectorCAST(extractTimestampFromVectorCAST(createdDate, createdTime)) 
        : 'Unknown';
    const passFailMatch = html.match(/<td id="overall-results-testcases">(.*?)<\/td>/);
    const passFail = passFailMatch ? passFailMatch[1].split('PASS')[0].trim() : 'Unknown';

    const result = { created: formattedCreated, passFail };
    saveDataToFile(result, path.join(__dirname, 'public', 'data', 'vectorcast.json'));
    return result;
}
// ----------------------------------------------

// Function to save data to file
function saveDataToFile(newData, filePath) {
    let existingData = [];

    if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf8');
        try {
            existingData = JSON.parse(fileData);
            if (!Array.isArray(existingData)) { existingData = []; }
        } catch (error) {
            console.error("Error parsing existing JSON data:", error);
            existingData = [];
        }
    }

    const latestEntry = existingData[existingData.length - 1];
    if (latestEntry && JSON.stringify(latestEntry) === JSON.stringify(newData)) { return; }
    existingData.push(newData);

    try {
        fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf8');
    } catch (error) {
        console.error(`Error saving data to ${filePath}:`, error);
    }
}
// ------------------------------------------------------------------------------------


const { pipelineState, runCodeSonarPipeline, runHelixPipeline, runVectorCastPipeline, getPipelineProgress, resetPipelineState, checkAllPipelinesCompletion } = require('./pipelines');

// CodeSonar Pipeline
app.post('/run-codesonar-pipeline', (req, res) => {
    try {
        res.status(200).send('CodeSonar pipeline triggered.');
        runCodeSonarPipeline().catch(err => {console.error('CodeSonar pipeline encountered an error:', err);});
    } catch (error) {
        console.error('Error triggering CodeSonar pipeline:', error);
        res.status(500).send('Failed to trigger CodeSonar pipeline.');
    }
});

// Helix QAC Pipeline
app.post('/run-helix-pipeline', (req, res) => {
    try {
        res.status(200).send('Helix QAC pipeline triggered.');
        runHelixPipeline().catch(err => {console.error('Helix QAC pipeline encountered an error:', err);});
    } catch (error) {
        console.error('Error triggering Helix QAC pipeline:', error);
        res.status(500).send('Failed to trigger Helix QAC pipeline.');
    }
});

// VectorCAST Pipeline
app.post('/run-vectorcast-pipeline', (req, res) => {
    try {
        res.status(200).send('VectorCAST pipeline triggered.');
        runVectorCastPipeline().catch(err => {console.error('VectorCAST pipeline encountered an error:', err);});
    } catch (error) {
        console.error('Error triggering VectorCAST pipeline:', error);
        res.status(500).send('Failed to trigger VectorCAST pipeline.');
    }
});


// Progress
app.post('/start-pipelines', async (req, res) => {
    try {
        resetPipelineState();  // Keep this to ensure a clean start
        await Promise.all([runCodeSonarPipeline(), runHelixPipeline(), runVectorCastPipeline()]);
        res.json({ status: 'Pipelines started successfully' });
    } catch (error) {
        console.error('Error starting pipelines:', error);
        res.status(500).json({ error: 'Failed to start pipelines' });
    }
});


app.post('/end-pipelines', async (req, res) => {
    try {
        await checkAllPipelinesCompletion();
        res.status(200).send('Pipelines completed successfully.');
    } catch (error) {
        console.error('Error triggering pipelines completion:', error);
        res.status(500).send('Failed to complete pipelines.');
    }
});

// Get Pipeline Status
app.get('/pipeline-status', (req, res) => {
    res.json({ status: pipelineState.status });
});

// Get Pipeline Progress
app.get('/pipeline-progress', (req, res) => {
    const globalPipelineProgress = Math.round((pipelineState.progress.codeSonar + pipelineState.progress.helix + pipelineState.progress.vectorcast) / 3);
    res.json({ progress: globalPipelineProgress });
});

// Get Specific Pipeline Progress
app.get('/specific-pipeline-progress/:pipeline', async (req, res) => {
    const pipelineName = req.params.pipeline;
    const progress = await getPipelineProgress(pipelineName);
    res.json({ progress });
});

// Get Completion Time
app.get('/completion-time', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const formattedCompletionTime = pipelineState.completionTime
        ? pipelineState.completionTime.toLocaleString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        })
        : null;
    res.json({ completionTime: formattedCompletionTime });
});

// Settings
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, file.originalname); }
});

const upload = multer({ storage: storage });


const { loadSettings, saveSettings, createNewRepository, commitAndPushToGitHub, readJsonFile } = require('./settings');

let settings;
(async () => { settings = await loadSettings(); })();

app.post('/settings', upload.fields([
    { name: 'vectorcast-upload', maxCount: 1 },
    { name: 'helix-upload', maxCount: 1 },
    { name: 'codesonar-upload', maxCount: 1 }
]), async (req, res) => {
    console.log('POST /settings called');
    console.log('Received body:', req.body);
    console.log('Received files:', req.files);

    if (req.files['vectorcast-upload']) { settings.vectorcastScriptPath = req.files['vectorcast-upload'][0].path; }
    if (req.files['helix-upload']) { settings.helixScriptPath = req.files['helix-upload'][0].path; }
    if (req.files['codesonar-upload']) { settings.codesonarScriptPath = req.files['codesonar-upload'][0].path; }

    settings = {
        codesonar: !!req.body.codesonar,
        helix: !!req.body.helix,
        vectorcast: !!req.body.vectorcast,
        codesonarPath: req.body['codesonar-path'] || settings.codesonarPath,
        codesonarReportPath: req.body['codesonar-report-path'] || settings.codesonarReportPath,
        helixPath: req.body['helix-path'] || settings.helixPath,
        helixReportPath: req.body['helix-report-path'] || settings.helixReportPath,
        vectorcastPath: req.body['vectorcast-path'] || settings.vectorcastPath,
        vectorcastReportPath: req.body['vectorcast-report-path'] || settings.vectorcastReportPath,
        projects: req.body.projects || settings.projects,
        repoName: req.body.repoName || settings.repoName,
    };

    console.log('Settings:', settings);
    await saveSettings(settings);

    if (settings.repoName) {
        try {
            const repo = await createNewRepository(settings.repoName);
            const localRepoPath = settings.projects[0];
            await commitAndPushToGitHub(localRepoPath, repo.clone_url);

            console.log(`Repository setup complete: ${repo.html_url}`);
        } catch (err) {
            console.error(`Failed to create repository: ${err.message}`);
            return res.status(500).send(`Error: ${err.message}`);
        }
    }
    res.redirect('/settings');
});


app.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const latestReport = findLatestReport();
    const latestHelixReportLink = latestReport ? path.basename(latestReport) : null;

    let helixSummary = null;
    let vectorCASTSummary = null;
    let codesonarSummary = null;

    if (settings.helix && latestReport) {
        try {
            const data = fs.readFileSync(latestReport, 'utf8');
            helixSummary = extractSummary(data);
        } catch (error) { console.error("Error parsing Helix QAC data:", error); }
    }

    if (settings.vectorcast && fs.existsSync(vectorCASTReportPath)) {
        try {
            const data = fs.readFileSync(vectorCASTReportPath, 'utf8');
            vectorCASTSummary = extractVectorCASTSummary(data);
        } catch (error) { console.error("Error parsing VectorCAST data:", error); }
    }

    if (settings.codesonar && fs.existsSync(codesonarOutputFile)) {
        try {
            codesonarSummary = parseCodeSonarOutput(codesonarOutputFile);
        } catch (error) { console.error("Error parsing CodeSonar data:", error); }
    }

    const now = new Date().toLocaleString('ko-KR', {year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'});

    const projects = settings.projects || [];

    res.render('dashboard', {
        helixSummary,
        vectorCASTSummary,
        codesonarSummary,
        latestHelixReportLink,
        vectorCASTReportPath,
        currentTime: now,
        completionTime: pipelineState.completionTime, 
        currentPath: req.path,
        projects 
    });
});


app.get('/settings', async (req, res) => {
    try {
        const settings = await loadSettings();
        res.render('settings', { settings: settings, projects: settings.projects || [], currentPath: req.path });
    } catch (error) {
        console.error('Failed to load settings:', error);
        res.status(500).send('Failed to load settings');
    }
});


app.get('/chart', async (req, res) => {
    try {
        const helixData = await readJsonFile(path.join(__dirname, 'public', 'data', 'helix.json'));
        const codesonarData = await readJsonFile(path.join(__dirname, 'public', 'data', 'codesonar.json'));
        const vectorcastData = await readJsonFile(path.join(__dirname, 'public', 'data', 'vectorcast.json'));

        const logEntries = [];

        const maxEntries = Math.max(helixData.length, codesonarData.length, vectorcastData.length);

        for (let i = 0; i < maxEntries; i++) {
            const helixEntry = helixData[i] || {};
            const codesonarEntry = codesonarData[i] || {};
            const vectorcastEntry = vectorcastData[i] || {};

            const logEntry = {
                timestamp: helixEntry.timestamp || codesonarEntry.lastRunTime || vectorcastEntry.created || 'N/A',
                project: settings.projects[0] || 'Unknown Project',
                helixQAC: helixEntry.rulesWithViolations !== undefined ? helixEntry.rulesWithViolations : 'N/A',
                codesonar: codesonarEntry.activeWarnings !== undefined ? codesonarEntry.activeWarnings : 'N/A',
                vectorcast: vectorcastEntry.passFail !== undefined ? vectorcastEntry.passFail : 'N/A'
            };

            logEntries.push(logEntry);
        }

        console.log("Accumulated Log Entries:", logEntries);

        res.render('chart', { currentPath: req.path, logEntries });
    } catch (error) {
        console.error('Error loading log data:', error);
        res.status(500).send('Failed to load log data');
    }
});



app.get('/helix-summary', (req, res) => { res.json({ helixSummary: pipelineState.helixSummary }); });

app.get('/codesonar-summary', (req, res) => { res.json({ codesonarSummary: pipelineState.codesonarSummary }); });

app.get('/vectorcast-summary', (req, res) => { res.json({ vectorCASTSummary: pipelineState.vectorCASTSummary }); });

app.get('/helix', (req, res) => {
    const latestReport = findLatestReport();
    if (!latestReport) { return res.status(404).send('리포트 생성 중 오류가 발생하였습니다'); }
    res.sendFile(latestReport);
});

app.get('/vectorcast', (req, res) => {
    const vectorCASTReportPath = path.resolve('C:/Environments/test/abc.html');
    if (fs.existsSync(vectorCASTReportPath)) { res.sendFile(vectorCASTReportPath);
    } else { res.status(404).send('리포트 생성 중 오류가 발생하였습니다'); }
});

app.get('/codesonar', passport.authenticate('basic', { session: false }), (req, res) => { res.redirect('http://127.0.0.1:7340/report/last-hub.html?toc_page_level=-1'); });

app.listen(PORT, () => { console.log(`Server is running on http://localhost:${PORT}/`); });