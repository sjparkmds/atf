const simpleGit = require('simple-git');
const path = require('path');
const axios = require('axios');
const fs = require('fs').promises;

/*
async function createNewRepository(repoName, description) {
  const githubToken = process.env.GITHUB_TOKEN;
  const url = `https://api.github.com/repos/${githubToken.split(':')[0]}/${repoName}`;

  try {
    await axios.get(url, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    console.log(`Repository ${repoName} already exists.`);
    throw new Error(`Repository ${repoName} already exists.`);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return createRepository(repoName, description);
    } else {
      console.error('Error checking repository existence:', error.message);
      throw error;
    }
  }
}

async function createRepository(repoName, description) {
  const githubToken = process.env.GITHUB_TOKEN;
  const url = 'https://api.github.com/user/repos';

  const config = {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json'
    }
  };

  const data = {
    name: repoName, private: true
  };

  try {
    const response = await axios.post(url, data, config);
    console.log(`Repository created successfully at ${response.data.html_url}`);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Error response from GitHub:', error.response.data);
    }
    console.error(`Failed to create repository: ${error.message}`);
    throw error;
  }
}


async function commitAndPushToGitHub(localRepoPath, repoUrl) {
    const git = simpleGit(localRepoPath);

    try {
        if (!await git.checkIsRepo()) {
            console.log("Initializing repository...");
            await git.init();
        } else {
            console.log("Repository already initialized.");
        }
        console.log("Adding files...");
        await git.add('./*');

        console.log("Committing files...");
        await git.commit('Initial commit');

        const remotes = await git.getRemotes(true);
        const hasOrigin = remotes.some(remote => remote.name === 'origin');

        if (hasOrigin) {
            console.log("Updating existing remote origin...");
            await git.remote(['set-url', 'origin', repoUrl]);
        } else {
            console.log("Setting remote repository...");
            await git.addRemote('origin', repoUrl);
        }

        console.log("Pushing to GitHub...");
        await git.push('origin', 'main', { '--set-upstream': true });

        console.log(`Successfully pushed the local repository to ${repoUrl}`);
    } catch (error) {
        console.error("Failed to push to GitHub:", error);
        throw error;
    }
}
*/

async function loadSettings() {
  const settingsFilePath = path.join(__dirname, 'settings.json');
  try {
      const data = await fs.readFile(settingsFilePath, 'utf8');
      const settings = JSON.parse(data);

      settings.projects.forEach(project => {
          project.repoName = project.repoName || 'defaultRepoName';
          project.workspacePath = project.workspacePath || '';
          project.codesonarPath = project.codesonarPath || '';
          project.codesonarReportPath = project.codesonarReportPath || '';
          project.helixPath = project.helixPath || '';
          project.helixReportPath = project.helixReportPath || '';
          project.vectorcastPath = project.vectorcastPath || '';
          project.vectorcastReportPath = project.vectorcastReportPath || '';
      });

      return settings;
  } catch (error) {
      console.error('Error loading settings:', error.message);
      throw error;
  }
}


async function saveSettings(settings) {
  const settingsFilePath = path.join(__dirname, 'settings.json');
  console.log('Saving settings:', settings);
  try {
      await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2));
      console.log('Settings saved:', settings);
  } catch (error) {
      console.error('Failed to save settings:', error.message);
      throw error;
  }
}


async function readJsonFile(filePath) {
  try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
  } catch (error) {
      if (error.code !== 'ENOENT') {
          console.error(`Error parsing JSON data from ${filePath}:`, error.message);
      }
      return [];
  }
}

module.exports = {
  loadSettings,
  saveSettings,
  readJsonFile,
//  createNewRepository,
 // commitAndPushToGitHub
};
