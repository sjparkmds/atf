const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const passport = require('passport');
const { BasicStrategy } = require('passport-http');
const {
    loadSettings,
    saveSettings,
    createNewRepository,
    commitAndPushToGitHub,
    readJsonFile
} = require('./settings');
const {
    pipelineState,
    initializePipelines,
    runAllPipelines,
    resetPipelineState,
    checkAllPipelinesCompletion,
    getPipelineProgress
} = require('./pipelines');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new BasicStrategy(
    function(username, password, done) {
        if (username === 'Administrator' && password === 'dpaeldptm123!') {
            return done(null, { username: 'Administrator' });
        } else {
            return done(null, false);
        }
    }
));

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric' });
}

let settings;

function safeReadFileSync(filePath, encoding) {
    if (fs.existsSync(filePath)) {
        if (fs.statSync(filePath).isDirectory()) {
            throw new Error(`EISDIR: Path is a directory, not a file: ${filePath}`);
        }
        return fs.readFileSync(filePath, encoding);
    } else {
        throw new Error(`ENOENT: No such file or directory: ${filePath}`);
    }
}

function findLatestFileInDirectory(directory, filePattern) {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
        throw new Error(`Invalid directory: ${directory}`);
    }

    const files = fs.readdirSync(directory).filter(file => filePattern.test(file));
    if (files.length === 0) {
        throw new Error(`No files found matching pattern ${filePattern} in directory: ${directory}`);
    }

    files.sort((a, b) => {
        return fs.statSync(path.join(directory, b)).mtime.getTime() - fs.statSync(path.join(directory, a)).mtime.getTime();
    });

    return path.join(directory, files[0]);
}

// The async IIFE (Immediately Invoked Function Expression)
(async () => {
    try {
        settings = await loadSettings(); // Load settings
        console.log('Settings loaded:', JSON.stringify(settings, null, 2));

        await initializePipelines(settings); // Initialize pipelines
        console.log('Pipeline state after initialization:', JSON.stringify(pipelineState, null, 2));

        app.get('/', async (req, res) => {
            try {
                const project = settings.projects[0];
                const repoName = project.repoName;
                console.log('Current pipelineState before accessing repoName:', JSON.stringify(pipelineState, null, 2));
                console.log(`Accessing pipeline state for repoName: ${repoName}`);

                if (!pipelineState[repoName]) {
                    console.error(`Pipeline state not found for repoName: ${repoName}`);
                    return res.status(500).send('Pipeline state not found for the specified repoName.');
                }

                let helixSummary = null;
                let vectorCASTSummary = null;
                let codesonarSummary = null;

                // Process Helix QAC
                if (settings.helix) {
                    const latestReport = findLatestFileInDirectory(project.helixReportPath, /helix_SCR_\d{8}_\d{6}\.html$/);
                    const data = safeReadFileSync(latestReport, 'utf8');
                    helixSummary = extractSummary(data);
                }

                // Process VectorCAST
                if (settings.vectorcast) {
                    const vectorcastFile = findLatestFileInDirectory(project.vectorcastReportPath, /\.html$/);
                    const data = safeReadFileSync(vectorcastFile, 'utf8');
                    vectorCASTSummary = extractVectorCASTSummary(data);
                }

                // Process CodeSonar
                if (settings.codesonar) {
                    const codesonarOutputFile = path.join(project.codesonarReportPath, 'codesonar_output.txt');
                    const data = safeReadFileSync(codesonarOutputFile, 'utf8');
                    codesonarSummary = parseCodeSonarOutput(data);
                }

                const now = new Date().toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric',
                    second: 'numeric'
                });

                const projects = settings.projects || [];

                const completionTime = pipelineState[repoName].completionTime 
                    ? pipelineState[repoName].completionTime.toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric',
                        second: 'numeric'
                    })
                    : null;

                res.render('home', {
                    helixSummary,
                    vectorCASTSummary,
                    codesonarSummary,
                    currentTime: now,
                    completionTime,
                    currentPath: req.path,
                    projects
                });
            } catch (error) {
                console.error(`Error in processing request: ${error.message}`);
                res.status(500).send('Internal Server Error');
            }
        });

        console.log('Pipeline state before server start:', JSON.stringify(pipelineState, null, 2));

        // Start server
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
            console.log('Pipeline state after server start:', JSON.stringify(pipelineState, null, 2));
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
})();


function getReportPathForProject(repoName, reportType) {
    if (!repoName || !reportType) {
        console.error('Invalid repoName or reportType:', { repoName, reportType });
        throw new TypeError('Invalid repoName or reportType');
    }

    const reportDirMap = {
        'helix': path.join(repoName, 'prqa', 'configs', 'Initial', 'reports'),
        'codesonar': path.join(repoName, 'codesonar_output.txt'),
        'vectorcast': path.join('C:/Environments/test', 'abc.html')
    };

    const reportPath = reportDirMap[reportType];
    if (!reportPath) {
        console.error('Unknown report type:', reportType);
        throw new TypeError('Unknown report type');
    }

    if (!fs.existsSync(reportPath)) {
        throw new Error(`Report path does not exist: ${reportPath}`);
    }

    if (fs.statSync(reportPath).isDirectory()) {
        throw new Error(`Report path is a directory, not a file: ${reportPath}`);
    }

    return reportPath;
}


// Helix QAC
function findLatestReport(repoName) {
    if (!repoName) {
        console.error('Received undefined repoName in findLatestReport');
        return null;
    }

    // Find the project associated with the repoName
    const project = settings.projects.find(p => p.repoName === repoName);

    if (!project || !project.helixPath) {
        console.error('Helix path is not defined for the specified repoName:', repoName);
        return null;
    }

    const reportsDir = path.join(project.helixPath, 'prqa', 'configs', 'Initial', 'reports');
    if (!fs.existsSync(reportsDir)) {
        console.error('Reports directory does not exist:', reportsDir);
        return null;
    }

    const files = fs.readdirSync(reportsDir);
    const reportFiles = files.filter(file => file.startsWith('helix_SCR_') && file.endsWith('.html'));

    if (reportFiles.length === 0) {
        console.log('No Helix report files found in:', reportsDir);
        return null;
    }

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
// -----------------------------------------------------------------------------

// Codesonar
function parseCodeSonarOutput(data) {
    const lines = data.split('\n');
    let totalWarnings = 0;
    let lastRunTime = '';

    lines.forEach(line => {
        if (line.includes('WARNING')) {
            totalWarnings++;
        }
        if (line.includes('Time Elapsed')) {
            const match = line.match(/\[(.*?)\]/);
            if (match) {
                lastRunTime = match[1];
            }
        }
    });

    const result = {
        totalWarnings,
        lastRunTime: formatDate(lastRunTime)
    };

    saveDataToFile(result, path.join(__dirname, 'public', 'data', 'codesonar.json'));
    return result;
}


// -------------------------------------------------------------------------------------------

// VectorCAST

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
function saveDataToFile(data, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ------------------------------------------------------------------------------------



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
        // Optionally re-initialize pipelineState here if you really need it.
        // await initializePipelines(settings); 

        await runAllPipelines();  // Start pipelines
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

app.get('/pipeline-status', (req, res) => {
    res.json({ status: pipelineState.status });
});

app.get('/pipeline-progress', (req, res) => {
    const repoName = req.query.repoName;

    // Check if pipelineState exists and has the required structure
    if (pipelineState[repoName] && pipelineState[repoName].progress && pipelineState[repoName].progress.codeSonar !== undefined) {
        const globalPipelineProgress = Math.round((pipelineState[repoName].progress.codeSonar + pipelineState[repoName].progress.helix + pipelineState[repoName].progress.vectorcast) / 3);
        res.json({ progress: globalPipelineProgress });
    } else {
        res.status(500).json({ error: 'Pipeline progress data is not available.' });
    }
});

app.get('/specific-pipeline-progress/:pipeline', async (req, res) => {
    const pipelineName = req.params.pipeline;
    const progress = await getPipelineProgress(pipelineName);
    res.json({ progress });
});

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

app.get('/settings', async (req, res) => {
    try {
        const settings = await loadSettings();
        res.render('settings', { 
            settings, 
            currentPath: req.path // Pass the current path to the template
        });
    } catch (error) {
        console.error('Failed to load settings:', error);
        res.status(500).send('Failed to load settings');
    }
});

app.post('/settings', async (req, res) => {
    const projects = req.body.repoNames.map((repoName, index) => {
        return {
            repoName: repoName,
            workspacePath: req.body.workspacePaths[index],
            codesonarPath: req.body.codesonarPaths[index],
            codesonarReportPath: req.body.codesonarReportPaths[index],
            helixPath: req.body.helixPaths[index],
            helixReportPath: req.body.helixReportPaths[index],
            vectorcastPath: req.body.vectorcastPaths[index],
            vectorcastReportPath: req.body.vectorcastReportPaths[index]
        };
    });

    settings = {
        codesonar: !!req.body.codesonar,
        helix: !!req.body.helix,
        vectorcast: !!req.body.vectorcast,
        projects: projects
    };

    await saveSettings(settings);
    res.redirect('/settings');
});


app.get('/get-report', (req, res) => {
    try {
        const repoName = req.query.repoName;  // e.g., 'project1'
        const reportType = req.query.reportType;  // e.g., 'helix', 'codesonar', 'vectorcast'

        const reportPath = getReportPathForProject(repoName, reportType);

        if (!fs.existsSync(reportPath)) {
            return res.status(404).send('Report not found');
        }

        res.sendFile(reportPath);
    } catch (error) {
        console.error('Error fetching report:', error);
        res.status(500).send('Failed to fetch report');
    }
});



app.get('/logs', async (req, res) => {
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
                project: settings.projects[0].repoName || 'Unknown Project',
                helixQAC: helixEntry.rulesWithViolations !== undefined ? helixEntry.rulesWithViolations : 'N/A',
                codesonar: codesonarEntry.totalWarnings !== undefined ? codesonarEntry.totalWarnings : 'N/A',
                vectorcast: vectorcastEntry.passFail !== undefined ? vectorcastEntry.passFail : 'N/A'
            };

            logEntries.push(logEntry);
        }

        console.log("Accumulated Log Entries:", logEntries);

        res.render('logs', { currentPath: req.path, logEntries });
    } catch (error) {
        console.error('Error loading log data:', error);
        res.status(500).send('Failed to load log data');
    }
});

app.get('/helix-summary', (req, res) => {
    const repoName = settings.projects[0].repoName;
    const latestReport = findLatestReport(repoName);

    if (!latestReport) {
        return res.status(404).send('Helix report not found');
    }

    try {
        const reportData = fs.readFileSync(latestReport, 'utf8');
        const summary = extractSummary(reportData);
        res.json({ helixSummary: summary });
    } catch (error) {
        console.error('Error reading Helix report:', error);
        res.status(500).send('Error reading Helix report');
    }
});


app.get('/helix', (req, res) => {
    const project = settings.projects[0]; // Example: Select the first project
    const helixReportPath = project.helixReportPath;
    if (!fs.existsSync(helixReportPath)) {
        return res.status(404).send('Report not found');
    }
    res.sendFile(helixReportPath);
});

app.get('/vectorcast-summary', (req, res) => {
    res.json({ vectorCASTSummary: pipelineState.vectorCASTSummary });
});

app.get('/vectorcast', (req, res) => {
    const project = settings.projects[0]; // Example: Select the first project
    const vectorCASTReportPath = project.vectorcastReportPath;
    if (fs.existsSync(vectorCASTReportPath)) {
        res.sendFile(vectorCASTReportPath);
    } else {
        res.status(404).send('리포트 생성 중 오류가 발생하였습니다');
    }
});

app.get('/codesonar-summary', (req, res) => {
    const repoName = settings.projects[0].repoName; 
    const codesonarSummary = parseCodeSonarOutput(repoName);
    
    if (codesonarSummary) {
        res.json({ codesonarSummary });
    } else {
        res.status(404).send('CodeSonar report not found');
    }
});


app.get('/codesonar', passport.authenticate('basic', { session: false }), (req, res) => {
    res.redirect('http://127.0.0.1:7340/report/last-hub.html?toc_page_level=-1');
});

/*
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}/`);
});*/