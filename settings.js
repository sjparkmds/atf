const simpleGit = require('simple-git');
const path = require('path');
const axios = require('axios');

async function createNewRepository(repoName, description) {
  const githubToken = process.env.GITHUB_TOKEN;
  const url = `https://api.github.com/repos/${githubToken.split(':')[0]}/${repoName}`;

  try {
    // Check if the repository already exists
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
      // Repository doesn't exist, proceed with creation
      return createRepository(repoName, description);
    } else {
      // Some other error occurred
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
    name: repoName,
    description: description,
    private: true
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
        // Initialize the repository if not already initialized
        if (!await git.checkIsRepo()) {
            console.log("Initializing repository...");
            await git.init();
        } else {
            console.log("Repository already initialized.");
        }

        // Add all files to staging
        console.log("Adding files...");
        await git.add('./*');

        // Commit the files
        console.log("Committing files...");
        await git.commit('Initial commit');

        // Check if the remote 'origin' already exists
        const remotes = await git.getRemotes(true);
        const hasOrigin = remotes.some(remote => remote.name === 'origin');

        if (hasOrigin) {
            console.log("Updating existing remote origin...");
            await git.remote(['set-url', 'origin', repoUrl]);
        } else {
            console.log("Setting remote repository...");
            await git.addRemote('origin', repoUrl);
        }

        // Push the changes to the remote repository
        console.log("Pushing to GitHub...");
        await git.push('origin', 'main', { '--set-upstream': true });

        console.log(`Successfully pushed the local repository to ${repoUrl}`);
    } catch (error) {
        console.error("Failed to push to GitHub:", error);
        throw error;
    }
}

module.exports = {
    createNewRepository,
    commitAndPushToGitHub
};
