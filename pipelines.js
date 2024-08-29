const fs = require('fs-extra');
const path = require('path');
const simpleGit = require('simple-git');
const util = require('util');
const execPromise = util.promisify(require('child_process').exec);
const codesonarWorkspacePath = "C:/ProgramData/Jenkins/.jenkins/workspace/codesonar";
const helixWorkspacePath = "C:/ProgramData/Jenkins/.jenkins/workspace/helix";
const vectorcastWorkspacePath = "C:/ProgramData/Jenkins/.jenkins/workspace/vc";
const qacStartBatSource = "C:/ProgramData/Jenkins/.jenkins/workspace/qac_start.bat";
const qacStartBatDest = path.join(helixWorkspacePath, 'qac_start.bat');
const repoUrl = `https://${process.env.GITHUB_TOKEN}@github.com/sjparkmds/a.git`;
const envPath = `C:/Users/sejin.park/Downloads/arm-gnu-toolchain-13.2.rel1-mingw-w64-i686-arm-none-eabi/bin;C:/ProgramData/Jenkins/.jenkins/workspace/helix/tools/openocd/bin`;
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });


// Artifact 
async function cloneRepository(repoUrl, workspacePath, pipelineName) {
    const git = simpleGit();
    const gitAskpassPath = "C:/ProgramData/Jenkins/.jenkins/workspace/git-askpass.bat";

    console.log(`[${pipelineName}] Checking if the directory exists at ${workspacePath}`);
    if (fs.existsSync(workspacePath)) {
        console.log(`[${pipelineName}] Cleaning up the existing directory at ${workspacePath}`);
        try {
            await execPromise(`rmdir /s /q "${workspacePath}"`);  // For Windows
            console.log(`[${pipelineName}] Cleanup complete at ${workspacePath}`);
            } catch (err) {
            console.error(`[${pipelineName}] Failed to clean up ${workspacePath} using shell command:`, err);
            throw err;
            }
    } else {
        console.log(`[${pipelineName}] Directory does not exist at ${workspacePath}, skipping cleanup.`);
    }

    console.log(`[${pipelineName}] Creating directory at ${workspacePath}`);
    try {
        fs.mkdirSync(workspacePath, { recursive: true });
    } catch (err) {
        console.error(`[${pipelineName}] Failed to create directory at ${workspacePath}:`, err);
        throw err;
    }

    console.log(`[${pipelineName}] Cloning repository into ${workspacePath}`);
    try {
        await git 
            .env('GIT_TERMINAL_PROMPT', '0')
            .clone(repoUrl, workspacePath, ['--depth', '1']);
        console.log(`[${pipelineName}] Repository cloned successfully into ${workspacePath}.`);
    } catch (err) {
        console.error(`[${pipelineName}] Failed to clone repository:`, err);
        throw err;
    }
}


// pipelines -------------------------------------------------------------------------------------
const pipelineState = { status: 'Idle', progress: { codeSonar: 0, helix: 0, vectorcast: 0 }, completion: {codeSonar : false, helix: false, vectorcast: false}, completionTime: null };

function resetPipelineState() {
    pipelineState.completion.helix = false;
    pipelineState.completion.vectorcast = false;
    pipelineState.completion.codeSonar = false;
}


async function runCodeSonarPipeline() {
    try {
        console.log("Starting CodeSonar pipeline...");
        pipelineState.status = 'Running';
        pipelineState.progress.codeSonar = 0;

        await cloneRepository(repoUrl, codesonarWorkspacePath, 'CodeSonar');
        pipelineState.progress.codeSonar = 10;

        await execPromise(`make -C ${codesonarWorkspacePath} cleanall`);
        pipelineState.progress.codeSonar = 30;
 
        await execPromise(`make -C ${codesonarWorkspacePath}`);
        fs.writeFileSync(path.join(codesonarWorkspacePath, 'codesonar_pwfile'), 'dpaeldptm123!');
        pipelineState.progress.codeSonar = 50;

        await execPromise(`make -C ${codesonarWorkspacePath} cleanall`);
        const codesonarPrjPath = path.join(codesonarWorkspacePath, 'codesonar.prj');
        const codesonarPrjFilesPath = path.join(codesonarWorkspacePath, 'codesonar.prj_files');
        if (fs.existsSync(codesonarPrjPath)) {
            console.log(`Removing ${codesonarPrjPath}`);
            await new Promise((resolve, reject) => {
                rimraf(codesonarPrjPath, { glob: false }, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }

        if (fs.existsSync(codesonarPrjFilesPath)) {
            console.log(`Removing ${codesonarPrjFilesPath}`);
            await new Promise((resolve, reject) => {
                rimraf(codesonarPrjFilesPath, { glob: false }, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }

        await execPromise(`cd C:/ProgramData/Jenkins/.jenkins/workspace/codesonar && codesonar analyze codesonar -foreground 127.0.0.1:7340 -hubuser Administrator -hubpwfile C:/ProgramData/Jenkins/.jenkins/workspace/codesonar/codesonar_pwfile make -C C:/ProgramData/Jenkins/.jenkins/workspace/codesonar > C:/ProgramData/Jenkins/.jenkins/workspace/codesonar/codesonar_output.txt`);
        pipelineState.progress.codeSonar = 100;
        console.log("CodeSonar pipeline completed successfully.");

        pipelineState.completion.codeSonar = true;
        checkAllPipelinesCompletion();
    } catch (error) {
        console.error("CodeSonar pipeline failed:", error);
        pipelineState.status = 'Failed';
        throw error;
    }
}

async function runHelixPipeline() {
    try {
        console.log("Starting Helix QAC pipeline...");
        pipelineState.status = 'Running';
        pipelineState.progress.helix = 0;

        await cloneRepository(repoUrl, helixWorkspacePath, 'Helix QAC');
        pipelineState.progress.helix = 10;

        await execPromise(`make -C ${helixWorkspacePath} cleanall`);
        pipelineState.progress.helix = 30;

        await execPromise(`make -C ${helixWorkspacePath}`);
        pipelineState.progress.helix = 50;

        console.log(`Copying qac_start.bat from ${qacStartBatSource} to ${qacStartBatDest}`);
        await fs.promises.copyFile(qacStartBatSource, qacStartBatDest);
        console.log('qac_start.bat copied successfully.');

        console.log("Executing qac_start.bat...");
        await execPromise(`C:/ProgramData/Jenkins/.jenkins/workspace/helix/qac_start.bat`);
        pipelineState.progress.helix = 100;
        console.log("Helix QAC pipeline completed successfully.");

        pipelineState.completion.helix = true;
        console.log('Helix completion flag set to true.');
        checkAllPipelinesCompletion();
    } catch (error) {
        console.error("Helix QAC pipeline failed:", error);
        pipelineState.status = 'Failed';
        throw error;
    }
}

async function runVectorCastPipeline() {
    try {
        console.log("Starting VectorCAST pipeline...");
        pipelineState.status = 'Running';
        pipelineState.progress.vectorcast = 0;

        await cloneRepository(repoUrl, vectorcastWorkspacePath, 'VectorCAST');
        pipelineState.progress.vectorcast = 30;

        await execPromise(`make -C ${vectorcastWorkspacePath} cleanall`);
        pipelineState.progress.vectorcast = 10;

        await execPromise(`make -C ${vectorcastWorkspacePath}`);
        pipelineState.progress.vectorcast = 30;

        await execPromise(`cd C:/Environments/test && C:/manage.exe -p mds --build-execute`);
        await execPromise(`cd C:/Environments/test && C:/clicast.exe -e TEST Reports Custom full abc.html`);
        pipelineState.progress.vectorcast = 100;
        console.log("VectorCAST pipeline completed successfully.");

        pipelineState.completion.vectorcast = true;
        console.log('VectorCAST completion flag set to true.');
        checkAllPipelinesCompletion();
    } catch (error) {
        console.error("VectorCAST pipeline failed:", error);
        pipelineState.status = 'Failed';
        throw error;
    }
}

async function getPipelineProgress(pipelineName) {
    switch (pipelineName) {
        case 'codesonar': return pipelineState.progress.codeSonar;
        case 'helix': return pipelineState.progress.helix;
        case 'vectorcast': return pipelineState.progress.vectorcast;
        default: return 0;
    }
}

function checkAllPipelinesCompletion() {
    console.log('Checking all pipelines completion...');
    console.log('Helix:', pipelineState.completion.helix);
    console.log('VectorCAST:', pipelineState.completion.vectorcast);
    console.log('CodeSonar:', pipelineState.completion.codeSonar);

    const allCompleted = pipelineState.completion.helix && pipelineState.completion.vectorcast && pipelineState.completion.codeSonar;
    if (allCompleted) { 
        pipelineState.completionTime = new Date();
        console.log('Completion time updated:', pipelineState.completionTime);
    }
}


module.exports = {
    pipelineState,
    runCodeSonarPipeline,
    runHelixPipeline,
    runVectorCastPipeline,
    getPipelineProgress,
    resetPipelineState,
    checkAllPipelinesCompletion
};