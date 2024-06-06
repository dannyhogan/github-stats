// github-stats.js
const axios = require('axios');
const dotenv = require('dotenv');
const Table = require('cli-table3');

dotenv.config();

const token = process.env.GITHUB_TOKEN;
const org = 'torticity';
const since = '2024-01-01';
const until = '2024-01-31';

const headers = {
  'Authorization': `token ${token}`,
  'Accept': 'application/vnd.github.v3+json',
};

const RATE_LIMIT_REMAINING_HEADER = 'x-ratelimit-remaining';
const RATE_LIMIT_RESET_HEADER = 'x-ratelimit-reset';
const REQUEST_DELAY = 10000; 

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const checkRateLimit = async () => {
  const response = await axios.get('https://api.github.com/rate_limit', { headers });
  const remaining = parseInt(response.headers[RATE_LIMIT_REMAINING_HEADER], 10);
  const resetTime = parseInt(response.headers[RATE_LIMIT_RESET_HEADER], 10) * 1000;
  return { remaining, resetTime };
};

const fetchUsers = async () => {
  const url = `https://api.github.com/orgs/${org}/members`;
  const response = await axios.get(url, { headers });
  return response.data;
};

const fetchUserStats = async (username) => {
  const prReviewsUrl = `https://api.github.com/search/issues?q=reviewed-by:${username}+org:${org}+type:pr+created:${since}..${until}`;
  const prCommentsUrl = `https://api.github.com/search/issues?q=commenter:${username}+org:${org}+type:pr+created:${since}..${until}`;
  const commitsUrl = `https://api.github.com/search/commits?q=author:${username}+org:${org}+committer-date:${since}..${until}`;
  const prOpenedUrl = `https://api.github.com/search/issues?q=author:${username}+org:${org}+type:pr+created:${since}..${until}`;
  const prMergedUrl = `https://api.github.com/search/issues?q=author:${username}+org:${org}+type:pr+merged:${since}..${until}`;

  const [prReviews, prComments, commits, prOpened, prMerged] = await Promise.all([
    axios.get(prReviewsUrl, { headers }),
    delay(REQUEST_DELAY).then(() => axios.get(prCommentsUrl, { headers })),
    delay(REQUEST_DELAY).then(() => axios.get(commitsUrl, { headers })),
    delay(REQUEST_DELAY).then(() => axios.get(prOpenedUrl, { headers })),
    delay(REQUEST_DELAY).then(() => axios.get(prMergedUrl, { headers })),
  ]);


  return {
    username,
    prReviews: prReviews.data.total_count,
    prComments: prComments.data.total_count,
    commits: commits.data.total_count,
    prOpened: prOpened.data.total_count,
    prMerged: prMerged.data.total_count,
  };
};


const fetchStats = async () => {
  const { remaining, resetTime } = await checkRateLimit();
  
  if (remaining <= 0) {
    const waitTime = resetTime - Date.now();
    console.log(`Rate limit exceeded. Waiting for ${waitTime / 1000} seconds...`);
    await delay(waitTime);
  }

  const users = await fetchUsers();
  const statsPromises = users.map(user => fetchUserStats(user.login));
  const stats = await Promise.all(statsPromises);

  stats.sort((a, b) => b.prReviews - a.prReviews);

  const table = new Table({
    head: ['Username', '# PR Reviews', '# PR Comments', '# Commits', '# PR Opened', '# PR Merged'],
  });

  stats.forEach(stat => {
    table.push([
      stat.username,
      stat.prReviews,
      stat.prComments,
      stat.commits,
      stat.prOpened,
      stat.issuesCreated,
      stat.issuesClosed,
      stat.prMerged,
    ]);
  });

  console.log(table.toString());
};

fetchStats().catch(async (error) => {
  if (error.response && error.response.status === 403) {
    const resetTime = parseInt(error.response.headers[RATE_LIMIT_RESET_HEADER], 10) * 1000;
    const waitTime = resetTime - Date.now();
    console.log(`Rate limit exceeded. Waiting for ${waitTime / 1000} seconds...`);
    await delay(waitTime);
    fetchStats();
  } else {
    console.error(error);
  }
});
