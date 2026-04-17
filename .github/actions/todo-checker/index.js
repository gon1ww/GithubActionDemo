const core = require("@actions/core");
const github = require("@actions/github");

async function run() {
  try {
    const token = core.getInput("github-token");
    const octokit = github.getOctokit(token);
    const context = github.context;

    // Only run on pull requests
    if (!context.payload.pull_request) {
      core.info("Not a PR — skipping.");
      return;
    }

    const { owner, repo } = context.repo;
    const pull_number = context.payload.pull_request.number;

    // Fetch the PR diff
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number,
    });

    // Scan each changed file for TODO lines
    const todos = [];

    for (const file of files) {
      if (!file.patch) continue; // binary files have no patch

      const lines = file.patch.split("\n");
      lines.forEach((line, i) => {
        // Only check added lines (start with '+', not '++')
        if (line.startsWith("+") && !line.startsWith("+++")) {
          const match = line.match(/TODO[:\s].+/i);
          if (match) {
            todos.push({
              file: file.filename,
              line: i + 1,
              text: match[0].trim(),
            });
          }
        }
      });
    }

    // Build the comment body
    let body;
    if (todos.length === 0) {
      body = "✅ **TODO Checker:** No new TODO comments found in this PR.";
    } else {
      const rows = todos
        .map((t) => `| \`${t.file}\` | ${t.line} | \`${t.text}\` |`)
        .join("\n");
      body = `## TODO Checker found ${todos.length} TODO(s)\n\n| File | Diff line | Comment |\n|------|-----------|--------|\n${rows}\n\n_Consider resolving these before merging._`;
    }

    // Post the comment
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body,
    });

    core.info(`Done. Found ${todos.length} TODO(s).`);
  } catch (err) {
    core.setFailed(err.message);
  }
}

run();