const fs = require('fs-extra');
const path = require('path');
const simpleGit = require('simple-git');
const util = require('util');
const execPromise = util.promisify(require('child_process').exec);

//const codesonarWorkspacePath = "C:/ProgramData/Jenkins/.jenkins/workspace/codesonar";
//const helixWorkspacePath = "C:/ProgramData/Jenkins/.jenkins/workspace/helix";
//const vectorcastWorkspacePath = "C:/ProgramData/Jenkins/.jenkins/workspace/vc";
//const qacStartBatSource = "C:/ProgramData/Jenkins/.jenkins/workspace/qac_start.bat";
//const qacStartBatDest = path.join(helixWorkspacePath, 'qac_start.bat');
const repoUrl = `https://${process.env.GITHUB_TOKEN}@github.com/sjparkmds/a.git`;
//const envPath = `C:/Users/sejin.park/Downloads/arm-gnu-toolchain-13.2.rel1-mingw-w64-i686-arm-none-eabi/bin;C:/ProgramData/Jenkins/.jenkins/workspace/helix/tools/openocd/bin`;

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });


// Artifact 
let pipelineState = {};  // Declare and initialize pipelineState here

// Assuming pipelineState is declared globally and initialized as an empty object
async function initializePipelines(settings) {
    console.log('Initializing pipelines with settings:', JSON.stringify(settings, null, 2)); // Log settings

    settings.projects.forEach((project, index) => {
        const { repoName, codesonarPath, helixPath, vectorcastPath } = project;
        console.log(`Processing project #${index}:`, JSON.stringify(project, null, 2)); // Log each project

        // Populate pipelineState without reassigning it
        pipelineState[repoName] = {
            status: 'Idle',
            progress: { codeSonar: 0, helix: 0, vectorcast: 0 },
            completion: { codeSonar: false, helix: false, vectorcast: false },
            completionTime: null,
            completionTimes: { codeSonar: null, helix: null, vectorcast: null },
            paths: {
                codesonar: codesonarPath,
                helix: helixPath,
                vectorcast: vectorcastPath
            }
        };

        console.log(`Pipeline state for ${repoName} initialized:`, JSON.stringify(pipelineState[repoName], null, 2));
    });

    console.log('Final pipelineState after initialization:', JSON.stringify(pipelineState, null, 2));  // Debugging log
}



async function cloneRepository(repoUrl, workspacePath, pipelineName) {
    const git = simpleGit();
    console.log(`[${pipelineName}] Checking if the directory exists at ${workspacePath}`);
    
    if (fs.existsSync(workspacePath)) {
        console.log(`[${pipelineName}] Cleaning up the existing directory at ${workspacePath}`);
        try {
            await execPromise(`rmdir /s /q "${workspacePath}"`);
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
        await git.env('GIT_TERMINAL_PROMPT', '0').clone(repoUrl, workspacePath, ['--depth', '1']);
        console.log(`[${pipelineName}] Repository cloned successfully into ${workspacePath}.`);
    } catch (err) {
        console.error(`[${pipelineName}] Failed to clone repository:`, err);
        throw err;
    }
}

function resetPipelineState(repoName) {
    const project = pipelineState[repoName];
    project.status = 'Idle';
    project.progress = { codeSonar: 0, helix: 0, vectorcast: 0 };
    project.completion = { codeSonar: false, helix: false, vectorcast: false };
    project.completionTime = null;
    project.completionTimes = { codeSonar: null, helix: null, vectorcast: null };
}

function checkAllPipelinesCompletion(repoName) {
    const project = pipelineState[repoName];
    console.log(`[${repoName}] Checking all pipelines completion...`);

    const allCompleted = project.completion.helix && project.completion.vectorcast && project.completion.codeSonar;
    if (allCompleted) {
        const latestCompletionTime = new Date(Math.max(
            project.completionTimes.helix?.getTime() || 0,
            project.completionTimes.vectorcast?.getTime() || 0,
            project.completionTimes.codeSonar?.getTime() || 0
        ));
        project.completionTime = latestCompletionTime;
        console.log(`[${repoName}] Completion time updated:`, project.completionTime);
    }
}

async function runCodeSonarPipeline(project) {
    try {
        console.log(`[${project.repoName}] Starting CodeSonar pipeline...`);
        project.status = 'Running';
        project.progress.codeSonar = 0;

        await cloneRepository(project.repoUrl, project.paths.codesonar, 'CodeSonar');
        project.progress.codeSonar = 10;

        await execPromise(`make -C ${project.paths.codesonar} cleanall`);
        project.progress.codeSonar = 30;

        await execPromise(`make -C ${project.paths.codesonar}`);
        project.progress.codeSonar = 50;

        const pwFilePath = path.join(project.paths.codesonar, 'codesonar_pwfile');
        fs.writeFileSync(pwFilePath, 'dpaeldptm123!');

        await execPromise(`make -C ${project.paths.codesonar} cleanall`);
        const codesonarPrjPath = path.join(project.paths.codesonar, 'codesonar.prj');
        const codesonarPrjFilesPath = path.join(project.paths.codesonar, 'codesonar.prj_files');
        if (fs.existsSync(codesonarPrjPath)) {
            console.log(`[${project.repoName}] Removing ${codesonarPrjPath}`);
            await fs.rm(codesonarPrjPath);
        }

        if (fs.existsSync(codesonarPrjFilesPath)) {
            console.log(`[${project.repoName}] Removing ${codesonarPrjFilesPath}`);
            await fs.rm(codesonarPrjFilesPath);
        }

        await execPromise(`cd ${project.paths.codesonar} && codesonar analyze codesonar -foreground 127.0.0.1:7340 -hubuser Administrator -hubpwfile ${pwFilePath} make -C ${project.paths.codesonar} > ${project.paths.codesonar}/codesonar_output.txt`);
        project.progress.codeSonar = 100;
        console.log(`[${project.repoName}] CodeSonar pipeline completed successfully.`);

        project.completion.codeSonar = true;
        project.completionTimes.codeSonar = new Date();
        checkAllPipelinesCompletion(repoName);
    } catch (error) {
        console.error(`[${project.repoName}] CodeSonar pipeline failed:`, error);
        project.status = 'Failed';
        throw error;
    }
}


async function runHelixPipeline(project) {
    try {
        console.log(`[${project.repoName}] Starting Helix QAC pipeline...`);
        project.status = 'Running';
        project.progress.helix = 0;

        await cloneRepository(repoUrl, project.paths.helix, 'Helix QAC');
        project.progress.helix = 10;

        await execPromise(`make -C ${project.paths.helix} cleanall`);
        project.progress.helix = 30;

        // Copy qac_start.bat to the workspace directory
        const qacStartBatSource = path.resolve(__dirname, 'C:/ProgramData/Jenkins/.jenkins/workspace/qac_start.bat');
        const qacStartBatDest = path.join(project.paths.helix, 'qac_start.bat');
        console.log(`[${project.repoName}] Copying qac_start.bat from ${qacStartBatSource} to ${qacStartBatDest}`);
        await fs.copyFile(qacStartBatSource, qacStartBatDest);
        console.log(`[${project.repoName}] qac_start.bat copied successfully.`);

        await execPromise(`make -C ${project.paths.helix}`);
        project.progress.helix = 50;

        console.log(`[${project.repoName}] Executing qac_start.bat...`);
        await execPromise(`${qacStartBatDest}`);
        project.progress.helix = 100;
        console.log(`[${project.repoName}] Helix QAC pipeline completed successfully.`);

        project.completion.helix = true;
        project.completionTimes.helix = new Date(); 
        checkAllPipelinesCompletion(project.repoName);
    } catch (error) {
        console.error(`[${project.repoName}] Helix QAC pipeline failed:`, error);
        project.status = 'Failed';
        throw error;
    }
}

async function runVectorCastPipeline(project) {
    try {
        console.log(`[${project.repoName}] Starting VectorCAST pipeline...`);
        project.status = 'Running';
        project.progress.vectorcast = 0;

        await cloneRepository(repoUrl, project.paths.vectorcast, 'VectorCAST');
        project.progress.vectorcast = 10;

        await execPromise(`make -C ${project.paths.vectorcast} cleanall`);
        project.progress.vectorcast = 30;

        await execPromise(`make -C ${project.paths.vectorcast}`);
        project.progress.vectorcast = 50;

        await execPromise(`cd C:/Environments/test && C:/manage.exe -p mds --build-execute`);
        await execPromise(`cd C:/Environments/test && C:/clicast.exe -e TEST Reports Custom full abc.html`);
        project.progress.vectorcast = 100;
        console.log(`[${project.repoName}] VectorCAST pipeline completed successfully.`);

        project.completion.vectorcast = true;
        project.completionTimes.vectorcast = new Date(); 
        checkAllPipelinesCompletion(project.repoName);
    } catch (error) {
        console.error(`[${project.repoName}] VectorCAST pipeline failed:`, error);
        project.status = 'Failed';
        throw error;
    }
}

async function runAllPipelines() {
    for (const project of settings.projects) {
        await runCodeSonarPipeline(project);
        await runHelixPipeline(project);
        await runVectorCastPipeline(project);
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

module.exports = {
    pipelineState,
    initializePipelines,
    runAllPipelines,
    resetPipelineState,
    checkAllPipelinesCompletion,
    getPipelineProgress

};