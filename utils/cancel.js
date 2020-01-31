const fetch = require('node-fetch');

const ref = process.env.GITHUB_REF.slice(11); // 'refs/heads/ci-cancel-previous',
const sha = process.env.GITHUB_SHA; // 'a5d18518ea755ddc4212f47ec3448f59e0e7e3a5',
const run = process.env.GITHUB_RUN_ID; // '33175268',
const name = process.env.GITHUB_WORKFLOW; // 'CI';
const token = process.env.GITHUB_WORKFLOW_TOKEN;
const workflow = 'continuous-integration.yml';
console.log({ ref, sha, run, name, workflow });

const url = `https://api.github.com/repos/zeit/now/actions/workflows/${workflow}/runs`;
const opts = {
  headers: {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `Bearer ${token}`,
  },
};

fetch(url, opts)
  .then(res => res.json())
  .then(data => {
    console.log(`Found ${data.total_count} checks total.`);
    const others = data.workflow_runs.filter(
      o =>
        o.head_branch === ref &&
        o.head_sha !== sha &&
        ['queued', 'in_progress'].includes(o.status)
    );
    console.log(`Found ${others.length} checks in progress.`);
    others.forEach(o => {
      const { id, cancel_url, head_branch, head_sha, status } = o;
      console.log('Cancelling another check: ', {
        id,
        cancel_url,
        head_branch,
        head_sha,
        status,
      });

      fetch(cancel_url, {
        ...opts,
        method: 'POST',
      })
        .then(res => console.log(`Status ${res.status}`))
        .catch(e => console.error(e));
    });
    console.log('Done.');
  })
  .catch(e => console.error(e));
