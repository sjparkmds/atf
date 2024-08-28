const simpleGit = require('simple-git');
const path = require('path');
const axios = require('axios');

// Function to create a new GitHub repository (from earlier)
async function createNewRepository(repoName, description) {
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

    console.log("Setting remote repository...");
    await git.addRemote('origin', repoUrl);

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
