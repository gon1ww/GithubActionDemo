const core = require("@actions/core");
const github = require("@actions/github");

async function run() {
  try {
    const token = core.getInput("github-token");
    const octokit = github.getOctokit(token);
    const context = github.context;

    if (!context.payload.pull_request) {
      core.info("Not a PR — skipping.");
      return;
    }

    const { owner, repo } = context.repo;
    const pull_number = context.payload.pull_request.number;

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number,
    });

    const todos = [];

    for (const file of files) {
      if (!file.patch) continue;

      const lines = file.patch.split("\n");
      lines.forEach((line, i) => {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          const match = line.match(/(TODO|FIXME|HACK)[:\s].+/i);
          if (match) {
            todos.push({
              file: file.filename,
              line: i + 1,
              text: match[0].trim(),
              type: match[1].toUpperCase(),
            });
          }
        }
      });
    }

    // 构建评论内容
    let body;
    if (todos.length === 0) {
      body = "✅ **TODO Checker:** No new TODO / FIXME / HACK comments found.";
    } else {
      const rows = todos
        .map((t) => `| \`${t.file}\` | ${t.line} | \`${t.type}\` | ${t.text} |`)
        .join("\n");
      body = `## TODO Checker found ${todos.length} item(s)\n\n| File | Diff line | Type | Comment |\n|------|-----------|------|---------|\n${rows}\n\n_Consider resolving these before merging._`;
    }

    // 查找已有的 bot 评论
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pull_number,
    });

    const botComment = comments.find(c =>
      c.user.type === "Bot" && c.body.includes("TODO Checker")
    );

    // 更新或新建
    if (botComment) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: botComment.id,
        body,
      });
      core.info("Updated existing comment.");
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pull_number,
        body,
      });
      core.info("Posted new comment.");
    }

    core.info(`Done. Found ${todos.length} item(s).`);
  } catch (err) {
    core.setFailed(err.message);
  }
}

run();