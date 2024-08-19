const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const passport = require('passport');
const { BasicStrategy } = require('passport-http');
const axios = require('axios');
const cheerio = require('cheerio');
const util = require('util');
const execPromise = util.promisify(require('child_process').exec);
require('dotenv').config();

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
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


// Helix QAC
const reportsDir = "C:\\ProgramData\\Jenkins\\.jenkins\\workspace\\helix\\prqa\\configs\\Initial\\reports";

function findLatestReport() {
    if (!fs.existsSync(reportsDir)) {
        return null;
    }

    const files = fs.readdirSync(reportsDir);
    const reportFiles = files.filter(file => file.startsWith('helix_SCR_') && file.endsWith('.html'));

    if (reportFiles.length === 0) {
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
    const violations = parseInt((html.match(/Total number of rule violations<\/td><td style="text-align:right;">(\d+)<\/td>/) || [])[1] || '0', 10);
    const compliant = parseInt((html.match(/Rules Compliant \((\d+)\)/) || [])[1] || '0', 10);
    const totalLinesOfCode = parseInt((html.match(/Lines of Code \(LOC\)<\/td><td style="text-align:right;">(\d+)<\/td>/) || [])[1] || '0', 10);
    const parserErrors = parseInt((html.match(/Total number of parser errors<\/td><td style="text-align:right;">(\d+)<\/td>/) || [])[1] || '0', 10);
    const rulesWithViolations = parseInt((html.match(/Rules with Violations \((\d+)\)/) || [])[1] || '0', 10);
    const rulesCompliant = compliant;
    const totalRules = compliant + rulesWithViolations;
    const rulesComplianceRatio = (rulesCompliant / totalRules) || 0;
    const violationsRatio = (violations / totalLinesOfCode) || 0;

    const lastAnalysisDateTimeMatch = html.match(/Last analysis date<\/td><td[^>]*>(.*?)<\/td>/);
    let lastAnalysisDateTime = lastAnalysisDateTimeMatch ? lastAnalysisDateTimeMatch[1] : 'N/A';

    if (lastAnalysisDateTime !== 'N/A') {
        const [day, month, year, time] = lastAnalysisDateTime.match(/(\d{2})\s(\w+)\s(\d{4})\sat\s(\d{2}:\d{2}:\d{2})/).slice(1);
        const months = {
            'Jan': '1', 'Feb': '2', 'Mar': '3', 'Apr': '4', 'May': '5', 'Jun': '6',
            'Jul': '7', 'Aug': '8', 'Sep': '9', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        lastAnalysisDateTime = `${year}년 ${months[month]}월 ${day}일 ${time}`;
    }

    const result = { 
        total: totalLinesOfCode, 
        compliant: rulesCompliant, 
        violations, 
        rulesComplianceRatio, 
        violationsRatio, 
        parserErrors,
        rulesWithViolations,
        lastAnalysisDateTime
    };
    saveDataToFile(result, path.join(__dirname, 'public', 'data', 'helix.json'));

    return result;

}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    });
}

// Codesonar
const codesonarOutputFile = "C:/ProgramData/Jenkins/.jenkins/workspace/codesonar/codesonar_output.txt";
const specificWarningsFile = path.join(__dirname, 'public', 'data', 'security_warnings.txt');
const reliabilityFile = path.join(__dirname, 'public', 'data', 'reliability.txt');

function parseCodeSonarOutput(filePath, specificWarningsPath, reliabilityPath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const specificWarnings = fs.readFileSync(specificWarningsPath, 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
    const reliability = fs.readFileSync(reliabilityPath, 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
    const lines = content.split('\n');
    let totalWarnings = 0;
    let specificWarningsCounts = {};
    let reliabilityCounts = {};
    let lastRunTime = '';
    let complexItems = 0;
    const complexityThreshold = 300; // 300ms
    let activeWarnings = 0;
    const unusedValueWarningType = 'Unreachable Call';
    const filePaths = new Set();

    specificWarnings.forEach(warning => {
        specificWarningsCounts[warning] = 0;
    });

    reliability.forEach(warning => {
        reliabilityCounts[warning] = 0;
    });

    lines.forEach(line => {
        if (line.startsWith('  Reporting')) {
            totalWarnings++;
            const filePathMatch = line.match(/at (.*?):\d+/);
            if (filePathMatch) {
                filePaths.add(filePathMatch[1]);
            }

            specificWarnings.forEach(warning => {
                if (line.includes(warning)) {
                    specificWarningsCounts[warning]++;
                }
            });

            reliability.forEach(warning => {
                if (line.includes(warning)) {
                    reliabilityCounts[warning]++;
                }
            });

            if (line.includes(unusedValueWarningType)) {
                activeWarnings++;
            }
        }
        if (line.includes('Time Elapsed')) {
            lastRunTime = line.match(/\[(.*?)\]/)[1];
        }
        if (line.match(/\d+ ms/)) {
            const time = parseInt(line.match(/(\d+) ms/)[1], 10);
            if (time > complexityThreshold) {
                complexItems++;
            }
        }
    });

    lastRunTime = formatDate(lastRunTime);
    activeWarnings = totalWarnings - activeWarnings;
    specificWarningsCounts = Object.fromEntries(
        Object.entries(specificWarningsCounts).filter(([_, count]) => count > 0)
    );
    reliabilityCounts = Object.fromEntries(
        Object.entries(reliabilityCounts).filter(([_, count]) => count > 0)
    );

    const securityBreaches = Object.values(specificWarningsCounts).reduce((acc, count) => acc + count, 0);
    const securityBreachRatio = totalWarnings > 0 ? (securityBreaches / totalWarnings) * 100 : 0;
    const uniqueFilesCount = filePaths.size;

    const result = {
        total: totalWarnings,
        specificWarningsCounts,
        reliabilityCounts,
        lastRunTime,
        complexItems,
        activeWarnings,
        securityBreachRatio,
        uniqueFilesCount
    };

    saveDataToFile(result, path.join(__dirname, 'public', 'data', 'codesonar.json'));

    return result;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    });
}

// VectorCAST
const vectorCASTReportPath = 'C:/Environments/test/abc.html';

function extractTimestampFromVectorCAST(dateStr, timeStr) {
    const [day, month, year] = dateStr.split(' ');
    const [time, period] = timeStr.split(' ');
    let [hour, minute, second] = time.split(':').map(Number);
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    const months = {
        'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
        'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
    };
    const monthIndex = months[month.toUpperCase()];
    return new Date(year, monthIndex, parseInt(day, 10), hour, minute, second);
}

function formatDateForVectorCAST(date) {
    if (isNaN(date.getTime())) {
        return 'Invalid Date';
    }
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
    const statementCoverageMatch = html.match(/<td id="overall-results-statements">(.*?)<\/td>/);
    const statementCoverage = statementCoverageMatch ? statementCoverageMatch[1] : 'Unknown';
    const branchCoverageMatch = html.match(/<td id="overall-results-branches">(.*?)<\/td>/);
    const branchCoverage = branchCoverageMatch ? branchCoverageMatch[1] : 'Unknown';
    const pairsCoverageMatch = html.match(/<td id="overall-results-mcdc-pairs">(.*?)<\/td>/);
    const pairsCoverage = pairsCoverageMatch ? pairsCoverageMatch[1] : 'Unknown';

    const result = {
        created: formattedCreated,
        passFail,
        statementCoverage,
        branchCoverage,
        pairsCoverage
    };

    // Save the result to a JSON file
    saveDataToFile(result, path.join(__dirname, 'public', 'data', 'vectorcast.json'));

    return result;
}


// Git
/*const githubToken = process.env.GITHUB_TOKEN;
const owner = 'sjparkmds'; 
const repo = 'a';

async function getTotalCommits(owner, repo) {
    try {
        const headers = {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Cache-Control': 'no-cache'
        };

        let page = 1;
        let commits = [];
        let moreCommits = true;

        while (moreCommits) {
            const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits`, {
                headers,
                params: { per_page: 100, page }
            });

            if (response.data.length > 0) {
                commits = commits.concat(response.data);
                page++;
            } else {
                moreCommits = false;
            }
        }

        return commits.length;
    } catch (error) {
        console.error('Error fetching total commits:', error);
        return 0;
    }
}

async function getGitHubRepoStats() {
    try {
        const headers = {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Cache-Control': 'no-cache'
        };

        const commits = await getTotalCommits(owner, repo);

        const repoResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, { headers });
        const languagesResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers });

        const latestCommit = repoResponse.data.pushed_at;
        const latestCommitAuthor = repoResponse.data.owner.login;

        const numberOfFiles = repoResponse.data.size;
        const languages = languagesResponse.data;
        const totalLines = Object.values(languages).reduce((acc, lines) => acc + lines, 0);

        const result = { commits, latestCommitDate: formatGitHubTimestamp(latestCommit), latestCommitAuthor, numberOfFiles, languages, totalLines };
        saveDataToFile(result, path.join(__dirname, 'public', 'data', 'git.json'));

        return result;
    } catch (error) {
        console.error('Error fetching GitHub statistics:', error);
        return { commits: 0, latestCommitDate: 'N/A', latestCommitAuthor: 'N/A', numberOfFiles: 'N/A', languages: {}, totalLines: 0 };
    }
}

function formatGitHubTimestamp(utcTimestamp) {
    let [date, time] = utcTimestamp.split('T');
    time = time.replace('Z', '');

    const utcDate = new Date(`${date}T${time}Z`);
    const localTime = new Date(utcDate.getTime());
    const localDate = localTime.toISOString().split('T')[0];
    const localClock = localTime.toTimeString().split(' ')[0];

    return `${localDate} ${localClock}`;
}
// ---------------------------------------------------------------------------
*/

// Settings
const settingsFilePath = path.join(__dirname, 'settings.json');

function loadSettings() {
    if (fs.existsSync(settingsFilePath)) {
        const data = fs.readFileSync(settingsFilePath, 'utf8');
        const settings = JSON.parse(data);
        console.log('Loaded settings from file:', settings);  // Add this line
        return settings;
    }
    console.log('Settings file not found, using defaults');  // Add this line
    return { codesonar: true, helix: true, vectorcast: true };
}


let settings = loadSettings();

function saveSettings(settings) {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
    console.log('Settings saved:', settings);
}


app.post('/settings', (req, res) => {
    console.log('POST /settings called');
    settings = {
        codesonar: req.body.codesonar === 'on',
        helix: req.body.helix === 'on',
        vectorcast: req.body.vectorcast === 'on',
    };
    console.log('Settings:', settings); // Debugging line
    saveSettings(settings);
    res.redirect('/');
});

function saveDataToFile(newData, filePath) {
    let existingData = [];

    if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf8');
        try {
            existingData = JSON.parse(fileData);

            if (!Array.isArray(existingData)) {
                existingData = []; 
            }
        } catch (error) {
            console.error("Error parsing existing JSON data:", error);
            existingData = []; 
        }
    }

    existingData.push(newData);

    try {
        fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf8');
    } catch (error) {
        console.error(`Error saving data to ${filePath}:`, error);
    }
}

// app.js
const { pipelineState, runCodeSonarPipeline, runHelixPipeline, runVectorCastPipeline, getPipelineProgress, checkAllPipelinesCompletion } = require('./pipelines');

// CodeSonar Pipeline
app.post('/run-codesonar-pipeline', (req, res) => {
    try {
        res.status(200).send('CodeSonar pipeline triggered.');
        runCodeSonarPipeline().catch(err => {
            console.error('CodeSonar pipeline encountered an error:', err);
        });
    } catch (error) {
        console.error('Error triggering CodeSonar pipeline:', error);
        res.status(500).send('Failed to trigger CodeSonar pipeline.');
    }
});

// Helix QAC Pipeline
app.post('/run-helix-pipeline', (req, res) => {
    try {
        res.status(200).send('Helix QAC pipeline triggered.');
        runHelixPipeline().catch(err => {
            console.error('Helix QAC pipeline encountered an error:', err);
        });
    } catch (error) {
        console.error('Error triggering Helix QAC pipeline:', error);
        res.status(500).send('Failed to trigger Helix QAC pipeline.');
    }
});

// VectorCAST Pipeline
app.post('/run-vectorcast-pipeline', (req, res) => {
    try {
        res.status(200).send('VectorCAST pipeline triggered.');
        runVectorCastPipeline().catch(err => {
            console.error('VectorCAST pipeline encountered an error:', err);
        });
    } catch (error) {
        console.error('Error triggering VectorCAST pipeline:', error);
        res.status(500).send('Failed to trigger VectorCAST pipeline.');
    }
});


// Progress
app.post('/start-pipelines', async (req, res) => {
    try {
        await Promise.all([
            runCodeSonarPipeline(),
            runHelixPipeline(),
            runVectorCastPipeline()
        ]);
        res.json({ status: 'Pipelines started successfully' });
    } catch (error) {
        console.error('Error starting pipelines:', error);
        res.status(500).json({ error: 'Failed to start pipelines' });
    }
});

app.post('/end-pipelines', async (req, res) => {
    try {
        await checkAllPipelinesCompletion();
        res.status(200).send('Pipelines complete successfully.');
    } catch (error) {
        console.error('Error triggering pipelines complete:', error);
        res.status(500).send('Failed to complete pipelines.');
    }
});

app.get('/pipeline-status', (req, res) => {
    res.json({ status: pipelineState.status });
});

app.get('/pipeline-progress', (req, res) => {
    const globalPipelineProgress = Math.round(
        (pipelineState.progress.codeSonar + pipelineState.progress.helix + pipelineState.progress.vectorcast) / 3
    );
    res.json({ progress: globalPipelineProgress });
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

app.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const latestReport = findLatestReport();
    const latestHelixReportLink = latestReport ? path.basename(latestReport) : null;
  //  let gitStats = await getGitHubRepoStats();

    let helixSummary = null;
    let vectorCASTSummary = null;
    let codesonarSummary = null;
    let previousHelixSummary = null;
    let previousVectorCASTSummary = null;
    let previousCodeSonarSummary = null;

    if (settings.helix && latestReport) {
        try {
            const data = fs.readFileSync(latestReport, 'utf8');
            helixSummary = extractSummary(data);
            previousHelixSummary = loadPreviousSummary('helix.json');
        } catch (error) {
            console.error("Error parsing Helix QAC data:", error);
        }
    }

    if (settings.vectorcast && fs.existsSync(vectorCASTReportPath)) {
        try {
            const data = fs.readFileSync(vectorCASTReportPath, 'utf8');
            vectorCASTSummary = extractVectorCASTSummary(data);
            previousVectorCASTSummary = loadPreviousSummary('vectorcast.json');
        } catch (error) {
            console.error("Error parsing VectorCAST data:", error);
        }
    }

    if (settings.codesonar && fs.existsSync(codesonarOutputFile)) {
        try {
            codesonarSummary = parseCodeSonarOutput(codesonarOutputFile, specificWarningsFile, reliabilityFile);
            previousCodeSonarSummary = loadPreviousSummary('codesonar.json');
        } catch (error) {
            console.error("Error parsing CodeSonar data:", error);
        }
    }

    const codesonarRate = calculateRate(codesonarSummary?.activeWarnings, previousCodeSonarSummary?.activeWarnings);
    const vectorCASTRate = calculateRate(vectorCASTSummary?.passFail, previousVectorCASTSummary?.passFail);
    const helixRate = calculateRate(helixSummary?.rulesWithViolations, previousHelixSummary?.rulesWithViolations);

    const now = new Date().toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    });
    res.render('dashboard', {
        helixSummary,
        vectorCASTSummary,
        codesonarSummary,
        latestHelixReportLink,
        vectorCASTReportPath,
    //    gitStats,
        currentTime: now,
        completionTime: pipelineState.completionTime, 
        currentPath: req.path,
        codesonarRate,
        vectorCASTRate,
        helixRate
    });
});

function calculateRate(current, previous) {
    if (previous === undefined || current === undefined || previous === 0) {
        return 0;
    }
    return ((current - previous) / previous) * 100;
}

function loadPreviousSummary(filename) {
    const filePath = path.join(__dirname, 'data', filename);
    if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileData);
    }
    return null;
}

app.get('/helix-summary', (req, res) => {
    res.json({ 
        helixSummary: pipelineState.helixSummary, 
        helixRate: pipelineState.helixRate 
    });
});

app.get('/codesonar-summary', (req, res) => {
    res.json({ 
        codesonarSummary: pipelineState.codesonarSummary, 
        codesonarRate: pipelineState.codesonarRate 
    });
});

app.get('/vectorcast-summary', (req, res) => {
    res.json({ 
        vectorCASTSummary: pipelineState.vectorCASTSummary, 
        vectorCASTRate: pipelineState.vectorCASTRate 
    });
});

/*app.get('/git-stats', async (req, res) => {
    try {
        let gitStats = await getGitHubRepoStats();
        res.json(gitStats);
    } catch (error) {
        console.error('Error fetching GitHub stats:', error);
        res.status(500).json({ error: 'Failed to fetch GitHub stats' });
    }
});
*/
app.get('/report', (req, res) => {
    const latestReport = findLatestReport();
    if (!latestReport) {
        return res.status(404).send('리포트 생성 중 오류가 발생하였습니다');
    }
    res.sendFile(latestReport);
});

app.get('/codesonar', passport.authenticate('basic', { session: false }), (req, res) => {
    res.redirect('http://127.0.0.1:7340/report/last-hub.html?toc_page_level=-1');
  });

  app.get('/vectorcast', (req, res) => {
    const vectorCASTReportPath = path.resolve('C:/Environments/test/abc.html');
    if (fs.existsSync(vectorCASTReportPath)) {
        res.sendFile(vectorCASTReportPath);
    } else {
        res.status(404).send('리포트 생성 중 오류가 발생하였습니다');
    }
});


// menus
app.get('/chart', (req, res) => {
    res.render('chart', { currentPath: req.path });
});

app.get('/settings', (req, res) => {
    res.render('settings', { currentPath: req.path, settings: settings });
});



// server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}/`);
});