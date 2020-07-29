import core from "@actions/core";
import github from "@actions/github";
import exec from "@actions/exec";

// The maximum number of annotations that GitHub will accept in a single requrest
const maxAnnotations = 50;

async function submitResult({ octokit, conclusion, annotations }) {
  const output = {
    title: "Pylint",
    summary: `There are ${annotations.length} pylint warnings`,
  };

  // Create the check run and the first 50 annotations
  const result = await octokit.checks.create({
    ...github.context.repo,
    name: "Pylint",
    head_sha: github.context.sha,
    completed_at: new Date().toISOString(),
    conclusion: conclusion,
    output: {
      ...output,
      annotations: annotations.slice(0, maxAnnotations),
    },
  });

  // Submit additional annotations (if more than maxAnnotations)
  for (let i = 1; i < Math.ceil(annotations.length / maxAnnotations); i++) {
    await octokit.checks.update({
      ...github.context.repo,
      check_run_id: result.data.id,
      output: {
        ...output,
        annotations: annotations.slice(
          i * maxAnnotations,
          i * maxAnnotations + maxAnnotations
        ),
      },
    });
  }
}

async function getStdout(commandAndArgs, options) {
  let stdout = "";

  const [command, ...args] = commandAndArgs;

  await exec.exec(command, args, {
    listeners: {
      stdout: (data) => (stdout += data.toString()),
    },
    ignoreReturnCode: (options || {}).ignoreReturnCode || false,
  });

  return stdout.trim();
}

async function getModifiedPythonFiles(baseBranch) {
  // Get a list of files that have been Added, Modified, Renamed, or Copied
  // from the base branch.
  const files = await getStdout([
    "git",
    "diff",
    "--name-only",
    "--diff-filter=AMRC",
    baseBranch,
  ]);

  return files.split("\n").filter((filename) => filename.endsWith(".py"));
}

async function run() {
  try {
    // Initialize the octokit library with the specified Github token
    const githubToken = core.getInput("github-token", { required: true });
    const octokit = new github.GitHub(githubToken);

    // Figure out what files to check. This is either an explicit list of paths
    // to check or a branch to diff against. In the latter case we _only_ check
    // files ending in .py that have been modified.
    const diffAgainstBranch = core.getInput("diff-against-branch");
    const paths = diffAgainstBranch
      ? await getModifiedPythonFiles(diffAgainstBranch)
      : (core.getInput("paths") || ".").split(" ");

    // Run pylint if we have at least one path or file to check
    const output =
      paths.length > 0
        ? JSON.parse(
            await getStdout(["pylint", "--output-format=json", ...paths], {
              ignoreReturnCode: false,
            })
          )
        : [];

    // Convert the pylint output to Github annotations
    const annotations = output.map(function errorToAnnotation(error) {
      return {
        path: error.path,
        start_line: error.line,
        end_line: error.line,
        start_column: error.column,
        end_column: error.column,
        annotation_level: "failure", // TODO: Use error.type
        title: `${error.symbol} (${error["message-id"]})`,
        message: error.message,
      };
    });

    // Post the result to Github
    const conclusion = annotations.length > 0 ? "failure" : "success";
    await submitResult({ octokit, conclusion, annotations });
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
